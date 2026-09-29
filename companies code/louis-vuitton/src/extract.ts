import { load, type CheerioAPI } from "cheerio";
import { array, canonicalUrl, object, plainText, text, type RawJob } from "./normalize.js";

/** Best-available display name for a schema.org Organisation reference. */
function name(value: unknown): string {
  const entry = object(value);
  return text(value) || text(entry.name) || text(entry.value) || text(entry.identifier);
}

/** schema.org JobPosting (JSON-LD or microdata) plus conservative heuristics. */
export function extractJobs(html: string, pageUrl: string): RawJob[] {
  return extractJobsFromDom(load(html), pageUrl);
}

/** As extractJobs, but on an already-parsed document (single parse per page). */
export function extractJobsFromDom($: CheerioAPI, pageUrl: string): RawJob[] {
  const jobs: RawJob[] = [];

  // JSON-LD -----------------------------------------------------------------
  $('script[type="application/ld+json"]').each((_, node) => {
    let data: unknown;
    try {
      data = JSON.parse($(node).contents().text());
    } catch {
      return;
    }
    for (const item of flattenGraph(data)) {
      const types = array(object(item)["@type"]).map(text);
      if (!types.includes("JobPosting")) continue;
      jobs.push(fromSchema(object(item), pageUrl));
    }
  });

  // Microdata ---------------------------------------------------------------
  $('[itemscope][itemtype*="schema.org/JobPosting"]').each((_, node) => {
    const scope = $(node);
    const prop = (name: string): string =>
      text(scope.find(`[itemprop="${name}"]`).first().attr("content")) ||
      plainText(scope.find(`[itemprop="${name}"]`).first().text());
    const title = prop("title");
    if (!title) return;
    jobs.push({
      title,
      description: plainText(prop("description")),
      jobUrl: canonicalUrl(prop("url"), pageUrl) || pageUrl,
      postedDate: prop("datePosted"),
      jdDeadline: prop("validThrough"),
      salaryText: prop("baseSalary") || prop("salary"),
      employmentType: prop("employmentType"),
      worktype: prop("jobLocationType"),
      locationText: prop("jobLocation") || prop("addressLocality"),
      locations: [{ location: prop("jobLocation") || prop("addressLocality") }],
    });
  });

  return dedupe(jobs);
}

export function extractHeuristic(html: string, pageUrl: string): RawJob {
  return extractHeuristicFromDom(load(html), pageUrl);
}

/** As extractHeuristic, but on an already-parsed document (single parse per page). */
export function extractHeuristicFromDom($: CheerioAPI, pageUrl: string): RawJob {
  const title =
    plainText($("h1").first().text()) ||
    plainText($('meta[property="og:title"]').attr("content")) ||
    plainText($("title").first().text());
  const location = pick($, [
    '[class*="location"]', '[data-testid*="location"]', '[itemprop="jobLocation"]',
    '[class*="job-location"]', '[class*="postcode"]',
  ]);
  const date = pick($, [
    '[class*="posted"]', '[class*="date"]', 'time[datetime]',
    '[itemprop="datePosted"]', '[class*="closing"]',
  ]);
  const salary = pick($, [
    '[class*="salary"]', '[data-testid*="salary"]', '[itemprop="baseSalary"]', '[class*="pay"]',
  ]);
  const employment = pick($, [
    '[class*="employment"]', '[class*="job-type"]', '[data-testid*="employment"]', '[class*="contract"]',
  ]);
  // Eploy/ATS detail pages expose the advert in a dedicated container; using
  // it avoids the "Skip to content / Save Job / Apply" chrome that pollutes
  // the judgment input.
  const main = $(
    ".vac-details__description, .vacancy-description, .job-description, [class*='vacancy'][class*='description'], " +
    "main, article, #content, .job, body",
  ).first();
  // Note: <form> is intentionally kept — ASP.NET/Eploy sites wrap the entire
  // page (including the job content) in one form element.
  $("nav, header, footer, script, style").remove();
  return {
    title,
    description: plainText(main.text()).slice(0, 20_000),
    jobUrl: pageUrl,
    postedDate: date,
    salaryText: salary,
    employmentType: employment,
    locationText: location,
    locations: [{ location }],
  };
}

function pick($: CheerioAPI, selectors: string[]): string {
  for (const selector of selectors) {
    const value = plainText($(selector).first().text());
    if (value && value.length < 200) return value;
  }
  return "";
}

/** Candidate navigation links from a page, labelled for Jev triage. */
export function pageLinks(html: string, pageUrl: string): { url: string; label: string }[] {
  const $ = load(html);
  const out = new Map<string, string>();
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    const url = href && canonicalUrl(href, pageUrl);
    if (!url) return;
    if (/\.(?:pdf|zip|png|jpe?g|svg|mp4|docx?)(?:\?|$)/i.test(url)) return;
    if (/(?:^|\/)(?:apply|application|login|signin|register)(?:\/|[?#]|$)/i.test(url)) return;
    if (new URL(url).origin !== new URL(pageUrl).origin) return;
    if (!out.has(url)) out.set(url, plainText($(node).text()).slice(0, 120));
  });
  return [...out.entries()].map(([url, label]) => ({ url, label }));
}

function fromSchema(data: Record<string, unknown>, pageUrl: string): RawJob {
  const locations = array(data.jobLocation).flatMap(item => {
    const place = object(item);
    const address = object(place.address ?? place.postalAddress ?? place);
    if (typeof item === "string") return [{ location: item }];
    const city = text(address.addressLocality);
    const state = text(address.addressRegion);
    const country = text(address.addressCountry) || text(object(address.addressCountry).name);
    return [{
      location: [city, state, country].filter(Boolean).join(", ") || text(place.name),
      city, state, country, postcode: text(address.postalCode),
    }];
  });
  const salary = (() => {
    const base = object(data.baseSalary);
    const amount = object(base.value);
    const range = [text(amount.minValue), text(amount.maxValue)].filter(Boolean).join("-") ||
      text(amount.value) || text(data.baseSalary);
    return [text(base.currency), range, text(amount.unitText)].filter(Boolean).join(" ");
  })();
  const locationText = locations.map(l => l.location).filter(Boolean).join("; ");
  return {
    title: text(data.title),
    description: plainText(data.description),
    jobUrl: canonicalUrl(text(data.url), pageUrl) || pageUrl,
    postedDate: text(data.datePosted),
    jdDeadline: text(data.validThrough),
    salaryText: salary,
    employmentType: array(data.employmentType).map(text).filter(Boolean).join(", "),
    worktype: text(data.jobLocationType),
    locationText,
    company: name(data.hiringOrganization),
    jobId: text(data.identifier) || text(object(data.identifier).value) || text(data.jobId),
    locations: locations.length ? locations : [{ location: locationText }],
  };
}

function flattenGraph(data: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    const item = object(value);
    if (!Object.keys(item).length) return;
    out.push(item);
    visit(item["@graph"]);
  };
  visit(data);
  return out;
}

function dedupe(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  return jobs.filter(job => {
    const key = `${job.title}|${job.jobUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(job.title);
  });
}
