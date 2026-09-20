import { load } from "cheerio";
import { AccessPolicy, type Issue, type ScrapeOptions } from "./crawl.js";
import { extractJobs } from "./extract.js";
import { canonicalUrl, dateWindow, normalizeJobs, parsePostedDate, type RawJob } from "./normalize.js";
import { Geography } from "./geography.js";

/** Static extraction from an explicitly supplied public job sitemap or sitemap index. */
export async function scrapeJobSitemap(
  companyUrl: string,
  sitemapUrl: string,
  options: ScrapeOptions = {},
) {
  const start = canonicalUrl(companyUrl);
  const sitemap = canonicalUrl(sitemapUrl);
  if (!start || !sitemap || new URL(start).origin !== new URL(sitemap).origin) {
    throw new Error("Company and job sitemap must be HTTP(S) URLs on the same origin.");
  }
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? 250;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error("Invalid maxPages.");
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 30_000);
  const maps = [sitemap];
  const seenMaps = new Set<string>();
  const jobUrls = new Set<string>();
  const jobs: RawJob[] = [];
  const geography = new Geography();
  const issues: Issue[] = [];
  let pagesVisited = 0;
  let limited = false;
  const addIssue = (url: string, error: unknown): void => {
    issues.push({ url, message: error instanceof Error ? error.message : String(error) });
  };
  while (maps.length && seenMaps.size < 20) {
    const url = maps.shift()!;
    if (seenMaps.has(url)) continue;
    seenMaps.add(url);
    try {
      const response = await policy.html(url);
      const $ = load(response.body, { xmlMode: true });
      const index = $("sitemapindex").length > 0;
      const locations = index ? $("sitemap > loc") : $("url > loc");
      if (!index && !$("urlset").length) throw new Error("Response is not a supported XML sitemap.");
      locations.each((_, node) => {
        const target = canonicalUrl($(node).text());
        // A custom careers domain can publish canonical ATS-hosted job URLs.
        // Follow the explicit public sitemap links, checking each host's robots.txt.
        if (!target) return;
        if (index) maps.push(target);
        else jobUrls.add(target);
      });
    } catch (error) {
      addIssue(url, error);
    }
  }
  if (maps.length) limited = true;
  const urls = [...jobUrls];
  console.log(`[${options.company || start}] Discovered ${urls.length} job URLs across ${seenMaps.size} sitemap files.`);
  for (const url of urls.slice(0, maxPages)) {
    try {
      const response = await policy.html(url);
      pagesVisited++;
      const extracted = extractJobs(response.body, response.url, options.company, options.selectors);
      if (!extracted.length) addIssue(url, "No structured JobPosting found in static HTML; DOM extraction may be required.");
      for (const job of extracted) {
        // Avoid unnecessary geocoding of already-out-of-window vacancies.
        const parsedDate = parsePostedDate(job.postedDate, now);
        const window = dateWindow(now);
        jobs.push(parsedDate && (parsedDate < window.from || parsedDate > window.to) ? job : await geography.resolve(job));
      }
    } catch (error) {
      addIssue(url, error);
    }
    if (pagesVisited % 10 === 0) console.log(`[${options.company || start}] Static extraction: ${pagesVisited}/${urls.length} job pages read.`);
  }
  if (urls.length > maxPages) limited = true;
  const normalized = normalizeJobs(jobs, now);
  return {
    rows: normalized.rows,
    rawJobs: jobs,
    report: {
      sourceUrl: start, sitemapUrl: sitemap, sitemapUrls: [...seenMaps],
      scrapedAt: now.toISOString(), window: dateWindow(now), process: geography.requests ? "STATIC + API" : "STATIC",
      status: limited || issues.length ? "partial" : normalized.rows.length ? "ok" : "no_matches",
      advertisedUrls: urls.length, pagesVisited, candidates: jobs.length, rows: normalized.rows.length,
      limited, pendingUrls: urls.slice(maxPages), skipped: normalized.skipped, issues,
      dateFallbacks: normalized.dateFallbacks,
      dataNotes: normalized.dataNotes, locationEvidence: geography.evidence,
      geographicApiRequests: geography.requests,
    },
  };
}
