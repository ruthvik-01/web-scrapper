/**
 * ATS / career-platform detection and adapters.
 *
 * The pipeline is ATS-agnostic: a careers URL is detected, a platform adapter
 * (when one exists) turns the platform's public data into normalized RawJobs,
 * and every job then flows through the same per-job extraction -> Jev decision
 * -> storage pipeline as any other source. Unknown platforms fall through to
 * the generic sitemap/crawl/JSON-LD strategies: detection never fails the run
 * on its own, and the generic fallback stays available.
 *
 * Adapters only read public, unauthenticated endpoints: the same JSON the
 * platform's own careers page consumes, or the public payload embedded in the
 * page HTML. Nothing here bypasses logins, CAPTCHAs or access controls.
 */
import type { Http } from "./fetch.js";

import { load } from "cheerio";
import { array, canonicalUrl, object, plainText, text, type JobLocation, type RawJob } from "./normalize.js";

export interface AtsDetection {
  /** Display label recorded on rows and in the report (e.g. "Greenhouse"). */
  ats: string;
  /** Platform account/board identifier when one is known. */
  slug: string;
  /** "api": adapter fetches a public JSON feed; "embed": adapter reads the
   *  careers page's embedded public payload; "label": detection only, so the
   *  generic strategies collect the jobs. */
  kind: "api" | "embed" | "label";
}

/** Detect a known ATS/career platform from a careers URL. */
export function detectAts(url: string): AtsDetection | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  const first = parsed.pathname.split("/").filter(Boolean)[0] || "";

  if (["boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io", "job-boards.eu.greenhouse.io"].includes(host)) {
    const slug = first === "embed" ? text(parsed.searchParams.get("for")) : first;
    if (slug) return { ats: "Greenhouse", slug, kind: "api" };
  }
  if (["jobs.lever.co", "jobs.eu.lever.co", "hire.lever.co"].includes(host) && first) {
    return { ats: "Lever", slug: first, kind: "api" };
  }
  if (host === "jobs.ashbyhq.com" && first) return { ats: "Ashby", slug: first, kind: "api" };
  if (host === "apply.workable.com" && first && first !== "j") return { ats: "Workable", slug: first, kind: "api" };
  if (["jobs.smartrecruiters.com", "www.smartrecruiters.com", "careers.smartrecruiters.com"].includes(host) && first) {
    return { ats: "SmartRecruiters", slug: first, kind: "api" };
  }
  if (host.endsWith(".bamboohr.com") && host.split(".").length >= 3) {
    return { ats: "BambooHR", slug: host.split(".")[0]!, kind: "api" };
  }
  if ((host === "jobs.jobvite.com" && first) || host.endsWith(".jobvite.com")) {
    return { ats: "Jobvite", slug: host === "jobs.jobvite.com" ? first : host.split(".")[0]!, kind: "api" };
  }
  if (/(^|\.)zohorecruit\.(com|eu|in|ca|jp|com\.au|com\.cn)$/i.test(host)) {
    return { ats: "Zoho Recruit", slug: host.split(".")[0]!, kind: "embed" };
  }
  const workday = /^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/i.exec(host) || /^([^.]+)\.myworkdaysite\.com$/i.exec(host);
  if (workday && first) return { ats: "Workday", slug: `${workday[1]}/${first}`, kind: "api" };
  if (host.endsWith(".icims.com")) return { ats: "iCIMS", slug: host.split(".")[0]!, kind: "label" };
  if (/hcmdirect/i.test(host)) return { ats: "HCMDirect", slug: host.split(".")[0]!, kind: "label" };
  return undefined;
}

/** Adapter result: normalized job seeds ready for the per-job Jev pipeline. */
export interface AtsCollection {
  jobs: RawJob[];
  /** How the jobs were obtained, for the report's process label. */
  source: string;
}

/**
 * Collect normalized job seeds from a detected platform. Throws with a useful
 * reason when the platform's public data cannot be read; the caller then
 * continues with the generic fallback strategies.
 */
