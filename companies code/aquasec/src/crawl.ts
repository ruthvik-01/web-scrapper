import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
import { chromium, type Browser, type Page } from "playwright";
import { atsBoard, enrichJob, mapAtsJobs } from "./ats.js";
import { detectAts, discoverLinks, extractJobs, type Selectors } from "./extract.js";
import { Geography } from "./geography.js";
import { decodeJobApi } from "./api.js";
import { canonicalUrl, dateWindow, normalizeJobs, parsePostedDate, ukLocation, type RawJob } from "./normalize.js";

const USER_AGENT = "UKCompanyJobScraper/0.1";

export interface ScrapeOptions {
  mode?: "auto" | "api" | "static" | "dom";
  apiUrl?: string;
  sitemapUrl?: string;
  filterJobUrls?: boolean;
  company?: string;
  maxPages?: number;
  delayMs?: number;
  renderWaitMs?: number;
  timeoutMs?: number;
  browser?: "chromium" | "chrome" | "msedge";
  selectors?: Selectors;
  now?: Date;
}
export interface Issue { url: string; message: string }
interface Rules {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
}
// robots-parser is CommonJS; its bundled declaration is not NodeNext-compatible.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Rules;

export class AccessPolicy {
  private rules = new Map<string, Promise<Rules>>();
  private lastRequest = new Map<string, number>();
  constructor(private delayMs: number, private timeoutMs: number) {}

