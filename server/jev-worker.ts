import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scrape, type ScrapeConfig, type ScrapeReport } from "../jev-scraper/src/scraper.js";
import { loadEnv } from "../jev-scraper/src/env.js";
import { OUTPUT_COLUMNS, outputCsv } from "../src/output.js";
import type { Company } from "./catalog.js";

let finished = false;
process.on("disconnect", () => { if (!finished) process.exit(1); });

const JEV_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "jev-scraper");

/** Map the Jev engine's rich rows onto the parent 15-column CSV contract. */
export function toParentRows(rows: Record<string, string>[], company: string) {
  return rows.map(row => ({
    jobId: row.jobId ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    jobUrl: row.jobUrl ?? "",
    postedDate: row.postedDate ?? "",
    jdDeadline: row.jdDeadline ?? "",
    company: row.company || company,
    salaryRange: row.salaryRange ?? "",
    employmentType: row.employmentType ?? "",
    worktype: row.worktype ?? "",
    location: row.location ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
    ats: "Custom",
  }));
}

/**
 * Package a reusable standalone project for the code ZIP: the jev-scraper
 * sources plus a scrape.ts entry pinned to this company's settings. The
 * caller fills in `.env.example`; the real .env is never copied.
 */
export async function prepareJevCode(directory: string, company: Company, employers: string[]): Promise<void> {
  const code = resolve(directory, "code");
  await mkdir(resolve(code, "src"), { recursive: true });
  for (const name of await readdir(resolve(JEV_DIR, "src"))) {
    if (name.endsWith(".ts")) await copyFile(resolve(JEV_DIR, "src", name), resolve(code, "src", name));
  }
  await copyFile(resolve(JEV_DIR, "package-lock.json"), resolve(code, "package-lock.json"));
  const pkg = JSON.parse(await readFile(resolve(JEV_DIR, "package.json"), "utf8"));
  await writeFile(resolve(code, "package.json"), JSON.stringify({
    ...pkg, scripts: { scrape: "tsx src/cli.ts", typecheck: "tsc --noEmit", test: "tsx --test test/*.test.ts" },
  }, null, 2));
  const tsconfig = JSON.parse(await readFile(resolve(JEV_DIR, "tsconfig.json"), "utf8"));
  await writeFile(resolve(code, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  const envExample = [
    "# Copy this file to .env and paste one key:",
    "DIRECT_TYPESAFE_API_KEY=",
    "OPENROUTER_API_KEY=",
    "TYPESAFE_API_KEY=",
  ].join("\n");
  await writeFile(resolve(code, ".env.example"), envExample);
  const employersArg = employers.map(name => ` --employer ${JSON.stringify(name)}`).join("");
  const sitemapArg = company.sitemapUrl ? ` --sitemap-url ${JSON.stringify(company.sitemapUrl)}` : "";
  const entry = [
    "// Standalone Jev scraper entry for this company.",
    "// Needs a TypeSafe Jev key in .env (see .env.example); without one it still",
    "// scrapes deterministically, just with fewer semantic judgments.",
    "import { dirname, resolve } from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "import { loadEnv } from \"./src/env.js\";",
    "import { scrape } from \"./src/scraper.js\";",
    "loadEnv();",
    `const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");`,
    "const result = await scrape({",
    `  url: ${JSON.stringify(company.careersUrl)},`,
    `  company: ${JSON.stringify(company.name)},`,
    `  out: resolve(directory, "output"),`,
    `  mode: "auto",`,
    `  maxPages: ${company.maxPages || 250},`,
    "  concurrency: 8,",
    "  delayMs: 600,",
    `  confidence: 0.6,`,
    "  monthsBack: 2,",
    "  timeoutMs: 30000,",
    `  employers: ${JSON.stringify(employers)},`,
    `  sitemapUrl: ${company.sitemapUrl ? JSON.stringify(company.sitemapUrl) : "undefined"},`,
    "});",
  ].join("\n");
  await writeFile(resolve(code, "scrape.ts"), entry + "\n");
  await writeFile(resolve(directory, "README.md"),
    `# ${company.name} — Jev engine\n\nRun npm ci and npm run scrape inside code/ with a TypeSafe Jev key in .env.\nWithout a key it still scrapes deterministically, just with fewer semantic judgments.\n\nSource: ${company.careersUrl}\nCLI equivalent: npm run scrape -- ${JSON.stringify(company.careersUrl)}${employersArg}${sitemapArg}\n`);
}

export interface JevRunResult {
  company: string;
  slug: string;
  status: "ok" | "no_matches" | "partial";
  sourceUrl: string;
  scrapedAt: string;
  process: string;
  pagesRead: number;
  jobs: number;
  locationRows: number;
  reviewNotes: number;
  postingDateFallbacks: number;
  excluded: number;
  issues: number;
  jevCalls: number;
  jevCostUsd: number;
  cacheHits: number;
}

/** UI-compatible report: array-shaped skipped/issues plus derived status. */
export function uiReport(report: ScrapeReport, skipped: { jobUrl: string; title: string; reason: string }[]): Record<string, unknown> {
  return {
    ...report,
    status: report.judgedBy.deterministic > 0 ? "partial" : report.rows ? "ok" : "no_matches",
    pagesVisited: report.performance.pagesFetched,
    limited: false,
    skipped,
    issues: report.issues.map(message => {
      const sep = message.indexOf(": ");
      return { url: sep > 0 ? message.slice(0, sep) : report.sourceUrl, message: sep > 0 ? message.slice(sep + 2) : message };
    }),
    dataNotes: report.dateFallbacks.map(entry => ({ jobId: entry.jobUrl, jobUrl: entry.jobUrl, reason: "No posted date or deadline was published; the run date was used." })),
    attempts: [],
  };
}

async function work(root: string, directory: string, company: Company): Promise<JevRunResult> {
  loadEnv();
  const employers = [company.name, ...(company.aliases || [])];

  await mkdir(directory, { recursive: true });
  await prepareJevCode(directory, company, employers);
  const config: ScrapeConfig = {
    url: company.careersUrl,
    company: company.name,
    out: resolve(directory, "output"),
    mode: "auto",
    maxPages: company.maxPages || 250,
    concurrency: 8,
    delayMs: 600,
    confidence: 0.6,
    monthsBack: 2,
    timeoutMs: 30000,
    employers,
    ...(company.sitemapUrl ? { sitemapUrl: company.sitemapUrl } : {}),
    // Shared cache across runs: identical pages hash identically, so dashboard
    // reruns of the same board skip paid judgments instead of re-paying.
    cachePath: resolve(root, "output", "_tracking", "jev-cache.json"),
  };
  const { rows, skipped, report } = await scrape(config);
  const parentRows = toParentRows(rows, company.name);
  await writeFile(resolve(directory, "jobs.csv"), outputCsv(parentRows));
  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(parentRows, null, 2));
  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(uiReport(report, skipped), null, 2));
  const status: JevRunResult["status"] = report.judgedBy.deterministic > 0 ? "partial" : rows.length ? "ok" : "no_matches";
  return {
    company: company.name, slug: company.slug, status, sourceUrl: company.careersUrl,
    scrapedAt: report.scrapedAt, process: report.process,
    pagesRead: report.performance.pagesFetched,
    jobs: new Set(rows.map(row => row.jobId)).size, locationRows: rows.length,
    reviewNotes: report.dateFallbacks.length, postingDateFallbacks: report.dateFallbacks.length,
    excluded: skipped.length, issues: report.issues.length,
    jevCalls: report.performance.pagesSentToJev,
    jevCostUsd: report.jev.estimatedCostUsd,
    cacheHits: Number(report.performance.jev.cacheHits ?? 0),
  };
}

if (process.argv[2]) {
  const { root, directory, company } = JSON.parse(process.argv[2]) as { root: string; directory: string; company: Company };
  work(root, directory, company).then(summary => {
    finished = true;
    process.send?.({ type: "result", summary });
    process.disconnect?.();
  }).catch(error => {
    finished = true;
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    process.disconnect?.();
  });
}
