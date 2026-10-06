import { mkdir, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadCompanies, loadHeldCompanies, selectCompanies, validateCompanies } from "./src/companies.js";
import { outputCsv } from "./src/output.js";
import type { ScrapeOptions } from "./src/crawl.js";
import { platformEngines, type CollectedResult, type PlatformRegistry } from "./src/platforms.js";
import { matchesCompanyTitle } from "./src/batch.js";
import type { UniversalCompany } from "./src/companies.js";
import { dateWindow, type RawJob } from "./src/normalize.js";
import { finalizeScrapeResult } from "./src/final-dataset.js";
import { isNhsJobsUrl, isUkCountry, isExplicitlyForeign, applyCompanyFilters } from "./src/filters.js";
import { serialize15ColumnCsv, normalizeText } from "./src/common-utils.js";
import { runContext, companyContext, currentSignal, currentMetrics, type ProductionLog, type RequestMetrics } from "./src/universal-runtime.js";

export interface ProductionOptions extends ScrapeOptions {
  concurrency?: number;
  companyTimeoutMs?: number;
  runTimeoutMs?: number;
  signal?: AbortSignal;
  out?: string;
  writeOutput?: boolean;
  retainRawJobs?: boolean;
  logger?: (event: ProductionLog) => void;
}

interface Timing {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  retries: number;
  sourceJobs: number;
  excludedJobs: number;
}

export type CompanyResult = UniversalResult & { report: UniversalResult["report"] & Timing };

export interface CompanySummary extends Omit<Timing, "sourceJobs" | "excludedJobs"> {
  company: string;
  name: string;
  platform: string;
  status: string;
  jobsFound: number;
  ukJobs: number;
  excludedJobs: number;
  exportReady: boolean;
  issues: { url: string; message: string }[];
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  expectedCompanies: number;
  successfulCompanies: number;
  failedCompanies: number;
  blockedCompanies: number;
  partialCompanies: number;
  totalJobs: number;
  complete: boolean;
  companies: string[];
  concurrency: number;
  companyTimeoutMs: number;
  runTimeoutMs: number;
}

export interface ProductionRun {
  directory?: string;
  manifest: RunManifest;
  summary: CompanySummary[];
  results: CompanyResult[];
}

const defaultLogger = (event: ProductionLog) => console.log(JSON.stringify(event));
const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(/(token|password|api[_-]?key)=([^&\s]+)/gi, "$1=[redacted]");

class CollectionFailure extends Error {
  constructor(error: unknown, readonly source: CollectedResult) {
    super(errorMessage(error));
  }
}

function limits(options: ProductionOptions) {
  const values = {
    concurrency: options.concurrency ?? 3,
    companyTimeoutMs: options.companyTimeoutMs ?? 180_000,
    runTimeoutMs: options.runTimeoutMs ?? 3_600_000,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > (name === "concurrency" ? 10 : 86_400_000)) {
      throw new Error(`Invalid ${name}.`);
    }
  }
  return values;
}

function failure(company: UniversalCompany, options: ScrapeOptions, error: unknown, status = "failed"): UniversalResult {
  const now = options.now || new Date();
  const failed: CollectedResult = {
    rows: [],
    rawJobs: [],
    report: {
      sourceUrl: company.careersUrl,
      scrapedAt: now.toISOString(),
      process: company.platform,
      status,
      candidates: 0,
      window: dateWindow(now),
      skipped: [],
      issues: [{ url: company.careersUrl, message: errorMessage(error) }],
      limited: false,
    },
  };
  const final = finalizeScrapeResult(failed, company.name, now);
  const captured = error instanceof CollectionFailure ? error.source : undefined;
  return {
    ...failed,
    rawJobs: captured?.rawJobs || [],
    rows: final.rows,
    report: {
      ...captured?.report,
      ...final.report,
      candidates: captured?.rawJobs.length || 0,
      scopeExcluded: [],
      ukScopeExcluded: [],
      qualityPassed: false,
      exportReady: false,
      platform: company.platform,
      exportCompanyIdentity: undefined,
    },
  };
}

const timed = (result: UniversalResult, start: string, metrics: RequestMetrics): CompanyResult => {
  const exported = new Set(result.rows.map(job => job.jobUrl));
  return {
    ...result,
    report: {
      ...result.report,
      startedAt: start,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - Date.parse(start),
      ...metrics,
      sourceJobs: result.rawJobs.length,
      excludedJobs: new Set(result.rawJobs.filter(job => !exported.has(job.jobUrl)).map(job => job.jobUrl)).size,
    },
  };
};