  private async getRules(url: string): Promise<Rules> {
    const origin = new URL(url).origin;
    if (!this.rules.has(origin)) {
      this.rules.set(origin, (async () => {
        const robotsUrl = `${origin}/robots.txt`;
        const response = await fetch(robotsUrl, {
          headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status === 404 || response.status === 410) return robotsParser(robotsUrl, "");
        if (!response.ok) throw new Error(`Cannot verify robots.txt (HTTP ${response.status}); not crawling this origin.`);
        const content = await response.text();
        if (content.length > 500_000) throw new Error("robots.txt exceeds the safety limit.");
        return robotsParser(robotsUrl, content);
      })());
    }
    return this.rules.get(origin)!;
  }

  async check(url: string): Promise<void> {
    const rules = await this.getRules(url);
    if (rules.isAllowed(url, USER_AGENT) === false) throw new Error("Disallowed by robots.txt.");
  }

  async pace(url: string): Promise<void> {
    await this.check(url);
    const origin = new URL(url).origin;
    const rules = await this.getRules(url);
    const delay = Math.max(this.delayMs, (rules.getCrawlDelay(USER_AGENT) || 0) * 1000);
    if (delay > this.timeoutMs) throw new Error("robots.txt crawl delay exceeds timeout; increase --timeout-ms.");
    const remaining = (this.lastRequest.get(origin) || 0) + delay - Date.now();
    if (remaining > 0) await sleep(remaining);
    this.lastRequest.set(origin, Date.now());
  }

  async json(url: string, redirects = 0): Promise<unknown> {
    await this.pace(url);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs), redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const next = canonicalUrl(response.headers.get("location") || "", url);
      if (!next || redirects >= 5) throw new Error("Invalid or excessive API redirects.");
      return this.json(next, redirects + 1);
    }
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}.`);
    const body = await response.text();
    if (body.length > 20_000_000) throw new Error("API response exceeds 20 MB.");
    return JSON.parse(body);
  }

  async html(url: string, redirects = 0): Promise<{ url: string; body: string }> {
    await this.pace(url);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(this.timeoutMs), redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location && canonicalUrl(location, url);
      if (!next || redirects >= 5) throw new Error("Invalid or excessive document redirects.");
      return this.html(next, redirects + 1);
    }
    if (!response.ok) throw new Error(`Page returned HTTP ${response.status}.`);
    return { url, body: await response.text() };
  }
}

function usefulDetail(job: RawJob, now: Date): boolean {
  const posted = parsePostedDate(job.postedDate, now);
  const window = dateWindow(now);
  if (posted && (posted < window.from || posted > window.to)) return false;
  return !posted || !job.company || !job.description || !job.locations.some(ukLocation);
}

export async function scrapeCompany(inputUrl: string, options: ScrapeOptions = {}) {
  const start = canonicalUrl(inputUrl);
  if (!start) throw new Error("Provide an HTTP(S) company/careers URL without embedded credentials.");
  const now = options.now ?? new Date();
  const mode = options.mode || "auto";
  if (!["auto", "api", "static", "dom"].includes(mode)) throw new Error("Unsupported extraction mode.");
  const maxPages = options.maxPages ?? 100;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const renderWaitMs = options.renderWaitMs ?? 1500;
  const delayMs = options.delayMs ?? 1000;
  for (const [name, value, min] of [
    ["maxPages", maxPages, 1], ["timeoutMs", timeoutMs, 1],
    ["renderWaitMs", renderWaitMs, 0], ["delayMs", delayMs, 0],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${name}.`);
  }
  const policy = new AccessPolicy(delayMs, timeoutMs);
  const issues: Issue[] = [];
  const jobs: RawJob[] = [];
  const queue: { url: string; seed?: RawJob }[] = [{ url: start }];
  const scheduled = new Set([start]);
  const completed = new Set<string>();
  const handledBoards = new Set<string>();
  const methods = new Set<string>();
  const geography = new Geography();
  const redirects = new Map<string, string>();
  let browser: Browser | undefined;
  let page: Page | undefined;
  let requests = 0;
  let pagesVisited = 0;
  let recognized = false;
  let limited = false;
  const networkTasks = new Set<Promise<void>>();
  const reportIssue = (url: string, error: unknown): void => {
    const issue = { url, message: error instanceof Error ? error.message : String(error) };
    if (!issues.some(existing => existing.url === url && existing.message === issue.message)) issues.push(issue);
  };
  const enqueue = (url: string, seed?: RawJob, from = start): void => {
    const target = canonicalUrl(url);
    if (!target) { if (seed) jobs.push(seed); return; }
    if (!seed) {
      const sourceHost = new URL(from).hostname.replace(/^www\./, "");
      const targetHost = new URL(target).hostname.replace(/^www\./, "");
      const sourceBoard = atsBoard(from);
      const targetBoard = atsBoard(target);
      if (sourceBoard && targetBoard && sourceBoard.endpoint !== targetBoard.endpoint) return;
      const sameCompany = sourceHost === targetHost || targetHost.endsWith(`.${sourceHost}`);
      if (!sameCompany && detectAts(target) === "Unknown") return;
    }
    if (scheduled.has(target)) {
      const pending = queue.find(item => item.url === target);
      if (pending && seed) pending.seed = seed;
      else if (seed) jobs.push(seed);
      return;
    }
    if (scheduled.size >= 10_000) {
      limited = true;
      if (seed) jobs.push(seed);
      return;
    }
    scheduled.add(target);
    queue.push({ url: target, seed });
  };

  async function getPage(): Promise<Page> {
    if (page) return page;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(options.browser && options.browser !== "chromium" ? { channel: options.browser } : {}),
      });
    } catch (error) {
      throw new Error(`Cannot launch browser. Run "npx playwright install chromium" or use --browser chrome/--browser msedge. ${String(error)}`);
    }
    const context = await browser.newContext({ userAgent: USER_AGENT, serviceWorkers: "block" });
    await context.route("**/*", async route => {
      const request = route.request();
      if (["image", "media", "font"].includes(request.resourceType())) return route.abort();
      if (["xhr", "fetch"].includes(request.resourceType()) && request.method() === "GET") {
        try { await policy.check(request.url()); }
        catch (error) { reportIssue(request.url(), error); return route.abort(); }
      }
      if (request.isNavigationRequest()) {
        try {
          await policy.pace(request.url());
          // Playwright routing normally intercepts only the FIRST URL in an HTTP
          // redirect chain. Fetch documents without auto-following, then navigate
          // explicitly so every redirect target is checked before it is requested.
          const response = await route.fetch({ maxRedirects: 0, timeout: timeoutMs });
          try {
            if (response.status() >= 300 && response.status() < 400) {
              const next = canonicalUrl(response.headers().location || "", request.url());
              if (!next) throw new Error("Document redirect has no valid HTTP(S) Location.");
              await policy.check(next);
              if (request.frame() === page?.mainFrame()) redirects.set(request.url(), next);
              else enqueue(next, undefined, request.url());
              await route.fulfill({ status: 200, contentType: "text/html", body: "" });
            } else {
              await route.fulfill({ response });
            }
          } finally {
            await response.dispose();
          }
          return;
        } catch (error) {
          reportIssue(request.url(), error);
          return route.abort();
        }
      }
      return route.continue();
    });
    page = await context.newPage();
    page.on("response", response => {
      const request = response.request();
      if (request.method() !== "GET" || !["xhr", "fetch"].includes(request.resourceType()) ||
          !response.ok() || !/json/i.test(response.headers()["content-type"] || "")) return;
      if (new URL(response.url()).origin !== new URL(start).origin && !atsBoard(response.url())) return;
      const task = (async () => {
        try {
          const decoded = decodeJobApi(await response.json(), response.url(), options.company);
          for (const job of decoded.jobs) jobs.push(await geography.resolve(job));
          if (decoded.jobs.length) { recognized = true; methods.add("API"); }
        } catch { /* Non-job/invalid JSON responses are not extraction errors. */ }
      })();
      networkTasks.add(task);
      void task.finally(() => networkTasks.delete(task));
    });
    page.setDefaultTimeout(timeoutMs);
    return page;
  }

  async function navigate(current: Page, initial: string): Promise<void> {
    let target = initial;
    for (let count = 0; count <= 5; count++) {
      redirects.delete(target);
      const response = await current.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      if (!response || !response.ok()) throw new Error(`Page returned HTTP ${response?.status() ?? "unknown"}.`);
      const next = redirects.get(current.url());
      if (!next) return;
      target = next;
    }
    throw new Error("Excessive document redirects.");
  }

  try {
    while (queue.length && requests < maxPages) {
      const item = queue.shift()!;
      const url = item.url;
      if (completed.has(url)) continue;
      completed.add(url);
      try {
        await policy.check(url);
        const board = !item.seed && mode !== "dom" && mode !== "static" && atsBoard(url);
        if (board && !handledBoards.has(board.endpoint)) {
          handledBoards.add(board.endpoint);
          try {
            let offset = 0;
            while (requests < maxPages) {
              const endpoint = new URL(board.endpoint);
              if (board.kind === "Lever") {
                endpoint.searchParams.set("skip", String(offset));
                endpoint.searchParams.set("limit", "100");
              }
              requests++;
              methods.add("API");
              const payload = await policy.json(endpoint.href);
              if (board.kind === "Lever" ? !Array.isArray(payload) :
                !payload || typeof payload !== "object" || !("jobs" in payload) || !Array.isArray(payload.jobs)) {
                throw new Error("The public ATS API returned an unsupported response shape.");
              }
              recognized = true;
              const batch = mapAtsJobs(board, payload, options.company);
              for (const job of batch) {
                if (mode !== "api" && usefulDetail(job, now) && job.jobUrl) {
                  if (job.jobUrl === url) {
                    // Allow a direct job URL to be revisited for detail enrichment.
                    queue.unshift({ url, seed: job });
                    completed.delete(url);
                  } else {
                    enqueue(job.jobUrl, job);
                  }
                } else {
                  jobs.push(job);
                }
              }
              if (board.kind !== "Lever" || !Array.isArray(payload) || payload.length < 100) break;
              offset += 100;
              if (requests >= maxPages) limited = true;
            }
            continue;
          } catch (error) {
            reportIssue(board.endpoint, error);
            // If a public API is unavailable, try the normal public careers page.
          }
        } else if (board && handledBoards.has(board.endpoint)) {
          continue;
        }
        if (requests >= maxPages) {
          limited = true;
          if (item.seed) jobs.push(item.seed);
          break;
        }
        if (mode === "api") {
          reportIssue(url, "No supported public ATS API was detected. Provide a public JobPosting JSON endpoint, or use Auto/DOM mode.");
          continue;
        }
        requests++;
        if (mode === "static") {
          methods.add("STATIC");
          const document = await policy.html(url);
          pagesVisited++;
          // Public JSON endpoints linked from careers pages need no browser.
          if (/^\s*[\[{]/.test(document.body)) {
            try {
              const decoded = decodeJobApi(JSON.parse(document.body), document.url, options.company);
              if (decoded.jobs.length || decoded.empty) {
                recognized = true;
                methods.add("API");
                for (const job of decoded.jobs) jobs.push(await geography.resolve(job));
                if (decoded.nextUrl) {
                  if (scheduled.has(decoded.nextUrl)) reportIssue(url, "API pagination cycle detected.");
                  else enqueue(decoded.nextUrl, undefined, document.url);
                }
                if (decoded.unsupportedPagination) reportIssue(url, "Unsupported API pagination schema.");
                continue;
              }
            } catch { /* Continue to HTML/DOM fallback for unknown content. */ }
          }
          const extracted = extractJobs(document.body, document.url, options.company, options.selectors);
          if (extracted.length) recognized = true;
          for (const job of extracted) jobs.push(await geography.resolve(job));
          for (const link of discoverLinks(document.body, document.url, options.selectors)) enqueue(link, undefined, document.url);
          if (/__doPostBack\([^)]*(?:Pager|Pagination)/i.test(document.body) ||
              /<(?:button)[^>]*>[^<]*(?:load more|show more jobs)/i.test(document.body)) {
            reportIssue(url, "JavaScript pagination was found; use DOM mode to reach additional pages.");
          }
          continue;
        }
        methods.add("DOM");
        const current = await getPage();
        await navigate(current, url);
        pagesVisited++;
        const started = Date.now();
        const pageJobs: RawJob[] = [];
        const fingerprints = new Set<string>();
        let lastFingerprint = "";
        const maxInteractions = 20;
        for (let step = 0; step <= maxInteractions; step++) {
          await sleep(renderWaitMs);
          await Promise.all([...networkTasks]);
          const redirected = redirects.get(current.url());
          if (redirected) await navigate(current, redirected);
          const pageUrl = current.url();
          const html = await current.content();
          const title = await current.title();
          if (/just a moment|access denied|verify you are human|captcha/i.test(title)) {
            throw new Error("Access challenge detected; no bypass attempted.");
          }
          const extracted = [];
          for (const job of extractJobs(html, pageUrl, options.company, options.selectors)) {
            extracted.push(await geography.resolve(job));
          }
          if (extracted.length) recognized = true;
          for (const job of extracted) {
            const fingerprint = JSON.stringify(job);
            if (!fingerprints.has(fingerprint)) pageJobs.push(job);
            fingerprints.add(fingerprint);
          }
          const links = discoverLinks(html, pageUrl, options.selectors);
          if (!item.seed) for (const link of links) enqueue(link, undefined, pageUrl);
          const fingerprint = JSON.stringify([links, [...fingerprints]]);
          const unchanged = step > 0 && fingerprint === lastFingerprint;
          lastFingerprint = fingerprint;
          const selector = options.selectors?.loadMore || options.selectors?.next;
          const loadMore = current.getByRole("button", { name: /^(?:load more|show more|more jobs|load more jobs|show more jobs)$/i }).first();
          const pager = current.locator('[class*="pagination" i], [class*="pager" i], [id*="pager" i], [aria-label*="pagination" i]');
          const nextControl = pager.getByRole("link", { name: /^next(?: page)?[ ›»→]*$/i })
            .or(pager.getByRole("button", { name: /^next(?: page)?[ ›»→]*$/i }))
            .or(current.locator('a[rel~="next"]')).first();
          const control = selector ? current.locator(selector).first() :
            await loadMore.isVisible().catch(() => false) ? loadMore : nextControl;
          if (step === maxInteractions || Date.now() - started > timeoutMs) {
            if (await control.isVisible().catch(() => false) || !unchanged) {
              limited = true;
              reportIssue(url, "Pagination interaction limit reached.");
            }
            break;
          }
          if (await control.isVisible().catch(() => false) && await control.isEnabled()) {
            const controlText = `${await control.textContent().catch(() => "")} ${await control.getAttribute("aria-label").catch(() => "")} ${await control.getAttribute("value").catch(() => "")}`;
            if (/\b(apply|submit|register|purchase|payment|sign in|sign up|log in)\b/i.test(controlText)) {
              reportIssue(url, "The configured control appears to submit or start an application, not paginate jobs. No click was performed.");
              break;
            }
            if (unchanged) {
              limited = true;
              reportIssue(url, "Pagination did not expose new jobs; a site-specific selector or longer render wait may be needed.");
              break;
            }
            // Only explicit pagination controls; never application or login buttons.
            await sleep(delayMs);
            await control.click();
          } else {
            if (unchanged) break;
            const before = await current.evaluate(() => document.documentElement.scrollHeight);
            await current.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await sleep(renderWaitMs);
            const after = await current.evaluate(() => document.documentElement.scrollHeight);
            if (after === before && step > 0) break;
          }
        }
        if (item.seed) {
          const detail = pageJobs.find(job => job.jobId && job.jobId === item.seed!.jobId) ??
            pageJobs.find(job => canonicalUrl(job.jobUrl) === canonicalUrl(item.seed!.jobUrl));
          jobs.push(detail ? enrichJob(item.seed, detail) : item.seed);
          if (!detail) reportIssue(url, "No matching detail JobPosting found; retaining only verified API fields.");
        } else {
          jobs.push(...pageJobs);
        }
      } catch (error) {
        if (item.seed) jobs.push(item.seed);
        reportIssue(url, error);
      }
    }
  } finally {
    await Promise.all([...networkTasks]);
    await browser?.close();
  }
  if (queue.length) {
    limited = true;
    // Do not discard already retrieved API jobs just because detail budget ran out.
    jobs.push(...queue.flatMap(item => item.seed ? [item.seed] : []));
  }
  const normalized = normalizeJobs(jobs, now);
  if (geography.requests) methods.add("API");
  return {
    rows: normalized.rows,
    report: {
      sourceUrl: start,
      process: [...methods].join(" + ") || (mode === "api" ? "API" : mode === "dom" ? "DOM" : "STATIC"),
      scrapedAt: now.toISOString(),
      window: dateWindow(now),
      status: limited || issues.length ? "partial" : recognized ? (normalized.rows.length ? "ok" : "no_matches") : "unsupported",
      pagesVisited, requests, candidates: jobs.length, rows: normalized.rows.length,
      limited, pendingUrls: queue.map(item => item.url), skipped: normalized.skipped, issues,
      dateFallbacks: normalized.dateFallbacks,
      dataNotes: normalized.dataNotes, locationEvidence: geography.evidence,
    },
  };
}
