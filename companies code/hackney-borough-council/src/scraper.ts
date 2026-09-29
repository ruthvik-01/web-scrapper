import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import { JudgmentCache } from "./cache.js";
import { dateWindow, monthsBackWindow, parseDate } from "./dates.js";
import { extractHeuristicFromDom, extractJobsFromDom, pageLinks } from "./extract.js";
import { Http } from "./fetch.js";
import { Jev, type Answer, type ChoiceAnswer } from "./jev.js";
import { Timings, histogram } from "./metrics.js";
import { isUkCountry, isUnknownCountry, parseSalary, plainText, canonicalUrl, cleanTitle, cleanDescription, labelledFacts, type RawJob } from "./normalize.js";
import { judgeJob, judgeLinks, judgeSite, obviouslyNotVacancy, choiceValue, boolValue, type JobJudgment, type SiteJudgment } from "./questions.js";
import { pool } from "./pool.js";
import { toCsv } from "./csv.js";
import { Progress, type ProgressSnapshot } from "./progress.js";
import { collectAtsJobs, detectAts, type AtsDetection } from "./ats.js";

export const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline", "company",
  "salaryRange", "employmentType", "worktype", "location", "city", "state", "country",
  "jevConfidence", "judged", "ats",
] as const;
export type Row = Record<(typeof COLUMNS)[number], string>;

export interface ScrapeConfig {
  url: string;
  company: string;
  out: string;
  mode: "auto" | "schema" | "crawl" | "sitemap";
  maxPages: number;
  concurrency: number;
  delayMs: number;
  confidence: number;
  monthsBack: number;
  timeoutMs: number;
  /** Only keep vacancies whose recruiting organisation matches one of these. */
  employers?: string[];
  /** Public job sitemap; skips link triage entirely (fastest path). */
  sitemapUrl?: string;
  /** Progress sink for embedding hosts (the dashboard worker). */
  onLog?: (line: string) => void;
  /** Structured execution-state sink: stage, counters and heartbeat. */
  onEvent?: (snapshot: ProgressSnapshot) => void;
  /** Optional ATS detection override (embedding hosts and local fixtures). */
  detectAts?: typeof import("./ats.js").detectAts;
  /** Judgment cache location; defaults to <out>/jev-cache.json. */
  cachePath?: string;
}

export interface ScrapeReport {
  company: string;
  sourceUrl: string;
  mode: string;
  scrapedAt: string;
  window: { from: string; to: string };
  candidates: number;
  rows: number;
  skipped: number;
  issues: string[];
  dateFallbacks: DateFallback[];
  performance: {
    totalRuntimeMs: number;
    pagesDiscovered: number;
    pagesFetched: number;
    duplicateUrls: number;
    pagesRejectedDeterministically: number;
    pagesSentToJev: number;
    throughputPagesPerSec: number;
    http: Record<string, unknown>;
    parse: Record<string, unknown>;
    jev: Record<string, unknown>;
    linkFunnel?: Record<string, number>;
    skipReasons: Record<string, number>;
  };
  jev: { estimatedCostUsd: number; available: boolean; usableAtEnd: boolean; [key: string]: unknown };
  judgedBy: { jev: number; deterministic: number };
  /** Detected ATS / career platform label; "" for a generic custom site. */
  ats?: string;
  process: string;
}

export interface DateFallback { jobUrl: string; assignedDate: string }

export interface Skipped {
  jobUrl: string;
  title: string;
  reason: string;
}

interface Decision {
  key: string;
  kind: string;
  answer: string;
  probability: number | "";
  confidence: number | "";
}

const ESCAPE = /^(not stated|not sure|other or none|unknown)$/i;

/**
 * Deterministic fallback when Jev is unavailable: classify a link from its URL
 * path and visible label only. Never invents; confidence reflects the match.
 */
function heuristicLinkVerdict(link: { url: string; label: string }): ChoiceAnswer {
  const path = (new URL(link.url).pathname + " " + link.label).toLowerCase();
  const nav = /(about|contact|privacy|terms|blog|news|login|signin|register|search|faq|team|culture|benefits|apply)/;
  const vacancy = /(job|vacanc|role|position|opening|career|apply|\/\d{4,})/;
  const listing = /(jobs|vacancies|openings|search|all-jobs|departments|teams)/;
  let choice = "not sure";
  if (nav.test(path)) choice = "navigation";
  else if (vacancy.test(path)) choice = "vacancy";
  else if (listing.test(path)) choice = "job listing";
  const confidence = choice === "not sure" ? 0.4 : 0.7;
  return { type: "choice", choice, probabilities: { [choice]: confidence }, confidence };
}