const completeResult = (result: UniversalResult) =>
  !result.report.limited &&
  !result.report.pendingUrls?.length &&
  !result.report.issues.length &&
  ((result.report.status === "ok" && result.report.exportReady) ||
    (result.report.status === "no_matches" && result.rows.length === 0 && result.report.qualityPassed));

export async function scrapeUniversalCompany(
  company: UniversalCompany,
  overrides: ScrapeOptions = {},
  registry: Partial<PlatformRegistry> = platformEngines
) {
  validateCompanies([company]);
  const held = (await loadHeldCompanies()).find(item => item.slug === company.slug);
  if (held) throw new Error(`${company.slug} is held: ${held.reason}`);
  const now = overrides.now || new Date();
  const options = { ...company.options, ...overrides, company: company.employerNames ? undefined : company.name, now };
  validateCompanies([{ ...company, options }]);
  const engine = registry[company.platform];
  if (!engine) throw new Error(`No ${company.platform} engine registered.`);
  const source = await engine(company, options);
  const scopeExcluded: { jobId: string; jobUrl: string; company: string; reason: string }[] = [];
  const ukScopeExcluded: { jobId: string; jobUrl: string; reason: string }[] = [];
  const rawJobs = structuredClone(source.rawJobs);
  const accepted: RawJob[] = [];
  for (const job of rawJobs) {
    if (isNhsJobsUrl(job.jobUrl)) {
      ukScopeExcluded.push({ jobId: job.jobId || "", jobUrl: job.jobUrl, reason: "nhs_jobs_excluded" });
      continue;
    }
    const employer = job.company?.trim() || "";
    if (!matchesCompanyTitle(job.title, company) || (company.employerNames && !company.employerNames.some(name => name.toLowerCase() === employer.toLowerCase()))) {
      scopeExcluded.push({ jobId: job.jobId || "", jobUrl: job.jobUrl, company: employer, reason: "outside_requested_employer_scope" });
      continue;
    }
    const evidence = source.report.locationEvidence?.find(item => item.jobId === (job.jobId || "") && item.jobUrl === job.jobUrl);
    const foreign = job.locations.some(location => (location.country && !isUkCountry(location.country)) || (location.location && isExplicitlyForeign(location.location)));
    accepted.push(evidence && !foreign ? { ...job, locations: evidence.resolvedLocations, notes: [...(job.notes || []), ...evidence.notes] } : job);
  }
  const report = { ...source.report, scopeExcluded, ukScopeExcluded };
  if (report.limited || report.pendingUrls?.length || report.issues.length) report.status = "partial";
  const finished = (() => {
    try {
      return finalizeScrapeResult({ ...source, rawJobs: accepted, report }, company.name, now);
    } catch (error) {
      throw new CollectionFailure(error, { ...source, rawJobs, report });
    }
  })();
  if (finished.report.status === "ok" && !finished.rows.length) finished.report.status = "no_matches";
  finished.report.exportReady = finished.report.exportReady && finished.report.status === "ok";
  if (company.exportCompanyName) {
    for (const row of finished.rows) row.company = company.exportCompanyName;
  }
  return {
    ...source,
    rawJobs,
    rows: finished.rows,
    report: {
      ...finished.report,
      platform: company.platform,
      exportCompanyIdentity: company.exportCompanyName
        ? { name: company.exportCompanyName, sourceNames: [...new Set(accepted.map(job => job.company).filter(Boolean))] }
        : undefined,
    },
  };
}

export type UniversalResult = Awaited<ReturnType<typeof scrapeUniversalCompany>>;

