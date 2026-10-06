import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrapeWebsite } from "../src/strategy.js";
import type { CompanyConfig } from "../src/company-runner.js";
import { outputCsv } from "../src/output.js";
import { finalizeScrapeResult } from "../src/final-dataset.js";
import type { Company } from "./catalog.js";

let finished = false;
process.on("disconnect", () => { if (!finished) process.exit(1); });

type SiteConfig = CompanyConfig & Pick<Company, "mode" | "apiUrl" | "selectors" | "maxPages" | "renderWaitMs">;
export async function prepareCode(root: string, directory: string, config: SiteConfig): Promise<void> {
  const code = resolve(directory, "code");
  await mkdir(resolve(code, "src"), { recursive: true });
  for (const name of await readdir(resolve(root, "src"))) {
    if (name.endsWith(".ts")) await copyFile(resolve(root, "src", name), resolve(code, "src", name));
  }
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  await writeFile(resolve(code, "package.json"), JSON.stringify({
    ...pkg, scripts: { scrape: "tsx scrape.ts", typecheck: "tsc --noEmit" },
  }, null, 2));
  await copyFile(resolve(root, "package-lock.json"), resolve(code, "package-lock.json"));
  const tsconfig = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
  await writeFile(resolve(code, "tsconfig.json"), JSON.stringify({ ...tsconfig, include: ["scrape.ts", "src/**/*.ts"] }, null, 2));
  const entry = [
    'import { dirname, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import { writeFile } from "node:fs/promises";',
    'import { scrapeWebsite } from "./src/strategy.js";',
    'import type { ScrapeOptions } from "./src/crawl.js";',
    'import type { CompanyConfig } from "./src/company-runner.js";',
    'import { outputCsv } from "./src/output.js";',
    'import { finalizeScrapeResult } from "./src/final-dataset.js";',
    `const company: CompanyConfig & ScrapeOptions = ${JSON.stringify(config, null, 2)};`,
    'const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
    '  const result = await scrapeWebsite(company.careersUrl, { ...company, company: company.name });',
    '  const finalized = finalizeScrapeResult(result, company.name);',
    '  result.rows = finalized.rows; result.report = finalized.report;',
    '  const rows = finalized.rows;',
    '  if (finalized.report.exportReady) await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows));',
    '  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2));',
    '  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(result.report, null, 2));',
    '  if (["partial", "unsupported"].includes(result.report.status) || !finalized.report.exportReady) process.exitCode = 2;',
  ].join("\n");
  await writeFile(resolve(code, "scrape.ts"), entry + "\n");
  await writeFile(resolve(directory, "README.md"), `# ${config.name}\n\nRun \`npm ci\` and \`npm run scrape\` inside \`code/\`. For DOM/browser fallback, also run \`npx playwright install chromium\`.\n\nMode: ${config.mode || "auto"}. The CSV has 15 columns. Missing fields, including posting dates, stay blank when the source does not provide them. The JSON report records validation checks, exclusions, and location merges. Public sources only: access restrictions and unsupported schemas are reported, not bypassed.\n\nSource: ${config.careersUrl}\n`);
}

async function work(root: string, directory: string, company: Company) {
  console.log(`Checking the public source for ${company.name}…`);
  // Coarse structured progress for the dashboard: this engine reports stage
  // changes and a FAILED state with a reason instead of leaving the UI blank.
  const startedAt = new Date().toISOString();
  let currentMetrics: Record<string, unknown> = {};
  const progress = (stage: string, operation: string, extra: object = {}): void => {
    currentMetrics = {
        currentUrl: company.careersUrl, ats: "",
        pagesDiscovered: 0, pagesProcessed: 0, pagesTotal: 0,
        jobsDiscovered: 0, jobsProcessed: 0, jobsFound: 0, jobsSkipped: 0,
        startedAt,
        ...currentMetrics, stage, operation,
        elapsedMs: Date.now() - Date.parse(startedAt), ...extra,
    };
    process.send?.({ type: "progress", metrics: currentMetrics });
  };
  progress("DISCOVERY", "Loading careers page…");
  const config: SiteConfig = {
    name: company.name, slug: company.slug, workbookRow: company.workbookRow,
    careersUrl: company.careersUrl, sitemapUrl: company.sitemapUrl,
    mode: company.mode || "auto", apiUrl: company.apiUrl || "", selectors: company.selectors || {},
    maxPages: company.maxPages, renderWaitMs: company.renderWaitMs ?? 1500,
  };
  await mkdir(directory, { recursive: true });
  await prepareCode(root, directory, config);
  let result;
  try {
    result = await scrapeWebsite(company.careersUrl, { ...config, company: company.name,
      onProgress: update => progress("JOB EXTRACTION", update.operation, update),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    progress("FAILED", reason, { error: reason });
    throw error;
  }
  progress("RESULT STORAGE", "Writing outputs");
  const finalized = finalizeScrapeResult(result, company.name);
  result.rows = finalized.rows;
  result.report = finalized.report;
  const rows = finalized.rows;
  if (finalized.report.exportReady) await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows));
  else console.warn(`Quality review required: ${JSON.stringify(finalized.quality)}`);
  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2));
  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(finalized.report, null, 2));
  await writeFile(resolve(directory, "scrape-result.json"), JSON.stringify(result, null, 2));
  return {
    company: company.name, slug: company.slug, status: result.report.status, exportReady: finalized.report.exportReady, quality: finalized.quality,
    sourceUrl: company.careersUrl, scrapedAt: result.report.scrapedAt,
    process: result.report.process, pagesRead: result.report.pagesVisited,
    jobs: new Set(rows.map(row => `${row.jobId || row.jobUrl}|${row.jobUrl}`)).size, locationRows: rows.length,
    reviewNotes: result.report.dataNotes.length, postingDateFallbacks: result.report.dateFallbacks.length,
    excluded: result.report.skipped.length, issues: result.report.issues.length,
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
