import { load, type CheerioAPI } from "cheerio";
import { array, canonicalUrl, object, plainText, text, type JobLocation, type RawJob } from "./normalize.js";
import { extractNhsAdvert } from "./nhs.js";

export function detectAts(url: string): string {
  const host = new URL(url).hostname;
  if (/(^|\.)zohorecruit\.(com|eu|in|ca|jp|com\.au|com\.cn)$/.test(host) || /(^|\.)zohorecruit\.com$/.test(host)) return "Zoho Recruit";
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

function idFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const match = /(?:^|[-/])(\d+)(?:\.[a-z0-9]+)?\/?$/i.exec(decodeURIComponent(url.pathname));
    if (match) return match[1]!;
    const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const last = segments.at(-1) || "";
    if (/(?:^|\/)positions?\/[^/]+\/?$/i.test(url.pathname) &&
        /^[A-Za-z0-9_-]{12,}$/.test(last) && /\d/.test(last)) return last;
    for (const key of ["job", "job_id", "posting", "posting_id", "vacancy", "vacancy_id", "id"]) {
      const value = url.searchParams.get(key);
      if (value && /^\d+$/.test(value)) return value;
    }
    return "";
  } catch { return ""; }
}

function vacancyIdFromUrl(value: string): string {
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    return /\/Jobs\/Advert\/(\d+)(?:\/|$)/i.exec(path)?.[1] ||
      /\/vacanc(?:y|ies)\/[^/]*?-(\d+)\/?$/i.exec(path)?.[1] || "";
  } catch { return ""; }
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
  const sourceUrl = text(data.url);
  const url = canonicalUrl(sourceUrl, pageUrl) || pageUrl;
  let description = plainText(data.description);
  for (const [label, value] of [
    ["Responsibilities", data.responsibilities],
    ["Qualifications", data.qualifications],
    ["Benefits", data.jobBenefits],
  ] as const) {
    const section = plainText(value);
    if (section && !description.includes(section)) description += `\n\n${label}\n${section}`;
  }
  const identifier = text(object(data.identifier).value) || text(object(data.identifier).name) ||
    (typeof data.identifier === "string" ? text(data.identifier) : "");
  return {
    jobId: identifier && !/^(?:https?:)?\/\//i.test(identifier) && !identifier.startsWith("/")
      ? identifier : sourceUrl ? idFromUrl(url) : "",
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
  if (!jobs.length && /\/(?:jobs?|careers?|vacanc(?:y|ies)|positions?|roles?)\//i.test(new URL(url).pathname)) {
    const roleTitle = $('main h1.job-title').first();
    const roleBody = roleTitle.parent().children('div').filter((_, node) => plainText($(node).html()).length >= 40).first();
    const roleDescription = plainText(roleBody.html());
    const roleMetadata = $('#position-info-box .panel-body, .job-metadata, .position-metadata').first()
      .find('p').map((_, node) => $(node).text().trim()).get().join('\n');
    const roleLocation = /^Location\s*:\s*(.+)$/im.exec(roleMetadata)?.[1]?.trim() || '';
    if (roleTitle.length && roleDescription && roleLocation) {
      const postcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.exec(roleDescription)?.[0] || '';
      const explicitUk = /(?:,\s*|\b)(?:UK|United Kingdom|GB)$/i.test(roleLocation);
      const verifiedUk = Boolean(postcode || explicitUk);
      const city = verifiedUk ? roleLocation.split(/\s*[-,]\s*/)[0]?.trim() || '' : '';
      jobs.push({ title: roleTitle.text().trim(), description: roleDescription, roleDescription,
        jobUrl: url, company, locations: [{ location: roleLocation, city, country: verifiedUk ? 'UK' : '', postcode }],
        jdDeadline: /^Closing Date\s*:\s*(.+)$/im.exec(roleMetadata)?.[1]?.trim() || '',
        salaryRange: /^Salary\s*:\s*(.+)$/im.exec(roleMetadata)?.[1]?.trim() || '',
        employmentType: /^Contract Type\s*:\s*(.+)$/im.exec(roleMetadata)?.[1]?.trim() || '',
        ats: detectAts(url) });
    }
  }
  if (!jobs.length && /\/(?:jobs?|careers?|vacanc(?:y|ies)|positions?|roles?)\//i.test(new URL(url).pathname)) {
    const title = $('h1').first().text().trim();
    const article = $('main article, main .job-description, article').first();
    const description = plainText(article.html());
    const metadataBlock = $('.careers-metadata, .job-metadata, .vacancy-metadata').first();
    const metadata = metadataBlock.children().map((_, node) => $(node).text().trim()).get().join(' ') || metadataBlock.text();
    const deadline = /(?:closing date|application deadline)\s*:\s*(.+?)(?=\s+(?:location|salary|contract type)\s*:|$)/i.exec(metadata)?.[1]?.trim() || '';
    const location = /(?:location|based at)\s*:\s*(.+?)(?=\s+(?:closing date|salary|contract type)\s*:|$)/i.exec(metadata)?.[1]?.trim() || '';
    if (title && !/^(?:careers|current vacancies|jobs)$/i.test(title) && description.length >= 40 && deadline && location) {
      const officialUkPolice = /(^|\.)police\.uk$/i.test(new URL(url).hostname);
      jobs.push({ title: title.replace(/\s+[–—]\s+/g, ' - '), description, roleDescription: description, jobUrl: url, company,
        jdDeadline: deadline, locations: [{ location, country: officialUkPolice ? 'UK' : '' }], ats: detectAts(url) });
    }
  }
  return jobs.map(job => ({
    ...job,
    jobId: vacancyIdFromUrl(job.jobUrl) || (job.jobId && !/^(?:https?:)?\/\//i.test(job.jobId) && !job.jobId.startsWith("/")
      ? job.jobId : idFromUrl(job.jobId || "") || idFromUrl(job.jobUrl) || (jobs.length === 1 ? idFromUrl(url) : "")),
  }));
}