export async function collectAtsJobs(
  detection: AtsDetection,
  careersUrl: string,
  http: Http,
  log: (line: string) => void,
): Promise<AtsCollection> {
  const { ats, slug } = detection;
  if (ats === "Greenhouse") {
    const eu = /\.eu\./.test(new URL(careersUrl).hostname) ? ".eu" : "";
    const data = await http.json(`https://boards-api${eu}.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
    const jobs = mapGreenhouse(data.body);
    if (!jobs.length) throw new Error("Greenhouse board returned no jobs.");
    return { jobs, source: "Greenhouse board API" };
  }
  if (ats === "Lever") {
    const eu = new URL(careersUrl).hostname.includes(".eu.") ? "eu." : "";
    const data = await http.json(`https://api.${eu}lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    const jobs = mapLever(data.body);
    if (!jobs.length) throw new Error("Lever postings API returned no jobs.");
    return { jobs, source: "Lever postings API" };
  }
  if (ats === "Ashby") {
    const data = await http.json(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
    const jobs = mapAshby(data.body);
    if (!jobs.length) throw new Error("Ashby job board API returned no jobs.");
    return { jobs, source: "Ashby job board API" };
  }
  if (ats === "Workable") {
    const data = await http.json(`https://www.workable.com/api/accounts/${encodeURIComponent(slug)}?details=true`);
    const jobs = mapWorkable(data.body);
    if (!jobs.length) throw new Error("Workable account API returned no jobs.");
    return { jobs, source: "Workable account API" };
  }

  if (ats === "SmartRecruiters") {
    const jobs: RawJob[] = [];
    for (let offset = 0; ; offset += 100) {
      const data = await http.json(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100&offset=${offset}`);
      const page = mapSmartRecruiters(data.body, slug);
      jobs.push(...page.jobs);
      if (!page.total || offset + 100 >= page.total) break;
    }
    if (!jobs.length) throw new Error("SmartRecruiters postings API returned no jobs.");
    return { jobs, source: "SmartRecruiters postings API" };
  }
  if (ats === "Workday") {
    const [tenant, site] = slug.split("/");
    const origin = new URL(careersUrl).origin;
    const jobs: RawJob[] = [];
    for (let offset = 0; ; offset += 100) {
      const data = await http.postJson(
        `${origin}/wday/cxs/${encodeURIComponent(tenant!)}/${encodeURIComponent(site!)}/jobs`,
        { appliedFacets: {}, limit: 100, offset, searchText: "" });
      const page = mapWorkdayListing(data.body, origin);
      jobs.push(...page.jobs);
      if (!page.total || offset + 100 >= page.total) break;
    }
    if (!jobs.length) throw new Error("Workday jobs endpoint returned no postings.");
    // Detail payloads carry the advert body; fetch them paced, then each job
    // continues through the same per-job Jev decision as any other source.
    const full: RawJob[] = [];
    for (const seed of jobs) {
      try {
        const path = new URL(seed.jobUrl).pathname;
        const detail = await http.json(`${origin}/wday/cxs/${encodeURIComponent(tenant!)}/${encodeURIComponent(site!)}${path}`);
        full.push(mergeWorkdayDetail(seed, detail.body));
      } catch {
        full.push(seed); // judged from listing fields; missing body is disclosed downstream
      }
    }
    return { jobs: full, source: "Workday recruitment API" };
  }
  if (ats === "BambooHR") {
    const data = await http.json(`https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`);
    const jobs = mapBambooHr(data.body, slug);
    if (!jobs.length) throw new Error("BambooHR careers list returned no jobs.");
    return { jobs, source: "BambooHR careers list" };
  }
  if (ats === "Jobvite") {
    const data = await http.json(`https://jobs.jobvite.com/${encodeURIComponent(slug)}/jobs/all`);
    const jobs = mapJobvite(data.body, slug);
    if (!jobs.length) throw new Error("Jobvite jobs feed returned no jobs.");
    return { jobs, source: "Jobvite jobs feed" };
  }
  if (ats === "Zoho Recruit") {
    const board = await http.html(careersUrl);
    const records = decodeZohoJobs(board.body);
    // The board's embedded meta names the recruiting organisation; with it the
    // employer-scope gate can verify scope deterministically instead of
    // relying only on the Jev arbiter question.
    const orgName = zohoOrgName(board.body);
    const jobs = records
      .filter(record => record.Publish !== false && record.Is_Locked !== true)
      .map(record => ({ ...zohoJob(record, zohoJobUrl(board.url, record)), ...(orgName ? { company: orgName } : {}) }));
    if (!jobs.length) throw new Error("Zoho Recruit board exposed no published jobs.");
    log(`Zoho Recruit board exposes ${jobs.length} published jobs${orgName ? ` for ${orgName}` : ""}.`);
    return { jobs, source: "Zoho Recruit embedded board" };
  }
  throw new Error(`No ${ats} adapter is available; using the generic strategies.`);
}

// --- Payload mappers (pure; unit-tested without network) ---------------------

function locationsFrom(value: unknown): JobLocation[] {
  return array(value).map(item => {
    if (typeof item === "string") return { location: item };
    const place = object(item);
    const city = text(place.city ?? place.addressLocality ?? place.name);
    const state = text(place.state ?? place.region ?? place.addressRegion);
    const country = text(place.country ?? place.countryCode ?? place.addressCountry);
    return {
      location: [city, state, country].filter(Boolean).join(", ") || text(place.name),
      city, state, country, postcode: text(place.postalCode ?? place.zipCode),
    };
  }).filter(location => location.location || location.city || location.country);
}

export function mapGreenhouse(payload: unknown): RawJob[] {
  return array(object(payload).jobs).map(object).map(job => ({
    jobId: text(job.id), title: text(job.title), description: plainText(job.content),
    jobUrl: canonicalUrl(text(job.absolute_url)),
    postedDate: "", // updated_at is an edit timestamp, not a posting date.
    locations: locationsFrom(text(object(job.location).name)),
    locationText: text(object(job.location).name),
    ats: "Greenhouse",
  })).filter(job => job.title && job.jobUrl);
}

export function mapLever(payload: unknown): RawJob[] {
  return array(payload).map(object).map(job => {
    const categories = object(job.categories);
    const locations = locationsFrom(categories.allLocations ?? categories.location);
    return {
      jobId: text(job.id), title: text(job.text),
      description: [
        plainText(job.descriptionPlain || job.description),
        ...array(job.lists).map(item => {
          const section = object(item);
          return [text(section.text), plainText(section.content)].filter(Boolean).join("\n");
        }),
        plainText(job.additionalPlain || job.additional),
      ].filter(Boolean).join("\n\n"),
      jobUrl: canonicalUrl(text(job.hostedUrl)),
      postedDate: "", // Lever's public postings API does not guarantee a publication date.
      salaryText: [text(object(job.salaryRange).currency),
        [text(object(job.salaryRange).min), text(object(job.salaryRange).max)].filter(Boolean).join("-"),
        text(object(job.salaryRange).interval)].filter(Boolean).join(" "),
      employmentType: text(categories.commitment), worktype: text(job.workplaceType),
      locations, locationText: locations.map(location => location.location).filter(Boolean).join("; "),
      ats: "Lever",
    };
  }).filter(job => job.title && job.jobUrl);
}

export function mapAshby(payload: unknown): RawJob[] {
  return array(object(payload).jobs).map(object).filter(job => job.isListed !== false).map(job => {
    const locations = [
      ...locationsFrom([object(job.location).name || object(job.location).location]),
      ...array(job.secondaryLocations).flatMap(item => locationsFrom([object(item).location])),
    ];
    return {
      jobId: text(job.id), title: text(job.title),
      description: plainText(job.descriptionHtml || job.descriptionPlain),
      jobUrl: canonicalUrl(text(job.jobUrl)),
      postedDate: text(job.publishedAt),
      salaryText: text(object(job.compensation).scrapeableCompensationSalarySummary),
      employmentType: text(job.employmentType),
      worktype: text(job.workplaceType) || (job.isRemote === true ? "Remote" : ""),
      locations, locationText: locations.map(location => location.location).filter(Boolean).join("; "),
      ats: "Ashby",
    };
  }).filter(job => job.title && job.jobUrl);
}

export function mapWorkable(payload: unknown): RawJob[] {
  const data = object(payload);
  const company = text(data.name);
  return array(data.jobs).map(object).map(job => ({
    jobId: text(job.shortcode), title: text(job.title), description: plainText(job.description),
    jobUrl: canonicalUrl(text(job.url)), company,
    postedDate: text(job.published_on), employmentType: text(job.employment_type),
    worktype: text(job.workplace_type) || (job.telecommuting === true ? "Remote" : ""),
    locations: locationsFrom(job.locations), locationText: text(job.location) || text(object(job.location).city),
    ats: "Workable",
  })).filter(job => job.title && job.jobUrl);
}

export function mapSmartRecruiters(payload: unknown, slug: string): { jobs: RawJob[]; total: number } {
  const data = object(payload);
  const jobs = array(data.content).map(object).map(job => {
    const location = object(job.location);
    return {
      jobId: text(job.id), title: text(job.name),
      description: "", // listing carries no body; the job page is fetched per job
      jobUrl: canonicalUrl(`https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${text(job.id)}`),
      postedDate: text(job.releasedDate), employmentType: text(object(job.typeOfEmployment).label),
      worktype: job.remoteLocation === true ? "Remote" : "",
      locations: locationsFrom([location]), locationText: text(location.city),
      ats: "SmartRecruiters",
    };
  }).filter(job => job.title && job.jobUrl);
  return { jobs, total: Number(data.totalFound) || jobs.length };
}

export function mapWorkdayListing(payload: unknown, origin: string): { jobs: RawJob[]; total: number } {
  const data = object(payload);
  const jobs = array(data.jobPostings).map(object).map(job => {
    const path = text(job.externalPath);
    return {
      jobId: text(array(job.bulletFields)[0]) || path.split("/").pop() || "",
      title: text(job.title), description: "", // detail payload fetched per job
      jobUrl: canonicalUrl(`${origin}${path}`),
      postedDate: /^posted/i.test(text(job.postedOn)) ? "" : text(job.postedOn),
      locationText: text(job.locationsText),
      locations: locationsFrom([text(job.locationsText)]),
      ats: "Workday",
    };
  }).filter(job => job.title && job.jobUrl);
  return { jobs, total: Number(data.total) || jobs.length };
}

function mergeWorkdayDetail(seed: RawJob, payload: unknown): RawJob {
  const info = object(object(payload).jobPostingInfo);
  const locations = locationsFrom(array(info.additionalLocations).length
    ? [info.location, ...array(info.additionalLocations)]
    : [info.location]);
  return {
    ...seed,
    description: plainText(info.jobDescription) || seed.description,
    postedDate: text(info.startDate) || seed.postedDate,
    jobId: text(info.jobReqId) || seed.jobId,
    employmentType: text(info.timeType) || seed.employmentType,
    worktype: text(info.locationType) || seed.worktype,
    locations: locations.length ? locations : seed.locations,
    locationText: locations.map(location => location.location).filter(Boolean).join("; ") || seed.locationText,
  };
}

export function mapBambooHr(payload: unknown, slug: string): RawJob[] {
  const list = array(object(payload).result ?? payload);
  return list.map(object).map(job => ({
    jobId: text(job.id), title: text(job.jobOpeningName ?? job.title),
    description: plainText(job.description),
    jobUrl: canonicalUrl(`https://${encodeURIComponent(slug)}.bamboohr.com/careers/${text(job.id)}`),
    postedDate: text(job.dateOpened ?? job.postedDate),
    employmentType: text(job.employmentStatusLabel ?? job.employmentType),
    locations: locationsFrom([job.location]), locationText: text(object(job.location).city ?? job.location),
    ats: "BambooHR",
  })).filter(job => job.title && job.jobUrl);
}

export function mapJobvite(payload: unknown, slug: string): RawJob[] {
  const list = array(object(payload).jobs ?? payload);
  return list.map(object).map(job => ({
    jobId: text(job.id ?? job.eId), title: text(job.title),
    description: plainText(job.description ?? job.briefDescription),
    jobUrl: canonicalUrl(text(job.applyUrl ?? job.url) || `https://jobs.jobvite.com/${encodeURIComponent(slug)}/job/${text(job.id)}`),
    postedDate: text(job.date ?? job.postedDate), employmentType: text(job.jobType),
    locations: locationsFrom([job.location]), locationText: text(job.location),
    ats: "Jobvite",
  })).filter(job => job.title && job.jobUrl);
}

/** Decode a Zoho Recruit board's embedded public payload; never evaluates JS. */
export function decodeZohoJobs(html: string): Record<string, unknown>[] {
  const hidden = /id=["']jobs["'][^>]*value=["']((?:\\[\s\S]|[^"\\])*)["']/.exec(html)?.[1];
  const literal = /\bvar\s+jobs\s*=\s*JSON\.parse\('((?:\\[\s\S]|[^'\\])*)'\)/.exec(html)?.[1];
  const raw = literal ?? hidden;
  if (raw === undefined) throw new Error("No supported Zoho Recruit public job payload.");
  const decoded = literal
    ? raw.replace(/\\(x[\da-f]{2}|u[\da-f]{4}|[\s\S])/gi, (_, code: string) => {
        if (/^[xu]/i.test(code) && code.length > 1) return String.fromCharCode(parseInt(code.slice(1), 16));
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "" };
        return escapes[code] ?? code;
      })
    : raw.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const jobs: unknown = JSON.parse(decoded);
  if (!Array.isArray(jobs)) throw new Error("Zoho Recruit jobs payload is not an array.");
  return jobs.map(object);
}

/** The recruiting organisation named in a Zoho board's embedded meta payload. */
export function zohoOrgName(html: string): string {
  const $ = load(html);
  const metaValue = $("input#meta").attr("value") || "";
  if (!metaValue) return "";
  try {
    const decoded = metaValue.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return text(object(object(JSON.parse(decoded)).org_info).company_name);
  } catch {
    return "";
  }
}

/** Public detail URL for one Zoho Recruit record. */
export function zohoJobUrl(boardUrl: string, record: Record<string, unknown>): string {
  const title = text(record.Posting_Title).replace(/\s/g, "-");
  return `${boardUrl.replace(/\/$/, "")}/${encodeURIComponent(text(record.id))}/${encodeURIComponent(title)}?source=CareerSite`;
}

/** Normalize one Zoho Recruit record into the shared RawJob shape. */
export function zohoJob(record: Record<string, unknown>, jobUrl: string): RawJob {
  const description = [
    plainText(record.Job_Description),
    record.Requirements ? `Requirements\n${plainText(record.Requirements)}` : "",
    record.Benefits ? `Benefits\n${plainText(record.Benefits)}` : "",
  ].filter(Boolean).join("\n\n");
  const location = {
    city: text(record.City), state: text(record.State),
    country: text(record.Country), postcode: text(record.Zip_Code),
  };
  return {
    jobId: text(record.id), title: text(record.Posting_Title),
    description, jobUrl,
    postedDate: text(record.Date_Opened),
    salaryText: text(record.Salary), employmentType: text(record.Job_Type),
    // A false remote flag does not distinguish Hybrid from On-site.
    worktype: record.Remote_Job === true ? "Remote" : "",
    locations: [location],
    locationText: [location.city, location.state, location.country].filter(Boolean).join(", "),
    ats: "Zoho Recruit",
  };
}
