import { scrapeJobtrain } from "./jobtrain.js";
import { scrapeComeet } from "./comeet.js";
import { scrapeLaatZoho } from "./zoho.js";
import { scrapeEwJobManager } from "./wp-job-manager.js";

import { AccessPolicy, scrapeCompany, type ScrapeOptions } from "./crawl.js";
import { scrapeJobSitemap } from "./sitemap.js";
import { atsBoard } from "./ats.js";
import { canonicalUrl, dateWindow, normalizeJobs } from "./normalize.js";
import { Geography } from "./geography.js";
import { decodeJobApi } from "./api.js";

type Result = Awaited<ReturnType<typeof scrapeCompany>> | Awaited<ReturnType<typeof scrapeJobSitemap>>;
export interface Attempt { method: string; status: string; candidates: number; rows: number; reason?: string }

function failed(url: string, method: string, error: unknown, now: Date): Awaited<ReturnType<typeof scrapeCompany>> {
  return {
    rows: [],
    rawJobs: [],
    report: {
      sourceUrl: url, process: method, scrapedAt: now.toISOString(), window: dateWindow(now),
      status: "unsupported", pagesVisited: 0, requests: 0, candidates: 0, rows: 0,
      limited: false, pendingUrls: [], skipped: [],
      issues: [{ url, message: error instanceof Error ? error.message : String(error) }],
      dateFallbacks: [], dataNotes: [], locationEvidence: [],
    },
  };
}

async function publicApi(url: string, endpoint: string, options: ScrapeOptions): Promise<Result> {
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 30_000);
  const jobs = [];
  const seen = new Set<string>();
  const issues: { url: string; message: string }[] = [];
  let next = endpoint;
  let empty = false;
  while (next && seen.size < (options.maxPages ?? 100)) {
    if (seen.has(next)) { issues.push({ url: next, message: "API pagination cycle detected." }); break; }
    if (new URL(next).origin !== new URL(endpoint).origin) {
      issues.push({ url: next, message: "Cross-origin API pagination requires an explicit adapter." }); break;
    }
    seen.add(next);
    try {
      const decoded = decodeJobApi(await policy.json(next), next, options.company);
      jobs.push(...decoded.jobs);
      empty = decoded.empty;
      if (!decoded.jobs.length && !decoded.empty || decoded.unsupportedPagination) {
        issues.push({ url: next, message: "Unsupported API record or pagination schema; extend src/api.ts." });
        break;
      }
      next = decoded.nextUrl;
    } catch (error) { issues.push({ url: next, message: String(error) }); break; }
  }
  const limited = Boolean(next);
  if (!jobs.length) {
    const result = failed(url, "API", "The JSON endpoint does not expose supported schema.org JobPosting records. A site-specific API adapter is required.", options.now!);
    if (empty && !limited && !issues.length) { result.report.status = "no_matches"; result.report.issues = []; }
    else if (issues.length) result.report.issues = issues;
    result.report.requests = seen.size;
    result.report.limited = limited;
    result.report.pendingUrls = next ? [next] : [];
    return result;
  }
  const geo = new Geography();
  const resolved = [];
  for (const job of jobs) resolved.push(await geo.resolve(job));
  const normalized = normalizeJobs(resolved, options.now);
  return {
    rows: normalized.rows,
    rawJobs: resolved,
    report: {
      sourceUrl: url, process: "API", scrapedAt: options.now!.toISOString(), window: dateWindow(options.now),
      status: limited || issues.length ? "partial" : normalized.rows.length ? "ok" : "no_matches",
      pagesVisited: 0, requests: seen.size, candidates: jobs.length, rows: normalized.rows.length,
      limited, pendingUrls: next ? [next] : [], skipped: normalized.skipped, issues,
      dateFallbacks: normalized.dateFallbacks, dataNotes: normalized.dataNotes, locationEvidence: geo.evidence,
    },
  };
}