/** Confidence-gated Choice: ignore low-confidence or escape answers. */
function gatedChoice(answers: Record<string, Answer>, key: string, threshold: number): string {
  const answer = choiceValue(answers, key);
  if (!answer || answer.confidence < threshold || ESCAPE.test(answer.choice)) return "";
  return answer.choice;
}

function looksRecent(postedDate: string, from: string, to: string): boolean {
  if (!postedDate) return true; // unknown date: keep, Jev does not parse dates
  return postedDate >= from && postedDate <= to;
}

/**
 * A rate limit, auth failure or exhausted quota will not recover within a run,
 * so stop calling Jev and finish the run deterministically instead of stalling.
 */
function isHardJevFailure(message: string): boolean {
  return /HTTP (401|402|403|429)|rate.limit|quota|credit|unauthor/i.test(message);
}

export async function scrape(config: ScrapeConfig): Promise<{ rows: Row[]; skipped: Skipped[]; report: ScrapeReport }> {
  const progress = new Progress({
    company: config.company,
    onEvent: config.onEvent,
    onLog: line => { console.log(line); config.onLog?.(line); },
  });
  try {
    return await run(config, progress);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    progress.log(`[${config.company}] FAILED: ${message}`);
    progress.fail(message);
    throw error;
  }
}

async function run(config: ScrapeConfig, progress: Progress): Promise<{ rows: Row[]; skipped: Skipped[]; report: ScrapeReport }> {
  const startedAt = Date.now();
  const log = (line: string): void => progress.log(line);
  progress.setStage("DISCOVERY", "Starting", config.url);
  const http = new Http(config.delayMs, config.timeoutMs, config.concurrency);
  const jev = new Jev({ timeoutMs: config.timeoutMs });
  // Input-keyed judgment cache: in-memory for this run, on-disk (per out dir)
  // so reruns and debug runs skip re-judging identical pages. JEV_CACHE=0
  // keeps the run memory-only.
  const cacheFile = config.cachePath ?? resolve(config.out, "jev-cache.json");
  const cache = await JudgmentCache.open(process.env.JEV_CACHE === "0" ? undefined : cacheFile);
  jev.cache = cache;
  let jevUsable = jev.live; // flipped off permanently on a hard Jev failure
  const now = new Date();
  const window = config.monthsBack === 2 ? dateWindow(now) : monthsBackWindow(now, config.monthsBack);
  const from = window.from, to = window.to;
  const decisions: Decision[] = [];
  const skipped: Skipped[] = [];
  const issues: string[] = [];
  const parseMs = new Timings();
  const jevMs = new Timings();
  const processed = new Set<string>(); // final-URL dedupe across workers
  let duplicateUrls = 0;
  let rejectedBeforeJev = 0;
  let jevPageCalls = 0;
  let jevFailures = 0;
  const linkFunnel = { discovered: 0, filteredBeforeJev: 0, judged: 0, vacancy: 0, listing: 0 };

  // --- Stage 1: collect candidate vacancy URLs ------------------------------
  const listingPages = new Set<string>([config.url]);
  const vacancyUrls = new Set<string>();
  let sitemapUsed = false; // candidates came from a sitemap (Eploy live-jobs.xml or explicit)
  const dateFallbacks: DateFallback[] = [];
  const addVacancyUrl = (value: string): void => {
    const canonical = canonicalUrl(value);
    if (canonical) vacancyUrls.add(canonical);
  };

  // --- ATS / career-platform detection ---------------------------------------
  // A known platform adapter turns the board's own public data into normalized
  // jobs, which then flow through the same per-job Jev pipeline as everything
  // else. An unknown platform, or an adapter whose public data cannot be read,
  // falls through to the probe/sitemap/crawl strategies below.
  const detection = (config.detectAts ?? detectAts)(config.url);
  let seedJobs: RawJob[] = [];
  let atsSource = "";
  if (detection) {
    progress.ats = detection.ats;
    progress.emit();
  }
  if (detection && detection.kind !== "label" && config.mode === "auto" && !config.sitemapUrl) {
    progress.setStage("DISCOVERY", `Reading the ${detection.ats} public job feed`, config.url);
    log(`[${config.company}] Detected ${detection.ats}; reading its public job feed…`);
    try {
      const collected = await collectAtsJobs(detection, config.url, http, log);
      seedJobs = collected.jobs.filter(job => job.jobUrl);
      atsSource = collected.source;
      progress.jobsDiscovered = seedJobs.length;
      progress.pagesDiscovered = seedJobs.length;
      progress.emit();
      log(`[${config.company}] ${detection.ats}: ${seedJobs.length} jobs discovered via ${collected.source}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`${detection.ats} adapter: ${message}`);
      log(`[${config.company}] ${detection.ats} feed unavailable (${message}); trying generic strategies…`);
      seedJobs = [];
    }
  } else if (detection) {
    log(`[${config.company}] Detected ${detection.ats}; collecting with the generic strategies.`);
  }

  // Site probe: in auto mode, ONE Jev call on the landing page classifies how
  // the site exposes jobs before any crawl spends time on it. A JS-rendered  // shell or a non-jobs page fails fast (one fetch + one call) instead of  // burning the whole page budget on a site static HTML cannot read.
  let probe: SiteJudgment | undefined;
  let probeLinks: { url: string; label: string }[] = [];
  if (!seedJobs.length && config.mode === "auto" && !config.sitemapUrl && jevUsable) {
    try {
      progress.setStage("DISCOVERY", "Loading careers page…", config.url);
      log(`[${config.company}] Loading careers page…`);
      const { body: probeHtml, url: probeUrl } = await http.html(config.url);
      const $probe = load(probeHtml);
      const jobsHere = extractJobsFromDom($probe, probeUrl);
      if (jobsHere.length) {
        // Structured data on the landing page itself: no judgment needed.
        for (const job of jobsHere) addVacancyUrl(job.jobUrl);
        log(`[${config.company}] Probe: structured JobPosting data found on the landing page (${jobsHere.length}).`);
      } else {
        progress.update("Classifying the careers page with Jev…", probeUrl);
        probeLinks = pageLinks(probeHtml, probeUrl).slice(0, 60);
        const links = probeLinks;
        const probeText = plainText($probe("main, article, #content, .job-listing, body").first().text());
        probe = await judgeSite(jev, {
          url: probeUrl,
          title: plainText($probe("title").first().text()),
          body: probeText,
          links,
        });
        log(`[${config.company}] Probe: ${probe.siteType} (${probe.confidence.toFixed(2)}), links look like "${probe.linkHint}".`);
        if (probe.siteType === "js rendered" && probe.confidence >= config.confidence) {
          issues.push(`site probe: careers page appears to render jobs client-side; static HTML exposes no vacancies (${probeUrl})`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`site probe failed: ${message}`);
      if (isHardJevFailure(message)) jevUsable = false;
    }
    // Eploy boards paginate via form POST (no ?page= links), but publish a
    // live-jobs.xml sitemap with every vacancy. Try it before crawling — on
    // the careers host first, then on a dedicated board host linked from the
    // careers page (e.g. osborneclarke.com → careers.osborneclarke.com).
    if (!config.sitemapUrl && !sitemapUsed && vacancyUrls.size < 5) {
      const hosts = new Set<string>([new URL(config.url).origin]);
      // A same-brand careers-board link ("careers.X.com", "jobs.X.com") on the
      // marketing page points at the real vacancy source.
      for (const link of probeLinks) {
        try {
          const u = new URL(link.url);
          const brand = new URL(config.url).hostname.replace(/^www\./, "").split(".")[0] ?? "";
          if (brand && u.hostname !== new URL(config.url).hostname &&
              /^(careers?|jobs|vacanc)/i.test(u.hostname) &&
              u.hostname.includes(brand)) hosts.add(u.origin);
        } catch { /* skip malformed link targets */ }
      }
      for (const origin of hosts) {
        try {
          const eployUrl = `${origin}/live-jobs.xml`;
          const { body: xml } = await http.html(eployUrl);
          const $xml = load(xml, { xmlMode: true });
          if ($xml("urlset").length && $xml("url > loc").length >= 10) {
            for (const node of $xml("url > loc").toArray()) addVacancyUrl($xml(node).text().trim());
            sitemapUsed = true;
            log(`[${config.company}] Sitemap: ${vacancyUrls.size} vacancy URLs from ${eployUrl}.`);
            break;
          }
        } catch { /* not an Eploy board; try the next host */ }
      }
    }
  }
  if (probe?.siteType === "js rendered" && probe.confidence >= config.confidence) {
    // Fast-fail: every remaining strategy is static and cannot see the jobs.
    // This is a FAILED state with a useful reason — not a silent empty result.
    throw new Error(
      `Careers page renders jobs client-side (JavaScript) and no ATS adapter, sitemap or embedded job data is available for ${config.url}. ` +
      "Retry with the deterministic engine in DOM mode, or configure the board's public sitemap/API URL.",
    );
  }

  if (!seedJobs.length && (config.sitemapUrl || config.mode === "sitemap")) {
    sitemapUsed = true;
    // Fastest path: the sitemap already enumerates the vacancy URLs, so no link
    // triage calls are needed. Sitemap indexes are followed one level deep.
    progress.setStage("DISCOVERY", "Reading job sitemap…", config.sitemapUrl || config.url);
    log(`[${config.company}] Reading job sitemap…`);
    const maps = [config.sitemapUrl || `${new URL(config.url).origin}/sitemap.xml`];
    const seenMaps = new Set<string>();
    let rawUrls = 0;
    while (maps.length && seenMaps.size < 10) {
      const mapUrl = maps.shift()!;
      if (seenMaps.has(mapUrl)) continue;
      seenMaps.add(mapUrl);
      let xml: string;
      try {
        ({ body: xml } = await http.html(mapUrl));
      } catch (error) {
        issues.push(`${mapUrl}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const $ = load(xml, { xmlMode: true });
      const isIndex = $("sitemapindex").length > 0;
      for (const node of $("sitemap > loc, url > loc").toArray()) {
        const loc = $(node).text().trim();
        if (isIndex) maps.push(loc);
        else { rawUrls++; addVacancyUrl(loc); }
      }
    }
    duplicateUrls += rawUrls - vacancyUrls.size;
    log(`[${config.company}] Sitemap: ${vacancyUrls.size} vacancy URLs from ${seenMaps.size} file(s).`);
  } else if (!seedJobs.length && config.mode !== "schema") {
    // Breadth-first crawl of up to `maxPages` pages, Jev triaging links.
    // Deterministically rejectable links never reach triage.
    progress.setStage("DISCOVERY", "Crawling listing pages", config.url);
    const queue = [config.url];
    const seen = new Set<string>(queue);
    while (queue.length && seen.size < config.maxPages) {
      const url = queue.shift()!;
      progress.update(`Crawling listing page ${seen.size}/${config.maxPages} (${vacancyUrls.size} candidates so far)`, url);
      let html: string, finalUrl: string;
      try {
        ({ body: html, url: finalUrl } = await http.html(url));
      } catch (error) {
        issues.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (extractJobsFromDom(load(html), finalUrl).length) addVacancyUrl(finalUrl);
      const allLinks = pageLinks(html, finalUrl).slice(0, 60);
      // Deterministic pagination: ?page=N, /page/N and /results/N style
      // links on a listing page are followed without triage so late-page
      // vacancies are not lost.
      for (const link of allLinks) {
        const path = new URL(link.url).pathname + new URL(link.url).search;
        if (!/(?:[?&]page=\d+|\/(?:page|results)\/\d+)/i.test(path)) continue;
        if (!seen.has(link.url)) { seen.add(link.url); listingPages.add(link.url); queue.push(link.url); }
      }
      linkFunnel.discovered += allLinks.length;
      const links = allLinks.filter(link => !obviouslyNotVacancy(link.url));
      linkFunnel.filteredBeforeJev += allLinks.length - links.length;
      if (!links.length) continue;
      progress.update(`Triaging ${links.length} candidate links with Jev…`, finalUrl);
      let verdicts: Awaited<ReturnType<typeof judgeLinks>> | undefined;
      if (jevUsable) {
        const started = Date.now();
        try {
          verdicts = await judgeLinks(jev, links);
          jevMs.add(Date.now() - started);
        } catch (error) {
          jevFailures++;
          // Jev is best-effort: fall back to a conservative URL/label heuristic so a
          // transient gateway error never discards a whole listing page.
          const message = error instanceof Error ? error.message : String(error);
          issues.push(`link triage fell back to heuristic on ${url}: ${message}`);
          if (isHardJevFailure(message)) jevUsable = false;
        }
      }
      verdicts ||= links.map(link => ({ ...link, answer: heuristicLinkVerdict(link) }));
      linkFunnel.judged += verdicts.length;
      for (const verdict of verdicts) {
        if (seen.has(verdict.url)) continue;
        const keep =
          verdict.answer.confidence >= config.confidence &&
          (verdict.answer.choice === "vacancy" || verdict.answer.choice === "job listing");
        if (!keep) continue;
        seen.add(verdict.url);
        if (verdict.answer.choice === "vacancy") { linkFunnel.vacancy++; vacancyUrls.add(verdict.url); }
        else { linkFunnel.listing++; listingPages.add(verdict.url); queue.push(verdict.url); }
      }
    }
  } else if (!seedJobs.length) {
    vacancyUrls.add(config.url);
  }

  // --- Stage 2: fetch each vacancy page and judge it with Jev ----------------
  // Sitemap-sourced candidates are the board's actual vacancy list, so they
  // are not truncated by maxPages (which only limits crawl discovery). A
  // generous hard cap guards against runaway duplicates.
  const cap = sitemapUsed ? Math.max(config.maxPages, Math.min(vacancyUrls.size, 5000)) : config.maxPages;
  const targets = [...vacancyUrls].slice(0, cap);
  const rows: Row[] = [];
  const totalJobs = seedJobs.length || targets.length;
  progress.pagesDiscovered = totalJobs;
  progress.jobsDiscovered = totalJobs;
  progress.pagesTotal = totalJobs;
  progress.emit();
  log(`[${config.company}] Found ${totalJobs} candidate job page${totalJobs === 1 ? "" : "s"}${atsSource ? ` via ${atsSource}` : ""}.`);
  if (!seedJobs.length && totalJobs === 0 && config.mode === "auto") {
    // Every discovery strategy came up empty. Distinguish a JavaScript-rendered
    // shell (FAILED with a useful reason) from a genuinely empty board.
    try {
      const { body, url: finalUrl } = await http.html(config.url);
      const $ = load(body);
      const shell = extractJobsFromDom($, finalUrl).length === 0
        && pageLinks(body, finalUrl).length < 3
        && plainText($("body").text()).length < 400
        && $("script, link[rel=modulepreload], iframe").length >= 2;
      if (shell) {
        throw new Error(
          `Careers page appears to render jobs client-side (JavaScript) and no ATS adapter, sitemap or embedded job data is available for ${config.url}. ` +
          "Retry with the deterministic engine in DOM mode, or configure the board's public sitemap/API URL.");
      }
    } catch (error) {
      if (error instanceof Error && /client-side/.test(error.message)) throw error;
      // Anything else (network blip): fall through to the ordinary no-jobs report.
    }
  }

  // Every discovered job runs one full cycle: extract structured data, then
  // exactly one Jev decision for THAT job, then store the result. judgeAndStore
  // is the shared tail of the cycle, used by fetched pages and ATS feed seeds.
  const judgeAndStore = async (finalUrl: string, job: RawJob, pageBody: string): Promise<void> => {
    if (!job.title) return;

    // Cheap content gate: a page with no usable title and almost no text is an
    // empty shell (client-rendered SPA route, soft 404, or bot-wall). Jev has
    // nothing to judge there, so skip before spending a call.
    const usableBody = (job.description || pageBody || "").trim();
    if (/^(untitled|\s*)$/i.test(job.title) && usableBody.length < 200) {
      rejectedBeforeJev++;
      skipped.push({ jobUrl: finalUrl, title: job.title, reason: "empty_page_shell" });
      return;
    }

    // Many boards put the facts only in the advert body ("Location: Bromley",
    // "Salary: £42,000 - £45,000 per annum"). Code reads those labels exactly;
    // values from the description fill in ONLY when structured data found none.
    const facts = labelledFacts(cleanDescription(job.description || pageBody || ""));
    const salaryText = job.salaryText || facts.salary || "";
    const salary = parseSalary(salaryText);
    const locationText = job.locationText
      || job.locations.map(l => l.location).filter(Boolean).join("; ")
      || facts.location
      || "";
    const employers = config.employers ?? [];
    const sourceCompany = job.company || "";
    const track = (key: string, kind: string, answer: string, probability: number | "", confidence: number | "") =>
      decisions.push({ key: `${finalUrl} :: ${key}`, kind, answer, probability, confidence });

    // Cheap deterministic gates BEFORE any Jev call: an explicit employer
    // mismatch or an explicit non-UK source country excludes the page without
    // spending a judgment. Jev is never asked to overturn exact facts.
    if (employers.length && sourceCompany) {
      // "Salutem Careers" / "X Jobs" are careers-site labels for employer X,
      // not different brands: strip generic suffixes before matching.
      const normalized = sourceCompany.replace(/\s+(careers|jobs|recruitment|opportunities|hiring)\s*$/i, "").trim();
      const sourceMatch = employers.some(e => normalized.toLowerCase().includes(e.toLowerCase()) || e.toLowerCase().includes(normalized.toLowerCase()));
      track("employer_match", "boolean", `source: ${sourceCompany} -> ${sourceMatch ? "in scope" : "out of scope"}`, "", "");
      if (!sourceMatch) {
        rejectedBeforeJev++;
        skipped.push({ jobUrl: finalUrl, title: job.title, reason: `outside_requested_employer_scope (${sourceCompany})` });
        return;
      }
    }
    const first = job.locations[0] ?? {};
    const sourceCountry = first.country || "";
    // A placeholder country ("-", "N/A") is unknown, not foreign: leave the
    // UK question to Jev and the city/region evidence instead of rejecting.
    if (sourceCountry && !isUnknownCountry(sourceCountry) && !isUkCountry(sourceCountry)) {
      rejectedBeforeJev++;
      track("uk_location", "boolean", `source: ${sourceCountry} -> out of scope`, "", "");
      skipped.push({ jobUrl: finalUrl, title: job.title, reason: "no_confirmed_uk_location" });
      return;
    }

    // Jev is best-effort: on a hard failure (rate limit, auth, outage) we fall back
    // to deterministic extraction for this and every later job in the run.
    let judgment: JobJudgment | undefined;
    if (jevUsable) {
      const started = Date.now();
      progress.setStage("JEV DECISION",
        `Evaluating job ${progress.jobsProcessed + 1}/${totalJobs} · Jev decision in progress…`, finalUrl);
      progress.jevCalls = jevPageCalls + 1;
      progress.jevCacheHits = cache.hits;
      progress.emit();
      try {
        jevPageCalls++;
        judgment = await judgeJob(jev, {
          title: job.title, locationText,
          dateText: job.postedDate || "", salaryText, body: pageBody,
          employers: config.employers,
        });
        jevMs.add(Date.now() - started);
      } catch (error) {
        jevFailures++;
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`judgment failed on ${finalUrl}: ${message}`);
        if (isHardJevFailure(message)) jevUsable = false;
      }
    }
    const answers: Record<string, Answer> = judgment?.answers ?? {};
    const judged = judgment ? "jev" : "deterministic";
    if (judgment) {
      progress.jevCalls = jevPageCalls;
      progress.jevCacheHits = cache.hits;
      progress.update(`Jev decision received for "${job.title.slice(0, 60)}"`, finalUrl);
    }
    progress.setStage("JOB NORMALIZATION", "Normalizing job data", finalUrl);

    // Vacancy gate: reject only on a CONFIDENT Jev "no" (probability of "yes"
    // clearly below half). Mere sub-threshold uncertainty is not evidence —
    // pages with real vacancy signals pass and are labelled by the rest of
    // the pipeline. Without a Jev verdict, the page needs heuristic signals.
    const isVacancy = boolValue(answers, "is_vacancy");
    const heuristicVacancy = /\b(?:apply|vacanc|job|role|salary|contract|hours)\b/i
      .test(`${job.title} ${pageBody}`.slice(0, 4000));
    track("is_vacancy", "boolean", isVacancy && isVacancy.probability >= 0.5 ? "yes" : "no", isVacancy?.probability ?? "", "");
    const confidentNo = isVacancy && isVacancy.probability <= 0.5 - (1 - config.confidence);
    if (judged === "jev" ? confidentNo : !heuristicVacancy) {
      skipped.push({ jobUrl: finalUrl, title: job.title, reason: "not_a_vacancy_page" });
      return;
    }

    // Employer scoping, arbiter case: the source names no employer, so Jev
    // decides under a confidence gate.
    if (employers.length && !sourceCompany) {
      const employerAnswer = boolValue(answers, "employer_match");
      track("employer_match", "boolean",
        employerAnswer && employerAnswer.probability >= 0.5 ? "yes" : "no",
        employerAnswer?.probability ?? "", "");
      if (!employerAnswer || employerAnswer.probability < config.confidence) {
        skipped.push({ jobUrl: finalUrl, title: job.title, reason: "outside_requested_employer_scope (unknown employer)" });
        return;
      }
    }
    const uk = boolValue(answers, "uk_location");
    track("uk_location", "boolean", uk && uk.probability >= 0.5 ? "yes" : "no", uk?.probability ?? "", "");
    const worktype = gatedChoice(answers, "worktype", config.confidence) || job.worktype || "";
    track("worktype", "choice", worktype, "", choiceValue(answers, "worktype")?.confidence ?? "");
    const employmentType = gatedChoice(answers, "employment_type", config.confidence) || job.employmentType || facts.employmentType || "";
    track("employment_type", "choice", employmentType, "", choiceValue(answers, "employment_type")?.confidence ?? "");
    const dateKind = gatedChoice(answers, "date_kind", config.confidence);
    track("date_kind", "choice", dateKind, "", choiceValue(answers, "date_kind")?.confidence ?? "");
    const salaryKind = gatedChoice(answers, "salary_kind", config.confidence);
    track("salary_kind", "choice", salaryKind, "", choiceValue(answers, "salary_kind")?.confidence ?? "");

    // Deterministic date: code parses the text; Jev only labelled which date it is.
    // Data contract: dates come only from the source — the run date is never
    // substituted, and an absent postedDate stays empty.
    let postedDate = dateKind === "closing date" ? "" : parseDate(job.postedDate, now);
    const deadlineFromKind = dateKind === "closing date"
      ? parseDate(job.postedDate, now) || parseDate(job.jdDeadline, now)
      : parseDate(job.jdDeadline, now);
    if (postedDate && !looksRecent(postedDate, from, to)) {
      skipped.push({ jobUrl: finalUrl, title: job.title, reason: "outside_date_window" });
      return;
    }
    // UI-only disclosure: absent source dates are recorded for the report so
    // the UI can show a note; the exported row keeps postedDate empty.
    if (!postedDate) dateFallbacks.push({ jobUrl: finalUrl, assignedDate: to });
    const jdDeadline = deadlineFromKind;

    // Deterministic salary: only a source-proven annual range reaches the £ field.
    // Without Jev, the deterministic classifier decides from the text alone.
    const salaryIsAnnual = judged === "jev"
      ? salary.kind === "annual" && salaryKind !== "depends on experience"
      : salary.kind === "annual";
    const salaryRange = salaryIsAnnual ? salary.range : "";
    // A non-annual or withheld figure is moved into the description, never invented.
    const movePayIntoDescription = !salaryRange && Boolean(salary.text);
    const rawDescription = movePayIntoDescription && !job.description.includes(salary.text)
      ? `${job.description}\n\nSalary: ${salary.text}`.trim()
      : job.description;
    // Data contract: title contains only the job title; the description only
    // role content (site chrome removed line by line).
    const description = cleanDescription(rawDescription);
    const displayTitle = cleanTitle(job.title) || job.title;

    // UK-only contract: Jev's verdict or explicit source UK evidence qualifies
    // the job; the deterministic foreign-country gate already ran above.
    const ukSource = isUkCountry(sourceCountry) || /right to work in (?:the )?(?:uk|united kingdom)/i.test(job.description);
    const ukFromJev = Boolean(uk && uk.probability >= 0.5);
    const country = ukSource || ukFromJev ? "UK" : "";
    if (!country) {
      skipped.push({ jobUrl: finalUrl, title: job.title, reason: "no_confirmed_uk_location" });
      return;
    }

    const confidence = choiceValue(answers, "worktype")?.confidence ?? uk?.probability ?? "";
    // Location contract: "City, State/Region, Country" composed from exact
    // source evidence. When the source gives a single place name (Eploy's
    // VacV_LocationID, ATS city fields), it IS the city. Multi-site text
    // ("Leamington, Reading") stays verbatim instead of becoming a phantom
    // single city, and a placeholder ("All Locations", "Location") is never
    // promoted to a place.
    const singlePlace = locationText && !/[,;]/.test(locationText) &&
      !/^(remote|hybrid|on-?site|home[- ]based|uk|united kingdom|england|scotland|wales|northern ireland|all locations|any location|not specified|location|nationwide|various|multiple)$/i.test(locationText);
    const city = first.city || (singlePlace ? locationText : "");
    const composedLocation = [city, first.state, country].filter(Boolean).join(", ");
    const exactLocation = composedLocation || locationText || country;
    rows.push({
      // Source job ID only: no generated hash ever stands in for a real reference.
      jobId: job.jobId || "",
      title: displayTitle,
      description,
      jobUrl: finalUrl, postedDate, jdDeadline,
      company: sourceCompany || config.company,
      salaryRange, employmentType, worktype,
      location: exactLocation,
      city, state: first.state || "", country,
      jevConfidence: confidence === "" ? "" : String(confidence),
      judged, ats: job.ats || "Custom",
    });
  };

  const processPage = async (url: string): Promise<void> => {
    progress.setStage("PAGE FETCH", `Fetching job page ${progress.pagesProcessed + 1}/${totalJobs}`, url);
    let html: string, finalUrl: string;
    try {
      ({ body: html, url: finalUrl } = await http.html(url));
    } catch (error) {
      issues.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    // Dedupe on the final URL: redirect twins and repeated candidates are
    // processed (and judged) once.
    const dedupeKey = finalUrl.replace(/\/+$/, "");
    if (processed.has(dedupeKey)) { duplicateUrls++; return; }
    processed.add(dedupeKey);

    progress.setStage("JOB EXTRACTION", "Extracting job data", finalUrl);
    // Single DOM pass: schema.org extraction first, heuristics on the same
    // parsed document when no structured data exists.
    const parseStart = Date.now();
    const $ = load(html);
    let job: RawJob | undefined = extractJobsFromDom($, finalUrl)[0];
    let pageBody: string;
    if (job) {
      pageBody = job.description;
    } else {
      // <form> kept: ASP.NET/Eploy pages wrap all content in one form.
      $("nav, header, footer, script, style, noscript").remove();
      const heuristic = extractHeuristicFromDom($, finalUrl);
      pageBody = plainText($("main, article, #content, .job, .job-description, body").first().text());
      job = { ...heuristic, title: heuristic.title || "Untitled" };
    }
    parseMs.add(Date.now() - parseStart);
    if (!job) return;
    await judgeAndStore(finalUrl, job, pageBody);
  };

  // An ATS feed seed whose record carries the full advert body goes straight
  // to the same per-job Jev decision — no second fetch. A thin seed (listing
  // fields only) fetches its public job page and is processed like any other.
  const processSeed = async (seed: RawJob): Promise<void> => {
    if ((seed.description || "").trim().length >= 120) {
      const dedupeKey = seed.jobUrl.replace(/\/+$/, "");
      if (processed.has(dedupeKey)) { duplicateUrls++; return; }
      processed.add(dedupeKey);
      progress.setStage("JOB EXTRACTION",
        `Reading job ${progress.jobsProcessed + 1}/${totalJobs} from the ${progress.ats || "ATS"} feed`, seed.jobUrl);
      await judgeAndStore(seed.jobUrl, seed, seed.description!);
      return;
    }
    await processPage(seed.jobUrl);
  };

  progress.setStage("PAGE FETCH", "Processing job pages");
  let pagesDone = 0;
  const finishOne = (): void => {
    pagesDone++;
    progress.pagesProcessed = pagesDone;
    progress.jobsProcessed = pagesDone;
    progress.jobsFound = rows.length;
    progress.jobsSkipped = skipped.length;
    progress.jevCalls = jevPageCalls;
    progress.jevCacheHits = cache.hits;
    progress.emit();
    log(`${pagesDone}/${totalJobs} job pages read.`);
  };
  if (seedJobs.length) {
    await pool(seedJobs, config.concurrency, async (seed) => {
      try { await processSeed(seed); }
      finally { finishOne(); }
    });
  } else {
    await pool(targets, config.concurrency, async (url) => {
      try { await processPage(url); }
      finally { finishOne(); }
    });
  }

  // --- Stage 3: write outputs -------------------------------------------------
  progress.setStage("RESULT STORAGE", "Writing outputs");
  await mkdir(config.out, { recursive: true });
  await writeFile(resolve(config.out, "jobs.csv"), toCsv(COLUMNS, rows));
  await writeFile(resolve(config.out, "jobs.json"), JSON.stringify(rows, null, 2));
  await writeFile(resolve(config.out, "skipped.json"), JSON.stringify(skipped, null, 2));
  await writeFile(resolve(config.out, "decisions.json"), JSON.stringify(decisions, null, 2));
  await cache.flush();
  const runtimeMs = Date.now() - startedAt;
  const jevStats = jev.stats();
  const report: ScrapeReport = {
    company: config.company, sourceUrl: config.url, mode: config.mode,
    scrapedAt: now.toISOString(), window: { from, to },
    candidates: totalJobs, rows: rows.length, skipped: skipped.length, issues,
    dateFallbacks,
    performance: {
      totalRuntimeMs: runtimeMs,
      pagesDiscovered: seedJobs.length ? seedJobs.length : vacancyUrls.size,
      pagesFetched: http.requests,
      duplicateUrls,
      pagesRejectedDeterministically: rejectedBeforeJev,
      pagesSentToJev: jevPageCalls,
      throughputPagesPerSec: Number((totalJobs / (runtimeMs / 1000)).toFixed(2)),
      http: { requests: http.requests, failures: http.failures, backoffs: http.backoffs, ...http.fetchMs.stats() },
      parse: parseMs.stats(),
      jev: {
        pageCalls: jevPageCalls, failures: jevFailures,
        cacheHits: cache.hits, cacheMisses: cache.misses,
        ...jevMs.stats(),
      },
      linkFunnel: !seedJobs.length && (config.mode === "crawl" || (!config.sitemapUrl && config.mode !== "sitemap" && config.mode !== "schema"))
        ? linkFunnel : undefined,
      skipReasons: histogram(skipped.map(entry => entry.reason)),
    },
    jev: { ...jevStats, available: jev.live, usableAtEnd: jevUsable },
    judgedBy: {
      jev: rows.filter(row => row.judged === "jev").length,
      deterministic: rows.filter(row => row.judged === "deterministic").length,
    },
    process: seedJobs.length
      ? `JEV ATS ${(detection?.ats || "adapter").toUpperCase()}`
      : `JEV ${config.mode.toUpperCase()}${listingPages.size > 1 ? " + crawl" : ""}${config.sitemapUrl ? " + sitemap" : ""}`,
    ats: detection?.ats || "",
  };
  await writeFile(resolve(config.out, "report.json"), JSON.stringify(report, null, 2));

  progress.complete();
  log(`\n[${config.company}] ${rows.length} UK job rows, ${skipped.length} skipped, ${totalJobs} pages in ${(runtimeMs / 1000).toFixed(1)}s; ` +
    `${jevPageCalls} Jev calls (~$${jevStats.estimatedCostUsd.toFixed(4)}), ${cache.hits} cache hits.`);
  return { rows, skipped, report };
}
