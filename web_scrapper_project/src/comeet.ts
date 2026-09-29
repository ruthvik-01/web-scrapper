import { load } from "cheerio";
import { AccessPolicy, type ScrapeOptions } from "./crawl.js";
import { Geography } from "./geography.js";
import { array, object, text, plainText, canonicalUrl, dateWindow, normalizeJobs, type RawJob } from "./normalize.js";

/** Read JSON literals only. Never execute scripts supplied by a careers site. */
function assignment(html: string, name: string): unknown {
  const $ = load(html);
  for (const element of $("script").toArray()) {
    const match = new RegExp(`(?:^|\\n)\\s*(?:var\\s+)?${name}\\s*=\\s*([^\\n]+);\\s*(?:\\n|$)`).exec($(element).text());
    if (match) return JSON.parse(match[1]!);
  }
  throw new Error(`Missing Comeet ${name} JSON assignment.`);
}

export function decodeComeet(html: string, url: string) {
  const company = object(assignment(html, "COMPANY_DATA"));
  const positions = assignment(html, "COMPANY_POSITIONS_DATA");
  if (!text(company.name) || !Array.isArray(positions)) throw new Error("Unsupported Comeet board data.");
  const jobs: RawJob[] = [];
  const sourceFields: { jobId: string; jobUrl: string; time_updated: string | null; is_remote: boolean | null; employment_type: string | null; workplace_type: string | null }[] = [];
  const excluded: { jobId: string; jobUrl: string; title: string; reason: string }[] = [];
  for (const value of positions) {
    const p = object(value);
    const location = object(p.location);
    const fields = object(p.custom_fields);
    const details = array(fields.details).map(object);
    const description = details.filter(d => plainText(d.value))
      .map(d => `${text(d.name)}\n${plainText(d.value)}`).join("\n\n");
    const jobUrl = canonicalUrl(text(p.url_comeet_hosted_page) || text(p.url_recruit_hosted_page), url);
    if (!text(p.uid) || !text(p.name) || !jobUrl) throw new Error("Incomplete Comeet position identity.");
    let reason = "";
    if (p.is_internal === true) reason = "internal_only";
    if (/demo environment[\s\S]*not associated with a real employer/i.test(description)) reason = "explicit_demo_not_real_vacancy";
    if (/^Didn't find anything that suits you\??$/i.test(text(p.name))) reason = "general_interest_not_specific_vacancy";
    if (reason) {
      excluded.push({ jobId: text(p.uid), jobUrl, title: text(p.name), reason });
      continue;
    }
    const field = (pattern: RegExp) => plainText([...details, ...array(fields.categories).map(object)]
      .find(d => pattern.test(text(d.name)))?.value);
    // A bracketed arrangement is not a city (e.g. "UK [Remote]").
    const locationLabel = text(location.name).replace(/\s*[\[(](?:remote|hybrid|on-site)[\])]\s*$/i, "");
    const updated = text(p.time_updated);
    const remote = typeof location.is_remote === "boolean" ? location.is_remote : null;
    const workplace = text(p.workplace_type);
    const worktype = workplace || (remote === true ? "Remote" : remote === false ? "On-site" : "");
    const employmentType = text(p.employment_type) || field(/^(employment type|employment_type)$/i);
    const notes = ["Per user instruction, postedDate represents Comeet time_updated (last modification), not publication; the two-month window applies to that update date."];
    if (!updated) notes.push("Missing time_updated; excluded rather than assigning the scrape date.");
    if (!workplace && remote !== null) notes.push(`worktype derived from location.is_remote=${remote}.`);
    if ((remote === false && /^(remote|hybrid)$/i.test(workplace)) || (remote === true && /^on-?site$/i.test(workplace))) {
      notes.push(`Source conflict: workplace_type="${workplace}" and location.is_remote=${remote}; preserve the explicit workplace field.`);
    }
    if (!employmentType) notes.push("Source employment_type is missing; no employment type inferred.");
    sourceFields.push({
      jobId: text(p.uid), jobUrl, time_updated: updated || null, is_remote: remote,
      employment_type: text(p.employment_type) || null, workplace_type: workplace || null,
    });
    let city = text(location.city);
    if (/^(remote|hybrid|on-?site)$/i.test(city)) {
      notes.push(`Source city "${city}" is a work arrangement; use only the separate source location label as geographic evidence.`);
      city = "";
    }
    let state = text(location.state);
    if (/^(GB|UK|United Kingdom)$/i.test(text(location.country)) && /^(GB|UK|United Kingdom)$/i.test(state)) {
      notes.push(`Source state "${state}" repeats the country; leave state empty rather than invent a region.`);
      state = "";
    }
    if (/\bremote\b/i.test(text(location.name)) && /^on-site$/i.test(text(p.workplace_type))) {
      notes.push(`Source conflict: location "${text(location.name)}" but workplace_type is On-site; preserve the explicit workplace field.`);
    }
    jobs.push({
      jobId: text(p.uid), title: text(p.name), description, roleDescription: description,
      jobUrl, company: text(p.company_name) || text(company.name),
      // An invalid nonempty marker ensures missing updates cannot trigger a fabricated date fallback.
      postedDate: updated || "Missing Comeet time_updated",
      jdDeadline: field(/^(closing date|application deadline|deadline)$/i),
      salaryRange: field(/^(salary|salary range|compensation)$/i),
      employmentType, worktype,
      visibleLocation: text(location.name),
      locations: [{
        location: locationLabel, city, state,
        country: text(location.country), postcode: text(location.postal_code),
        street: text(location.street_name),
      }],
      notes,
    });
  }
  return { jobs, excluded, sourceFields, advertised: positions.length,
    sourceCompany: { name: text(company.name), website: text(company.website) } };
}

export async function extractComeetBoard(html: string, url: string, options: ScrapeOptions = {}) {
  const now = options.now || new Date();
  const decoded = decodeComeet(html, url);
  const geo = new Geography();
  const resolved: RawJob[] = [];
  for (const job of decoded.jobs) resolved.push(await geo.resolve(job));
  const normalized = normalizeJobs(resolved, now);
  return { rows: normalized.rows, rawJobs: decoded.jobs, report: {
    sourceUrl: url, process: "STATIC Comeet", scrapedAt: now.toISOString(), window: dateWindow(now),
    status: normalized.rows.length ? "ok" : "no_matches", pagesVisited: 1, requests: 1,
    candidates: decoded.jobs.length, advertisedPositions: decoded.advertised, rows: normalized.rows.length,
    limited: false, pendingUrls: [] as string[], issues: [] as { url: string; message: string }[],
    skipped: normalized.skipped, dateFallbacks: normalized.dateFallbacks,
    dataNotes: normalized.dataNotes, locationEvidence: geo.evidence,
    nonVacancyExcluded: decoded.excluded, sourceCompany: decoded.sourceCompany,
    dateBasis: "Comeet time_updated (last modification), converted to Europe/London calendar date",
    sourceFields: decoded.sourceFields,
  } };
}

export async function scrapeComeet(url: string, options: ScrapeOptions = {}) {
  const parsed = new URL(url);
  const match = /^\/jobs\/([^/]+)\/([^/]+)/.exec(parsed.pathname);
  if (!match) throw new Error("Unsupported Comeet board URL.");
  const boardUrl = `${parsed.origin}/jobs/${match[1]}/${match[2]}/`;
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 30000);
  const response = await policy.html(boardUrl);
  return extractComeetBoard(response.body, response.url, options);
}