/** Bounded multi-strategy orchestration. Access restrictions are never bypassed. */
export async function scrapeWebsite(input: string, inputOptions: ScrapeOptions = {}) {
  const url = canonicalUrl(input);
  if (!url) throw new Error("A valid public HTTP(S) website is required.");
  const options = { ...inputOptions, now: inputOptions.now || new Date() };
  const mode = options.mode || "auto";
  const attempts: Attempt[] = [];
  const results: Result[] = [];
  async function attempt(method: string, action: () => Promise<Result>) {
    console.log(`Trying ${method} extraction…`);
    let result: Result;
    try { result = await action(); }
    catch (error) { result = failed(url, method, error, options.now); }
    attempts.push({
      method, status: result.report.status, candidates: result.report.candidates, rows: result.rows.length,
      reason: result.report.issues[0]?.message,
    });
    results.push(result);
    console.log(`${method}: ${result.report.status}, ${result.rows.length} rows${result.report.issues[0] ? `; ${result.report.issues[0].message}` : ""}`);
    return result;
  }
  const usable = (result: Result) => ["ok", "no_matches"].includes(result.report.status) &&
    (result.rows.length > 0 || result.report.candidates === 0 ||
      result.report.skipped.every(item => item.reason !== "missing_details"));
  const finish = (result: Result) => ({ ...result, report: { ...result.report, selectedMode: mode, attempts } });

  if (new URL(url).hostname === "ewrecruitment.co.uk" && ["auto", "static"].includes(mode)) {
    return finish(await attempt("PUBLIC WP Job Manager", () => scrapeEwJobManager(url, options)));
  }
  if (new URL(url).hostname === "laat.zohorecruit.eu" && ["auto", "static"].includes(mode)) {
    return finish(await attempt("STATIC LAAT Zoho", () => scrapeLaatZoho(url, options)));
  }
  if (/^(?:www\.)?comeet\.com$/i.test(new URL(url).hostname) && ["auto", "static"].includes(mode)) {
    return finish(await attempt("STATIC Comeet", () => scrapeComeet(url, options)));
  }
  if (/^(?:www\.)?jobtrain\.co\.uk$/i.test(new URL(url).hostname) && ["auto", "static"].includes(mode)) {
    return finish(await attempt("STATIC Jobtrain", () => scrapeJobtrain(url, options)));
  }
  if (mode === "dom") return finish(await attempt("DOM", () => scrapeCompany(url, { ...options, mode: "dom" })));
  if (mode === "api") {
    return finish(await attempt("API", () => options.apiUrl
      ? publicApi(url, options.apiUrl, options)
      : scrapeCompany(url, { ...options, mode: "api" })));
  }
  if (!["auto", "static"].includes(mode)) throw new Error("Choose Auto, API, Static, or DOM.");
  if (mode === "auto" && (options.apiUrl || atsBoard(url))) {
    const result = await attempt("API", () => options.apiUrl
      ? publicApi(url, options.apiUrl, options)
      : scrapeCompany(url, { ...options, mode: "auto" }));
    if (usable(result)) return finish(result);
  }
  let sitemap = options.sitemapUrl || "";
  // Explicit job-link selectors define a targeted listing (for example a UK
  // filter). Do not replace that scope with an automatically found global sitemap.
  if (!sitemap && !options.selectors?.jobLinksOnly) {
    try {
      const response = await fetch(`${new URL(url).origin}/robots.txt`, { signal: AbortSignal.timeout(options.timeoutMs || 30_000) });
      if (response.ok) sitemap = canonicalUrl(/^sitemap:\s*(\S+)/im.exec(await response.text())?.[1] || "");
    } catch { /* The actual extraction records network/access failures below. */ }
  }
  if (sitemap) {
    const result = await attempt("STATIC SITEMAP", () => scrapeJobSitemap(url, sitemap, { ...options, filterJobUrls: !options.sitemapUrl }));
    if (usable(result) && (result.report.candidates > 0 || options.sitemapUrl)) return finish(result);
  }
  const staticResult = await attempt("STATIC", () => scrapeCompany(url, { ...options, mode: "static" }));
  if (mode === "static" || usable(staticResult)) return finish(staticResult);
  const domResult = await attempt("DOM", () => scrapeCompany(url, { ...options, mode: "dom" }));
  if (usable(domResult)) return finish(domResult);
  // Preserve the strongest partial result; never call failed extraction "no jobs".
  const best = [...results].sort((a, b) => b.rows.length - a.rows.length || b.report.candidates - a.report.candidates)[0]!;
  return finish(best);
}
