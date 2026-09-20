import { load, type CheerioAPI } from "cheerio";
import { array, canonicalUrl, object, plainText, text, type JobLocation, type RawJob } from "./normalize.js";
import { extractNhsAdvert } from "./nhs.js";

export function detectAts(url: string): string {
  const host = new URL(url).hostname;
  if (/(^|\.)eploy\.net$/.test(host)) return "Eploy";
  if (/(^|\.)greenhouse\.io$/.test(host)) return "Greenhouse";
  if (/(^|\.)lever\.co$/.test(host)) return "Lever";
  if (/(^|\.)ashbyhq\.com$/.test(host)) return "Ashby";
  if (/(^|\.)myworkdayjobs\.com$/.test(host)) return "Workday";
  if (/(^|\.)smartrecruiters\.com$/.test(host)) return "SmartRecruiters";
  if (/(^|\.)recruitee\.com$/.test(host)) return "Recruitee";
  if (/(^|\.)workable\.com$/.test(host)) return "Workable";
  if (/(^|\.)icims\.com$/.test(host)) return "iCIMS";
  if (/(^|\.)taleo\.net$/.test(host)) return "Taleo";
  if (/(^|\.)jobs\.nhs\.uk$/.test(host)) return "NHS Jobs";
  return "Unknown";
}

function name(value: unknown): string {
  const entry = object(value);
  return text(value) || text(entry.name) || text(entry.value) || text(entry.identifier);
}

export function schemaLocations(value: unknown): JobLocation[] {
  return array(value).flatMap(item => {
    if (typeof item === "string") {
      return item.split(/\s*[;|]\s*|\s+\/\s+/).filter(Boolean).map(location => ({ location }));
    }
    const place = object(item);
    const addresses = array(place.address ?? place.postalAddress ?? place);
    return addresses.map(itemAddress => {
      if (typeof itemAddress === "string") return { location: itemAddress };
      const wrapped = object(itemAddress);
      const address = object(wrapped.postalAddress ?? wrapped);
      const city = text(address.addressLocality);
      const state = text(address.addressRegion);
      const country = name(address.addressCountry);
      const label = text(place.location) || text(place.name);
      return {
        location: label || [city, state, country].filter(Boolean).join(", "), city, state, country,
        postcode: text(address.postalCode), street: text(address.streetAddress),
      };
    });
  });
}

