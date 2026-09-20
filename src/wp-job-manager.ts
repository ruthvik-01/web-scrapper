import { load } from "cheerio";
import { AccessPolicy, type ScrapeOptions } from "./crawl.js";
import { extractJobs } from "./extract.js";
import { Geography } from "./geography.js";
import { dateWindow, normalizeJobs, plainText, type RawJob } from "./normalize.js";

export function extractEwDetail(html: string, url: string, company?: string): RawJob[] {
  const $ = load(html);
  const detail = $(".single_job_listing").first();
  if (!detail.length) return [];
  const location = detail.find(".job-listing-meta .location").text().trim();
  const parts = location.split(",").map(part => part.trim());
  const description = plainText(detail.find(".job_description").html() || "");
  return [{
    jobId: /\bpostid-(\d+)/.exec($("body").attr("class") || "")?.[1],
    title: $("h1").first().text().trim(), description, roleDescription: description,
    jobUrl: url, company, postedDate: detail.find(".date-posted time").attr("datetime") || "",
    employmentType: detail.find(".job-listing-meta .job-type").text().trim(),
    visibleLocation: location,
    locations: [{ location, city: parts.length === 2 ? parts[0] : "",
      state: parts.length === 2 ? parts[1] : "" }],
    ats: "WP Job Manager",
  }];
}

/** EW's public WP Job Manager listing POST is a read-only search, observed in its UI. */
export async function scrapeEwJobManager(url: string, options: ScrapeOptions = {}) {
  const now = options.now || new Date();
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 30000);
  const endpoint = new URL("/jm-ajax/get_listings/", url).href;
  const urls = new Set<string>();
  const issues: { url: string; message: string }[] = [];
  const jobs: RawJob[] = [];
  const sourcePages: { page: number; maxPages: number; jobUrls: string[] }[] = [];
  const geo = new Geography();
  let maxPages = 1, listingPages = 0, detailPages = 0;
  for (let page = 1; page <= maxPages && page <= (options.maxPages ?? 1000); page++) {
    await policy.pace(endpoint);
    const body = new URLSearchParams({
      lang: "", search_keywords: "", search_location: "", per_page: "10", orderby: "featured",
      featured_first: "false", order: "DESC", page: String(page), remote_position: "", show_pagination: "false",
    });
    const response = await fetch(endpoint, {
      method: "POST", body, redirect: "manual",
      headers: { "User-Agent": "UKCompanyJobScraper/0.1" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
    });
    if (!response.ok) throw new Error(`Public WP listing returned HTTP ${response.status}.`);
    const payload = await response.json() as { found_jobs?: boolean; html?: string; max_num_pages?: number };
    if (typeof payload.found_jobs !== "boolean" || typeof payload.html !== "string") {
      throw new Error("Unsupported public WP listing response.");
    }
    maxPages = Number(payload.max_num_pages || 0);
    if (!Number.isSafeInteger(maxPages) || maxPages < 0) throw new Error("Invalid listing page count.");
    const $ = load(payload.html);
    const links = $("a[href]").toArray().map(node => new URL($(node).attr("href")!, url).href)
      .filter(link => new URL(link).origin === new URL(url).origin && /\/job\/[^/]+/.test(new URL(link).pathname));
    if (payload.found_jobs && !links.length) throw new Error("Advertised jobs lack supported links.");
    for (const link of links) urls.add(link);
    listingPages++;
    sourcePages.push({ page, maxPages, jobUrls: [...new Set(links)] });
  }
  for (const jobUrl of urls) {
    try {
      const page = await policy.html(jobUrl);
      detailPages++;
      const structured = extractJobs(page.body, page.url, options.company);
      const records = structured.length ? structured : extractEwDetail(page.body, page.url, options.company);
      if (!records.length) throw new Error("No job details extracted from advertised URL.");
      for (const job of records) jobs.push(await geo.resolve(job));
    } catch (error) {
      issues.push({ url: jobUrl, message: String(error) });
    }
  }
  const normalized = normalizeJobs(jobs, now);
  const limited = listingPages < maxPages;
  return { rows: normalized.rows, rawJobs: jobs, report: {
    sourceUrl: url, process: "PUBLIC WP Job Manager listing + STATIC details",
    scrapedAt: now.toISOString(), window: dateWindow(now),
    status: issues.length || limited ? "partial" : normalized.rows.length ? "ok" : "no_matches",
    pagesVisited: listingPages + detailPages, requests: listingPages + urls.size,
    candidates: jobs.length, advertisedPositions: urls.size, sourcePages, rows: normalized.rows.length,
    limited, pendingUrls: issues.map(issue => issue.url), issues,
    skipped: normalized.skipped, dateFallbacks: normalized.dateFallbacks,
    dataNotes: normalized.dataNotes, locationEvidence: geo.evidence,
  } };
}