export async function scrapeAllCompanies(
  companies: UniversalCompany[],
  options: ProductionOptions = {},
  registry: Partial<PlatformRegistry> = platformEngines,
  onResult?: (company: UniversalCompany, result: CompanyResult) => Promise<void>
): Promise<CompanyResult[]> {
  validateCompanies(companies);
  validateCompanies(companies.map(company => ({ ...company, options: { ...company.options, ...options } })));
  const settings = limits(options),
    logger = options.logger || defaultLogger;
  return runContext(settings.runTimeoutMs, options.signal, async () => {
    const results: CompanyResult[] = new Array(companies.length);
    let next = 0;
    async function worker() {
      while (next < companies.length) {
        const index = next++,
          company = companies[index]!,
          startedAt = new Date().toISOString();
        let metrics: RequestMetrics = { requests: 0, retries: 0 },
          source: UniversalResult | undefined,
          result: CompanyResult;
        logger({ event: "company_started", company: company.slug, platform: company.platform, startedAt });
        try {
          result = await companyContext(
            settings.companyTimeoutMs,
            async () => {
              metrics = currentMetrics();
              source = await scrapeUniversalCompany(company, options, registry);
              const finished = timed(source, startedAt, metrics);
              await onResult?.(company, finished);
              return finished;
            },
            { logger, company: company.slug, platform: company.platform }
          );
        } catch (error) {
          const status =
            currentSignal()?.aborted || /robots|NHS|HTTP (?:401|403)|captcha|access denied/i.test(errorMessage(error))
              ? "blocked"
              : "failed";
          const failed = source
            ? {
                ...source,
                report: {
                  ...source.report,
                  status,
                  exportReady: false,
                  issues: [...source.report.issues, { url: company.careersUrl, message: errorMessage(error) }],
                },
              }
            : failure(company, options, error, status);
          result = timed(failed, startedAt, metrics);
          try {
            await onResult?.(company, result);
          } catch {
            /* The run summary records failed persistence; continue other companies. */
          }
        }
        results[index] = result;
        if (options.retainRawJobs === false) result.rawJobs = [];
        logger({
          event: "company_finished",
          company: company.slug,
          platform: company.platform,
          status: result.report.status,
          ukJobs: result.rows.length,
          durationMs: result.report.durationMs,
          requests: metrics.requests,
          retries: metrics.retries,
          error: result.report.issues.map(issue => errorMessage(issue.message)).join("; "),
        });
      }
    }
    await Promise.all(Array.from({ length: Math.min(settings.concurrency, companies.length) }, worker));
    return results;
  });
}

async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, file);
}