function salary(value: unknown): string {
  if (Array.isArray(value)) return value.map(salary).filter(Boolean).join("; ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  const pay = object(value);
  const amount = object(pay.value);
  const range = [text(amount.minValue), text(amount.maxValue)].filter(Boolean).join(" - ") ||
    text(amount.value) || text(pay.value);
  if (!range) return "";
  return [text(pay.currency), range, text(amount.unitText)].filter(Boolean).join(" ");
}

export function schemaJob(data: Record<string, unknown>, pageUrl: string, company = ""): RawJob {
  const workplace = text(data.jobLocationType);
  const remote = /TELECOMMUTE|remote/i.test(workplace);
  const locations = schemaLocations(data.jobLocation);
  if (remote && !locations.length) {
    for (const region of array(data.applicantLocationRequirements)) {
      const country = name(region);
      const types = array(object(region)["@type"]).map(text);
      if (types.includes("Country") || typeof region === "string") {
        locations.push({ location: `Remote, ${country}`, country });
      }
    }
  }
  const url = canonicalUrl(text(data.url), pageUrl) || pageUrl;
  let description = plainText(data.description);
  for (const [label, value] of [
    ["Responsibilities", data.responsibilities],
    ["Qualifications", data.qualifications],
    ["Benefits", data.jobBenefits],
  ] as const) {
    const section = plainText(value);
    if (section && !description.includes(section)) description += `\n\n${label}\n${section}`;
  }
  return {
    jobId: text(object(data.identifier).value) || name(data.identifier),
    title: plainText(data.title),
    description: description.trim(),
    roleDescription: plainText(data.description),
    jobUrl: url,
    postedDate: text(data.datePosted),
    jdDeadline: text(data.validThrough),
    company: name(data.hiringOrganization) || company,
    salaryRange: salary(data.baseSalary),
    employmentType: array(data.employmentType).map(text).filter(Boolean).join(", "),
    worktype: remote ? "Remote" : /hybrid/i.test(workplace) ? "Hybrid" :
      /on.?site/i.test(workplace) ? "On-site" : "",
    locations,
    ats: detectAts(url),
  };
}

export function jobsFromJson(value: unknown, pageUrl: string, company = "", requireExplicitUrl = false): RawJob[] {
  const jobs: RawJob[] = [];
  function visit(node: unknown, depth: number): void {
    if (depth > 30 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const data = object(node);
    if (array(data["@type"]).some(type => /(?:^|[/#])JobPosting$/.test(text(type)))) {
      const job = schemaJob(data, pageUrl, company);
      if (requireExplicitUrl && !text(data.url)) job.jobUrl = "";
      jobs.push(job);
      return;
    }
    for (const child of Object.values(data)) visit(child, depth + 1);
  }
  visit(value, 0);
  return jobs;
}

export interface Selectors {
  /** Optional container repeated once per job on list pages. */
  job?: string;
  jobLinks?: string;
  /** Restrict discovery to this selector plus pagination; do not follow global navigation. */
  jobLinksOnly?: string;
  next?: string;
  loadMore?: string;
  title?: string;
  description?: string;
  jobId?: string;
  jobUrl?: string;
  postedDate?: string;
  jdDeadline?: string;
  company?: string;
  salaryRange?: string;
  employmentType?: string;
  worktype?: string;
  /** Repeated location containers; city/state/country are read inside each one. */
  location?: string;
  city?: string;
  state?: string;
  country?: string;
}

function field($: CheerioAPI, selector: string | undefined, html = false): string {
  if (!selector) return "";
  const element = $(selector).first();
  return element.attr("content") || element.attr("datetime") ||
    (html ? plainText(element.html()) : element.text().trim());
}

function selectorJobs(html: string, url: string, selectors: Selectors, company: string): RawJob[] {
  const page = load(html);
  const containers = selectors.job ? page(selectors.job).toArray().map(node => page.html(node)) : [html];
  return containers.map(container => {
    const $ = load(container);
    const locations: JobLocation[] = [];
    if (selectors.location) {
      $(selectors.location).each((_, node) => {
        const location = load($.html(node));
        locations.push({
          location: $(node).text().trim(),
          city: field(location, selectors.city),
          state: field(location, selectors.state),
          country: field(location, selectors.country),
        });
      });
    } else if (selectors.country || selectors.city || selectors.state) {
      locations.push({ city: field($, selectors.city), state: field($, selectors.state), country: field($, selectors.country) });
    }
    const link = selectors.jobUrl ? $(selectors.jobUrl).first().attr("href") : "";
    const description = field($, selectors.description, true);
    return {
      jobId: field($, selectors.jobId), title: field($, selectors.title),
      description, roleDescription: description, jobUrl: canonicalUrl(link || url, url),
      postedDate: field($, selectors.postedDate), jdDeadline: field($, selectors.jdDeadline),
      company: field($, selectors.company) || company, salaryRange: field($, selectors.salaryRange),
      employmentType: field($, selectors.employmentType), worktype: field($, selectors.worktype),
      locations, ats: detectAts(url),
    };
  }).filter(job => job.title && job.description);
}

export function extractJobs(html: string, url: string, company = "", selectors?: Selectors): RawJob[] {
  const $ = load(html);
  const jobs: RawJob[] = [];
  jobs.push(...extractNhsAdvert(html, url));
  $('script[type="application/ld+json"], script[type="application/json"]').each((_, script) => {
    try {
      jobs.push(...jobsFromJson(JSON.parse($(script).text()), url, company));
    } catch {
      // One malformed script must not hide other valid JobPosting blocks.
    }
  });
  // Standard HTML microdata is a second path when JSON-LD is absent.
  $('[itemscope][itemtype$="/JobPosting"]').each((_, element) => {
    const scope = load($.html(element));
    const prop = (property: string): string => field(scope, `[itemprop="${property}"]`);
    const locations: JobLocation[] = [];
    scope('[itemprop="jobLocation"]').each((_, location) => {
      const loc = load(scope.html(location));
      locations.push({
        location: field(loc, '[itemprop="name"]'),
        city: field(loc, '[itemprop="addressLocality"]'),
        state: field(loc, '[itemprop="addressRegion"]'),
        country: field(loc, '[itemprop="addressCountry"]'),
      });
    });
    const hiring = scope('[itemprop="hiringOrganization"]');
    jobs.push({
      jobId: prop("identifier"), title: prop("title"),
      description: field(scope, '[itemprop="description"]', true),
      jobUrl: canonicalUrl(scope('[itemprop="url"]').attr("href") || url, url),
      postedDate: prop("datePosted"), jdDeadline: prop("validThrough"),
      company: hiring.find('[itemprop="name"]').text().trim() || hiring.text().trim() || company,
      salaryRange: prop("baseSalary"), employmentType: prop("employmentType"),
      worktype: /TELECOMMUTE/i.test(prop("jobLocationType")) ? "Remote" : "",
      locations, ats: detectAts(url),
    });
  });
  if (selectors) jobs.push(...selectorJobs(html, url, selectors, company));
  // Eploy's public job URLs contain the same numeric VacancyID as its Apply links.
  // Detect the actual site platform; do not infer it from spreadsheet labels.
  if (/fcVacancyDetails/.test(html) && ($('a[href*="eploy"]').length ||
      ($('[id$="h1JobTitle"]').length && $('[id$="fcVacancyDetailsDescription_VacV_Description"]').length))) {
    const primaryField = (suffix: string): string => {
      const node = $("[id]").filter((_, node) => {
        const id = $(node).attr("id") || "";
        return id.endsWith(suffix) && !/related|Suggested/i.test(id) && !/^(?:li|div)_/.test(id);
      }).first();
      return node.attr("content") || node.attr("datetime") || node.text().replace(/\s+/g, " ").trim();
    };
    const supplied = (value: string): string => /^(not specified|please select|n\/a)$/i.test(value) ? "" : value;
    // Some Eploy installations disable JSON-LD but retain the same public
    // detail fields. Never interpret listing cards or suggested jobs as details.
    const detailTitle = primaryField("h1JobTitle");
    const role = primaryField("VacV_Description");
    if (!jobs.length && detailTitle && role && /\/vacancies\/\d+\//.test(url)) {
      const location = supplied(primaryField("AllLocations_lblReadonlySelected")) ||
        supplied(primaryField("VacV_Town")) || supplied(primaryField("VacV_LocationID"));
      const postcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.exec(location)?.[0] || "";
      jobs.push({
        title: detailTitle,
        description: [
          role, primaryField("VacV_Qualifications"), primaryField("VacV_Benefits"),
        ].filter(Boolean).join("\n\n"),
        roleDescription: role, jobUrl: url, company,
        locations: [{ location, postcode }],
        jdDeadline: $('[data-id="div_content_VacV_AdvertisingEndDate"]').first().text().trim(),
      });
    }
    for (const job of jobs) {
      job.ats = "Eploy";
      job.jobId ||= /\/vacancies\/(\d+)\//.exec(job.jobUrl)?.[1] || "";
      job.visibleLocation = supplied(primaryField("AllLocations_lblReadonlySelected")) ||
        supplied(primaryField("VacV_Town")) || supplied(primaryField("VacV_LocationID"));
      job.salaryRange = supplied(primaryField("VacV_DisplaySalary")) || job.salaryRange;
      job.employmentType = supplied(primaryField("VacV_VacancyTypeID")) || job.employmentType;
      job.jdDeadline ||= supplied(primaryField("DQAdvertisingEndDate"));
      job.postedDate ||= supplied(primaryField("DateCareersAdvertised"));
      if (!job.worktype) {
        // Do not infer Hybrid from generic, job-dependent benefits.
        const role = job.roleDescription || "";
        if (/\bhybrid working (?:is )?available\b|\bhybrid (?:role|position|working pattern)\b/i.test(role)) job.worktype = "Hybrid";
        else if (/\b(?:fully remote|remote[- ]working (?:role|position)|home[- ]based (?:role|position))\b/i.test(role)) job.worktype = "Remote";
        else if (/\b(?:fully|entirely) on[- ]site\b|\bon[- ]site (?:role|position)\b/i.test(role)) job.worktype = "On-site";
      }
    }
  }
  return jobs;
}

const careers = /(?:career|jobs?|vacanc|opportunit|openings?|join[-_ ]?us|positions?|recruit)/i;
export function discoverLinks(html: string, pageUrl: string, selectors?: Selectors): string[] {
  const $ = load(html);
  const links = new Set<string>();
  const add = (href: string | undefined): void => {
    const url = href && canonicalUrl(href, pageUrl);
    if (url && !/\.(?:pdf|zip|png|jpg|svg|mp4|docx?)(?:\?|$)/i.test(url) &&
        !/(?:^|\/)(?:vacancy-apply\.aspx|registration\.aspx|apply|application|login|signin)(?:\/|[?#]|$)/i.test(url)) links.add(url);
  };
  $("a[href], iframe[src]").each((_, node) => {
    const element = $(node);
    const href = element.attr("href") || element.attr("src") || "";
    const absolute = canonicalUrl(href, pageUrl);
    if (!absolute) return;
    const label = element.text().trim();
    const isSameOrigin = new URL(absolute).origin === new URL(pageUrl).origin;
    const target = new URL(absolute);
    if (selectors?.jobLinksOnly) {
      // A configured listing must not escape through "all jobs", category,
      // related-job or careers-navigation links. Keep its ordinary pagination.
      if (isSameOrigin && (element.attr("rel") === "next" || /^(?:next(?: page)?|[2-9]\d*)$/i.test(label))) add(absolute);
      return;
    }
    if (detectAts(absolute) !== "Unknown" || careers.test(target.pathname + target.search) || careers.test(label) ||
      (isSameOrigin && (element.attr("rel") === "next" || /^(?:next(?: page)?|[2-9]\d*)$/i.test(label)))) {
      // Application forms are never needed for job extraction.
      if (!/(?:^|\/)(?:apply|application|login|signin)(?:\/|[?#]|$)/i.test(absolute)) add(absolute);
    }
  });
  for (const selector of [selectors?.jobLinksOnly || selectors?.jobLinks, selectors?.next]) {
    if (selector) $(selector).each((_, node) => add($(node).attr("href")));
  }
  $('link[rel="alternate"][type="application/json"], a[rel="alternate"][type="application/json"]').each((_, node) => add($(node).attr("href")));
  return [...links];
}
