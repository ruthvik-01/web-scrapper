import { pause as sleep, fetchWithRetries, paceOrigin, sharedCache, currentSignal, checkCancelled } from "./request-runtime.js";
import { createRequire } from "node:module";
import { chromium, type Browser, type Page } from "playwright";
import { load } from "cheerio";
import { atsBoard, enrichJob, mapAtsJobs } from "./ats.js";
import { detectAts, discoverLinks, extractJobs, type Selectors } from "./extract.js";
import { Geography } from "./geography.js";
import { decodeJobApi } from "./api.js";
import { discoverWordPressApiRoot, wordpressJobCollections, wordpressJobs } from "./wordpress.js";
import { assertAllowedJobSource, isNhsJobsUrl } from "./uk-scope.js";
import { canonicalUrl, dateWindow, hasRoleContent, normalizeJobs, parsePostedDate, ukLocation, type RawJob } from "./normalize.js";

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
  onProgress?: (update: CrawlProgress) => void;
}
export interface CrawlProgress {
  operation: string;
  currentUrl: string;
  pagesDiscovered: number;
  pagesProcessed: number;
  pagesTotal: number;
  jobsDiscovered: number;
  jobsProcessed: number;
  jobsFound: number;
  jobsSkipped: number;
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
      this.rules.set(origin, sharedCache(`robots:${origin}`, () => (async () => {
        const robotsUrl = `${origin}/robots.txt`;
        let target = robotsUrl;
        let response: Response;
        for (let redirects = 0; ; redirects++) {
          assertAllowedJobSource(target);
          response = await fetchWithRetries(target, { headers: { "User-Agent": USER_AGENT } }, this.timeoutMs, () => paceOrigin(target, this.delayMs));
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location || redirects >= 5) throw new Error("Cannot verify robots.txt redirect.");
          target = new URL(location, target).href;
        }
        if (response.status === 404 || response.status === 410) return robotsParser(robotsUrl, "");
        if (!response.ok) throw new Error(`Cannot verify robots.txt (HTTP ${response.status}); not crawling this origin.`);
        const content = await response.text();
        if (content.length > 500_000) throw new Error("robots.txt exceeds the safety limit.");
        return robotsParser(robotsUrl, content);
      })()));
    }
    return this.rules.get(origin)!;
  }

  async check(url: string): Promise<void> {
    checkCancelled();
    assertAllowedJobSource(url);
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
    await paceOrigin(url, delay);
    this.lastRequest.set(origin, Date.now());
  }

  private async request(url: string, accept?: string, extra: RequestInit = {}): Promise<Response> {
    return fetchWithRetries(url, { ...extra, headers: { "User-Agent": USER_AGENT, ...(accept ? { Accept: accept } : {}) } }, this.timeoutMs, () => this.pace(url));
  }
  async postJson(url: string, body: URLSearchParams): Promise<unknown> {
    const response = await this.request(url, "application/json", { method: "POST", body });
    if (!response.ok) throw new Error(`Public listing returned HTTP ${response.status}.`);
    return response.json();
  }

  async jsonPage(url: string, redirects = 0): Promise<{ url: string; headers: Headers; data: unknown }> {
    const response = await this.request(url, "application/json");
    if (response.status >= 300 && response.status < 400) {
      const next = canonicalUrl(response.headers.get("location") || "", url);
      if (!next || redirects >= 5) throw new Error("Invalid or excessive API redirects.");
      return this.jsonPage(next, redirects + 1);
    }
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}.`);
    const body = await response.text();
    if (body.length > 20_000_000) throw new Error("API response exceeds 20 MB.");
    return { url, headers: response.headers, data: JSON.parse(body) };
  }

  async json(url: string, redirects = 0): Promise<unknown> {
    return (await this.jsonPage(url, redirects)).data;
  }

  async html(url: string, redirects = 0): Promise<{ url: string; body: string }> {
    const response = await this.request(url);
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
  return !posted || !job.company || !hasRoleContent(job.description, job.title) || !job.locations.some(ukLocation);
}

function advertisedListingPages(html: string, pageUrl: string): number {
  const $ = load(html);
  const declared = Number($("[data-total-pages], [data-page-count]").first().attr("data-total-pages") ||
    $("[data-page-count]").first().attr("data-page-count") ||
    $('meta[name="totalPages"], meta[name="total-pages"]').first().attr("content"));
  if (Number.isSafeInteger(declared) && declared > 0) return declared;
  const last = $('a[rel~="last"], link[rel~="last"]').first().attr("href");
  if (last) {
    try {
      const page = Number(new URL(last, pageUrl).searchParams.get("page"));
      if (Number.isSafeInteger(page) && page > 0) return page;
    } catch { /* Invalid last links are ignored. */ }
  }
  return 0;
}

export async function scrapeCompany(inputUrl: string, options: ScrapeOptions = {}) {
  const start = canonicalUrl(inputUrl);
  if (!start) throw new Error("Provide an HTTP(S) company/careers URL without embedded credentials.");
  const now = options.now ?? new Date();
  const mode = options.mode || "auto";
  if (!["auto", "api", "static", "dom"].includes(mode)) throw new Error("Unsupported extraction mode.");
  // The frontier ends at the site's last link/cursor, not at a default page count.
  // This ceiling only guards against a broken site emitting an endless URL stream.
  const maxPages = options.maxPages ?? 10_000;
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
  const seenApiJobs = new Set<string>();
  const handledWordPressRoots = new Map<string, boolean>();
  const methods = new Set<string>();
  const geography = new Geography();
  const redirects = new Map<string, string>();
  let browser: Browser | undefined;
  let page: Page | undefined;
  let requests = 0;
  let pagesVisited = 0;
  const visitedPages = new Set<string>();
  const markVisited = (url: string): void => {
    if (!visitedPages.has(url)) { visitedPages.add(url); pagesVisited++; }
  };
  let recognized = false;
  let limited = false;
  let listingPagesAdvertised = 0;
  let previousListingSignature = "";
  let previousListingUrl = "";
  let staleListingPages = 0;
  const isListingPage = (url: string): boolean => new URL(url).pathname === new URL(start).pathname;
  const isJobDetailPage = (url: string): boolean => {
    const path = new URL(url).pathname;
    if (/\/Careers\/[^/]*VSP-\d+\/?$/i.test(path)) return false;
    if (/\/Jobs\/Advert\/\d+(?:\/|$)/i.test(path)) return true;
    if (/\/(?:jobs?|vacanc(?:y|ies)|positions?|roles?)\/\d+(?:\/|$)/i.test(path)) return true;
    if (/\/(?:job|jobs|vacanc(?:y|ies)|posting)\/[^/]+\/[^/]+/i.test(path)) return true;
    const match = /\/(?:jobs?|careers?|vacanc(?:y|ies)|positions?|roles?)\/([^/?]+)\/?$/i.exec(path);
    return Boolean(match && !/^(?:search|results?|list(?:ings?)?|all|openings?|jobs?|careers?|vacanc(?:y|ies)|positions?|roles?)$/i.test(match[1]!));
  };
  const isPaginationLink = (url: string, from: string): boolean => {
    const target = new URL(url), source = new URL(from);
    return target.origin === source.origin && target.pathname === source.pathname &&
      ["page", "offset", "startrow", "skip", "p"].some(key => target.searchParams.get(key) !== source.searchParams.get(key));
  };
  const keepPagination = (url: string, links: string[], extracted: RawJob[]): string[] => {
    if (!isListingPage(url)) return links;
    if (url === previousListingUrl) return links;
    previousListingUrl = url;
    const pagination = links.filter(link => isPaginationLink(link, url));
    if (!pagination.length) return links;
    const candidates = [
      ...extracted.map(job => job.jobUrl || job.jobId || "").filter(Boolean),
      ...links.filter(link => !isPaginationLink(link, url) && /\/(?:jobs?|vacanc(?:y|ies)|positions?)\//i.test(new URL(link).pathname)),
    ];
    const signature = JSON.stringify([...new Set(candidates)].sort());
    staleListingPages = signature === previousListingSignature ? staleListingPages + 1 : 0;
    previousListingSignature = signature;
    if (staleListingPages < 2) return links;
    limited = true;
    reportIssue(url, "Pagination repeated the same job listings on consecutive pages; stopped the next-page chain.");
    return links.filter(link => !isPaginationLink(link, url));
  };
  const networkTasks = new Set<Promise<void>>();
  const reportIssue = (url: string, error: unknown): void => {
    const issue = { url, message: error instanceof Error ? error.message : String(error) };
    if (!issues.some(existing => existing.url === url && existing.message === issue.message)) issues.push(issue);
  };
  const progress = (operation: string, currentUrl: string, currentJobs = 0): void => options.onProgress?.({
    operation, currentUrl, pagesDiscovered: scheduled.size, pagesProcessed: pagesVisited,
    pagesTotal: 0, // The total number of pages is unknown until discovery finishes.
    jobsDiscovered: jobs.length + currentJobs, jobsProcessed: jobs.length,
    jobsFound: jobs.length + currentJobs, jobsSkipped: 0,
  });
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

  async function collectWordPressJobs(html: string, pageUrl: string): Promise<boolean> {
    const root = discoverWordPressApiRoot(html, pageUrl);
    if (!root) return false;
    if (handledWordPressRoots.has(root)) return handledWordPressRoots.get(root)!;
    handledWordPressRoots.set(root, false);
    const requestJson = async (target: string) => {
      if (requests >= maxPages) {
        limited = true;
        enqueue(target, undefined, pageUrl);
        return undefined;
      }
      requests++;
      progress("Reading public WordPress jobs…", target);
      const response = await policy.jsonPage(target);
      markVisited(response.url);
      return response;
    };
    try {
      const typesUrl = new URL("wp/v2/types", root).href;
      const typesResponse = await requestJson(typesUrl);
      if (!typesResponse) return false;
      const collections = wordpressJobCollections(typesResponse.data, root);
      if (!collections.length) return false;

      for (const collection of collections) {
        const endpoint = new URL(collection);
        endpoint.searchParams.set("per_page", "100");
        for (let page = 1; ; page++) {
          endpoint.searchParams.set("page", String(page));
          const target = endpoint.href;
          const response = await requestJson(target);
          if (!response) return true;
          if (!Array.isArray(response.data)) {
            reportIssue(target, "WordPress job collection returned an unsupported response shape.");
            break;
          }
          recognized = true;
          methods.add("API");
          const totalPages = Number(response.headers.get("x-wp-totalpages"));
          if (Number.isSafeInteger(totalPages) && totalPages > 0) {
            listingPagesAdvertised = Math.max(listingPagesAdvertised, totalPages);
          }
          const batch = wordpressJobs(response.data, target, options.company);
          for (const job of batch) {
            const key = `${job.jobId}|${job.jobUrl}`;
            if (seenApiJobs.has(key)) continue;
            seenApiJobs.add(key);
            if (mode !== "api" && usefulDetail(job, now) && job.jobUrl) enqueue(job.jobUrl, job, pageUrl);
            else jobs.push(job);
          }
          if (Number.isSafeInteger(totalPages) && totalPages > 0) {
            if (page >= totalPages) break;
          } else if (response.data.length < 100) break;
          if (requests >= maxPages) {
            limited = true;
            const next = new URL(endpoint);
            next.searchParams.set("page", String(page + 1));
            enqueue(next.href, undefined, pageUrl);
            return true;
          }
        }
      }
      handledWordPressRoots.set(root, true);
      return true;
    } catch (error) {
      reportIssue(root, error);
      return false;
    }
  }

  const skipHandledWordPressApi = (url: string, handled: boolean): boolean => {
    if (!handled) return false;
    return [...handledWordPressRoots].some(([root, found]) => found && url.startsWith(root));
  };

  async function getPage(): Promise<Page> {
    checkCancelled();
    if (page) return page;
    try {
      browser = await chromium.launch({
        headless: true,
        timeout: timeoutMs,
        ...(options.browser && options.browser !== "chromium" ? { channel: options.browser } : {}),
      });
      const signal = currentSignal();
      const stopBrowser = () => { void browser?.close().catch(() => {}); };
      signal?.addEventListener("abort", stopBrowser, { once: true });
      browser.on("disconnected", () => signal?.removeEventListener("abort", stopBrowser));
      if (signal?.aborted) { await browser.close(); signal.throwIfAborted(); }
    } catch (error) {
      throw new Error(`Cannot launch browser. Run "npx playwright install chromium" or use --browser chrome/--browser msedge. ${String(error)}`);
    }
    const context = await browser.newContext({ userAgent: USER_AGENT, serviceWorkers: "block" });
    await context.route("**/*", async route => {
      try {
        const request = route.request();
        if (isNhsJobsUrl(request.url())) return await route.abort().catch(() => {});
        if (["image", "media", "font"].includes(request.resourceType())) return await route.abort().catch(() => {});
        if (["xhr", "fetch"].includes(request.resourceType()) && request.method() === "GET") {
          try { await policy.check(request.url()); }
          catch (error) {
            if (new URL(request.url()).origin === new URL(start).origin || atsBoard(request.url())) reportIssue(request.url(), error);
            return await route.abort().catch(() => {});
          }
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
                await route.fulfill({ status: 200, contentType: "text/html", body: "" }).catch(() => {});
              } else {
                await route.fulfill({ response }).catch(() => {});
              }
            } finally {
              await response.dispose().catch(() => {});
            }
            return;
          } catch (error) {
            const relevant = request.frame() === page?.mainFrame() ||
              new URL(request.url()).origin === new URL(start).origin || Boolean(atsBoard(request.url()));
            if (relevant && !/timeout|ERR_|net::/i.test(String(error))) reportIssue(request.url(), error);
            return await route.abort().catch(() => {});
          }
        }
        return await route.continue().catch(() => {});
      } catch {
        /* Route handling races on aborted pages are ignored. */
      }
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
          for (const job of decoded.jobs) {
            const resolved = await geography.resolve(job);
            if (mode !== "api" && !isJobDetailPage(page?.url() || start) && usefulDetail(resolved, now)) {
              enqueue(resolved.jobUrl, resolved, response.url());
            } else jobs.push(resolved);
          }
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
      let response: Awaited<ReturnType<Page["goto"]>> = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await current.goto(target, { waitUntil: isListingPage(target) ? "domcontentloaded" : "commit", timeout: timeoutMs });
          if (response && [429, 500, 502, 503, 504].includes(response.status()) && attempt < 1) {
            await sleep((attempt + 1) * 1000);
            continue;
          }
          break;
        } catch (error) {
          if (attempt === 1 || !/timeout|ERR_|net::/i.test(String(error))) throw error;
          await sleep((attempt + 1) * 1000);
        }
      }
      if (!response || !response.ok()) throw new Error(`Page returned HTTP ${response?.status() ?? "unknown"}.`);
      const next = redirects.get(current.url());
      if (!next) return;
      target = next;
    }
    throw new Error("Excessive document redirects.");
  }

  try {
    while (queue.length && requests < maxPages) {
      checkCancelled();
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
              const fresh = batch.filter(job => !seenApiJobs.has(`${job.jobId}|${job.jobUrl}`));
              for (const job of fresh) seenApiJobs.add(`${job.jobId}|${job.jobUrl}`);
              if (batch.length && !fresh.length) {
                limited = true;
                reportIssue(endpoint.href, "ATS pagination repeated jobs without any new vacancies.");
                break;
              }
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
          markVisited(document.url);
          const wordpressHandled = await collectWordPressJobs(document.body, document.url);
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
          listingPagesAdvertised ||= advertisedListingPages(document.body, document.url);
          if (extracted.length) recognized = true;
          const pageJobs: RawJob[] = [];
          for (const job of extracted) pageJobs.push(await geography.resolve(job));
          if (item.seed) {
            const detail = pageJobs.find(job => job.jobId && job.jobId === item.seed!.jobId) ??
              pageJobs.find(job => canonicalUrl(job.jobUrl) === canonicalUrl(item.seed!.jobUrl));
            jobs.push(await geography.resolve(detail ? enrichJob(item.seed, detail) : item.seed));
            if (!detail) reportIssue(url, "No matching detail vacancy found; retaining the public API fields.");
          } else jobs.push(...pageJobs);
          const links = keepPagination(document.url,
            discoverLinks(document.body, document.url, options.selectors, start), extracted);
          if (!item.seed && !isJobDetailPage(document.url)) for (const link of links) {
            if (!skipHandledWordPressApi(link, wordpressHandled)) enqueue(link, undefined, document.url);
          }
          if (/__doPostBack\([^)]*(?:Pager|Pagination)/i.test(document.body) ||
              /<(?:button)[^>]*>[^<]*(?:load more|show more jobs)/i.test(document.body)) {
            reportIssue(url, "JavaScript pagination was found; use DOM mode to reach additional pages.");
          }
          continue;
        }
        methods.add("DOM");
        const current = await getPage();
        if (pagesVisited) progress("Visiting another page…", url);
        await navigate(current, url);
        if (/(^|\.)current-vacancies\.com$/i.test(new URL(current.url()).hostname) &&
            /\/Jobs\/Advert\/\d+/i.test(new URL(current.url()).pathname)) {
          await current.waitForFunction(() => {
            const role = document.querySelector("#GlobalContent_HeaderTitle1 + div.container");
            return (role?.textContent?.trim().length || 0) >= 80;
          }, null, { timeout: Math.min(timeoutMs, 12_000) }).catch(() => {
            reportIssue(current.url(), "Job advert did not render a complete role section before the extraction timeout.");
          });
        }
        markVisited(current.url());
        const pageJobs: RawJob[] = [];
        const fingerprints = new Set<string>();
        let lastFingerprint = "";
        const maxInteractions = options.maxPages ?? 10_000;
        for (let step = 0; step <= maxInteractions; step++) {
          await sleep(renderWaitMs);
          await Promise.all([...networkTasks]);
          const redirected = redirects.get(current.url());
          if (redirected) await navigate(current, redirected);
          const pageUrl = current.url();
          const html = await current.content();
          const wordpressHandled = await collectWordPressJobs(html, current.url());
          listingPagesAdvertised ||= advertisedListingPages(html, pageUrl);
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
          const links = keepPagination(pageUrl, discoverLinks(html, pageUrl, options.selectors, start), extracted);
          if (!item.seed && !isJobDetailPage(pageUrl)) for (const link of links) {
            if (!skipHandledWordPressApi(link, wordpressHandled)) enqueue(link, undefined, pageUrl);
          }
          const fingerprint = JSON.stringify([links, [...fingerprints]]);
          const unchanged = step > 0 && fingerprint === lastFingerprint;
          markVisited(pageUrl);
          lastFingerprint = fingerprint;
          const update = (operation: string): void => progress(operation, pageUrl, pageJobs.length);
          update(`Reading job listings (${pageJobs.length} found on this page)…`);
          if (item.seed || isJobDetailPage(pageUrl)) {
            if (!pageJobs.length) reportIssue(url, "Job detail page did not expose a vacancy.");
            break;
          }
          const selector = options.selectors?.loadMore || options.selectors?.next;
          const loadMore = current.getByRole("button", { name: /^(?:(?:load|show|view|see)\s+(?:\d+\s+)?(?:more|additional)(?:\s+(?:jobs?|vacancies|positions?|roles?))?(?:\s+of\s+\d+\s+remaining)?|more\s+(?:jobs?|vacancies|positions?|roles?))$/i }).first();
          const pager = current.locator('[class*="pagination" i], [class*="pager" i], [id*="pager" i], [aria-label*="pagination" i]');
          const nextControl = pager.getByRole("link", { name: /^next(?: page)?[ ›»→]*$/i })
            .or(pager.getByRole("button", { name: /^next(?: page)?[ ›»→]*$/i }))
            .or(current.locator('a[rel~="next"]')).first();
          const control = selector ? current.locator(selector).first() :
            await loadMore.isVisible().catch(() => false) ? loadMore : nextControl;
          if (step === maxInteractions) {
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
            update("Loading more jobs…");
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
  return {
    rows: normalized.rows,
    rawJobs: jobs,
    report: {
      sourceUrl: start,
      process: [...methods].join(" + ") || (mode === "api" ? "API" : mode === "dom" ? "DOM" : "STATIC"),
      scrapedAt: now.toISOString(),
      window: dateWindow(now),
      status: limited || issues.length ? "partial" : recognized ? (normalized.rows.length ? "ok" : "no_matches") : "unsupported",
      pagesVisited, requests, candidates: jobs.length, rows: normalized.rows.length,
      listingPagesAdvertised, boundary: limited ? "incomplete" : "discovered_end",
      limited, pendingUrls: queue.map(item => item.url), skipped: normalized.skipped, issues,
      dateFallbacks: normalized.dateFallbacks,
      dataNotes: normalized.dataNotes, locationEvidence: geography.evidence,
    },
  };
}