async function execute(
  selected: UniversalCompany[],
  options: ProductionOptions,
  registry: Partial<PlatformRegistry>
): Promise<ProductionRun> {
  const settings = limits(options),
    logger = options.logger || defaultLogger;
  validateCompanies(selected.map(company => ({ ...company, options: { ...company.options, ...options } })));
  const start = new Date(),
    day = start.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const prefix = selected.length === 1 ? `${day}-${selected[0]!.slug}` : `${day}-universal`;
  const runId = `${prefix}-${start.toISOString().slice(11).replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const manifest: RunManifest = {
    runId,
    startedAt: start.toISOString(),
    completedAt: null,
    expectedCompanies: selected.length,
    successfulCompanies: 0,
    failedCompanies: 0,
    blockedCompanies: 0,
    partialCompanies: 0,
    totalJobs: 0,
    complete: false,
    companies: selected.map(company => company.slug),
    ...settings,
  };
  let directory: string | undefined;
  if (options.writeOutput !== false) {
    const root = options.out || resolve(process.env.FIELDWORK_DATA_DIR || "..", "output", "universal-runs");
    await mkdir(root, { recursive: true });
    directory = resolve(root, runId);
    await mkdir(directory, { recursive: true });
    await atomicJson(resolve(directory, "manifest.json"), manifest);
  }
  logger({ event: "run_started", runId, expectedCompanies: selected.length, concurrency: settings.concurrency });
  const results = await scrapeAllCompanies(
    selected,
    options,
    registry,
    directory
      ? async (company, result) => {
          const folder = resolve(directory!, company.slug);
          await mkdir(folder, { recursive: true });
          for (const [name, value] of [
            ["company.json", company],
            ["jobs.json", result.rows],
            ["scrape-result.json", result],
            ["scrape-report.json", result.report],
          ] as const) {
            await writeFile(resolve(folder, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", signal: currentSignal() });
          }
          if (result.report.exportReady) {
            await writeFile(resolve(folder, "jobs.csv"), outputCsv(result.rows), { flag: "wx", signal: currentSignal() });
          }
        }
      : undefined
  );
  const summary = results.map((result, index): CompanySummary => {
    const company = selected[index]!;
    return {
      company: company.slug,
      name: company.name,
      platform: company.platform,
      status: result.report.status,
      jobsFound: result.report.sourceJobs,
      ukJobs: result.rows.length,
      excludedJobs: result.report.excludedJobs,
      exportReady: result.report.exportReady,
      issues: result.report.issues,
      startedAt: result.report.startedAt,
      finishedAt: result.report.finishedAt,
      durationMs: result.report.durationMs,
      requests: result.report.requests,
      retries: result.report.retries,
    };
  });
  manifest.completedAt = new Date().toISOString();
  manifest.successfulCompanies = results.filter(completeResult).length;
  manifest.failedCompanies = results.filter(result => result.report.status === "failed").length;
  manifest.blockedCompanies = results.filter(result => result.report.status === "blocked").length;
  manifest.partialCompanies = results.length - manifest.successfulCompanies - manifest.failedCompanies - manifest.blockedCompanies;
  manifest.totalJobs = results.reduce((sum, result) => sum + result.rows.length, 0);
  manifest.complete = results.length === selected.length && results.every(completeResult);
  if (directory) {
    await atomicJson(resolve(directory, "summary.json"), summary);
    await atomicJson(
      resolve(directory, "failures.json"),
      summary.filter(company => !["ok", "no_matches"].includes(company.status) || company.issues.length)
    );
    if (manifest.complete) {
      const rows = results.flatMap(result => result.rows);
      await writeFile(resolve(directory, "companies.csv.tmp"), outputCsv(rows), { flag: "wx" });
      await writeFile(resolve(directory, "companies.json.tmp"), JSON.stringify(rows, null, 2) + "\n", { flag: "wx" });
      await rename(resolve(directory, "companies.json.tmp"), resolve(directory, "companies.json"));
      await rename(resolve(directory, "companies.csv.tmp"), resolve(directory, "companies.csv"));
    }
    await atomicJson(resolve(directory, "manifest.json"), manifest);
  }
  logger({
    event: "run_finished",
    runId,
    complete: manifest.complete,
    totalJobs: manifest.totalJobs,
    failedCompanies: manifest.failedCompanies,
    blockedCompanies: manifest.blockedCompanies,
  });
  return { directory, manifest, summary, results };
}

export async function scrapeAll(options: ProductionOptions = {}, registry: Partial<PlatformRegistry> = platformEngines): Promise<ProductionRun> {
  return execute(await loadCompanies(), options, registry);
}

export async function scrapeCompany(
  names: string | string[],
  options: ProductionOptions = {},
  registry: Partial<PlatformRegistry> = platformEngines
): Promise<ProductionRun> {
  const companies = await loadCompanies(),
    held = await loadHeldCompanies();
  const selected = selectCompanies(companies, held, { company: names });
  return execute(selected, options, registry);
}

export async function scrapePlatform(
  platform: string,
  options: ProductionOptions = {},
  registry: Partial<PlatformRegistry> = platformEngines
): Promise<ProductionRun> {
  return execute(selectCompanies(await loadCompanies(), await loadHeldCompanies(), { platform }), options, registry);
}

export async function runUniversalCli(args = process.argv.slice(2), registry: Partial<PlatformRegistry> = platformEngines): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      company: { type: "string", multiple: true },
      all: { type: "boolean" },
      list: { type: "boolean" },
      help: { type: "boolean" },
      platform: { type: "string" },
      out: { type: "string" },
      "max-pages": { type: "string" },
      "timeout-ms": { type: "string" },
      "delay-ms": { type: "string" },
      concurrency: { type: "string" },
      "company-timeout-ms": { type: "string" },
      "run-timeout-ms": { type: "string" },
    },
  });
  if (positionals.length > 0) {
    values.company = [...(values.company || []), ...positionals];
  }
  if (values.help) {
    console.log(
      'Universal UK scraper: all 75 companies by default. [--company "NAME OR SLUG" (repeatable)] [--platform comeet|eploy|jobtrain|wordpress|custom|reed|haystack|tribepad|jobadder|portobello|occy|supabase|jobtoday] [--list] [--out DIR] [--concurrency 1..10 (default 3)] [--company-timeout-ms N (default 180000)] [--run-timeout-ms N (default 3600000)] [--max-pages N] [--timeout-ms N] [--delay-ms N].'
    );
    return 0;
  }
  const configs = await loadCompanies();
  const selected = selectCompanies(configs, await loadHeldCompanies(), values);
  if (values.list) {
    for (const company of selected) console.log(`${company.slug}\t${company.platform}\t${company.name}`);
    return 0;
  }
  const options: ProductionOptions = { out: values.out, retainRawJobs: false };
  for (const [flag, key] of [
    ["max-pages", "maxPages"],
    ["timeout-ms", "timeoutMs"],
    ["delay-ms", "delayMs"],
    ["concurrency", "concurrency"],
    ["company-timeout-ms", "companyTimeoutMs"],
    ["run-timeout-ms", "runTimeoutMs"],
  ] as const) {
    if (values[flag] !== undefined) options[key] = Number(values[flag]);
  }
  const run = values.company
    ? await scrapeCompany(
        selected.map(company => company.slug),
        options,
        registry
      )
    : values.platform
      ? await scrapePlatform(values.platform, options, registry)
      : await scrapeAll(options, registry);
  console.log(JSON.stringify({ event: "output_saved", directory: run.directory, runId: run.manifest.runId, complete: run.manifest.complete }));
  return run.manifest.complete ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runUniversalCli()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