const careers = /(?:career|jobs?|vacanc|opportunit|openings?|join[-_ ]?us|positions?|recruit)/i;
export function discoverLinks(html: string, pageUrl: string, selectors?: Selectors, scopeUrl = pageUrl): string[] {
  const $ = load(html);
  const links = new Set<string>();
  const scope = new URL(scopeUrl);
  const scopedFields = ["locationsearch", "location", "country", "region", "category", "department", "keyword", "q"]
    .filter(key => scope.searchParams.get(key));
  const resolveLink = (href: string): string => {
    // Quoted/escaped fragments in widgets are not actual anchor destinations.
    if (/^[\s"'\\]|^%22|^mailto:/i.test(href)) return "";
    const host = /^(?:www\.)?[^/?#]+\.[a-z]{2,}(?:[/?#]|$)/i.exec(href)?.[0]?.replace(/[/?#]$/, "");
    if (host && host.replace(/^www\./i, "").toLowerCase() === scope.hostname.replace(/^www\./i, "").toLowerCase()) {
      return canonicalUrl(`${scope.origin}/${href.slice(host.length).replace(/^\//, "")}`);
    }
    return canonicalUrl(href, pageUrl);
  };
  const inScope = (url: string): boolean => {
    const target = new URL(url);
    if (/^\/(?:industry|white-paper)(?:\/|$)/i.test(target.pathname) ||
        /\/(?:download[a-z]*|privacypolicy|privacy[-_]policy|cookie[-_]policy|terms[-_]and[-_]conditions)(?:\/|$)/i.test(target.pathname) ||
        target.searchParams.get("post_type") === "industry") return false;
    if (!scopedFields.length || new URL(url).origin !== scope.origin) return true;
    if (target.pathname === scope.pathname) return scopedFields.every(key => target.searchParams.get(key) === scope.searchParams.get(key));
    return /\/(?:jobs?|vacanc(?:y|ies)|positions?|roles?)\/[^/]+/i.test(target.pathname);
  };
  const add = (href: string | undefined): void => {
    const url = href && resolveLink(href);
    if (url && inScope(url) && !/\.(?:pdf|zip|png|jpg|svg|mp4|docx?)(?:\?|$)/i.test(url) &&
        !/(?:^|\/)(?:vacancy-apply\.aspx|registration\.aspx|apply|application|login|signin)(?:\/|[?#]|$)/i.test(url)) links.add(url);
  };
  $("a[href], iframe[src]").each((_, node) => {
    const element = $(node);
    const href = element.attr("href") || element.attr("src") || "";
    const absolute = resolveLink(href);
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
    const card = element.parents().slice(0, 3).filter((_, parent) =>
      /(?:^|[\s_-])(?:job|vacanc(?:y|ies)|position|role)(?:[\s_-]|$)/i.test(`${$(parent).attr("class") || ""} ${$(parent).attr("id") || ""}`)).length > 0;
    const cardHeading = element.parent().is("h2, h3, h4") || element.is("h2, h3, h4");
    if (detectAts(absolute) !== "Unknown" || careers.test(target.pathname + target.search) || (card && careers.test(label)) ||
      (isSameOrigin && card && cardHeading) ||
      (isSameOrigin && (element.attr("rel") === "next" || /^(?:next(?: page)?|[2-9]\d*)$/i.test(label)))) {
      // Application forms are never needed for job extraction.
      if (!/(?:^|\/)(?:apply|application|login|signin)(?:\/|[?#]|$)/i.test(absolute)) add(absolute);
    }
  });
  for (const selector of [selectors?.jobLinksOnly || selectors?.jobLinks, selectors?.next]) {
    if (selector) $(selector).each((_, node) => add($(node).attr("href")));
  }
  if (!selectors?.jobLinksOnly) {
    $('link[rel="alternate"][type="application/json"], a[rel="alternate"][type="application/json"]').each((_, node) => add($(node).attr("href")));
  }
  return [...links];
}
