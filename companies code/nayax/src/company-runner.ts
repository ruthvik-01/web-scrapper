import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrapeJobSitemap } from "./sitemap.js";
import { outputCsv, outputRows } from "./output.js";

export interface CompanyConfig {
  name: string;
  slug: string;
  workbookRow: number;
  careersUrl: string;
  sitemapUrl: string;
}

/** Shared implementation copied with every company's standalone TypeScript code. */
export async function runCompany(config: CompanyConfig, directory: string) {
  const now = new Date(); // Dynamic on every invocation; never hardcode a posting date.
  console.log(`Starting ${config.name} (${now.toISOString()})`);
  const result = await scrapeJobSitemap(config.careersUrl, config.sitemapUrl, {
    company: config.name, now, maxPages: 1000, delayMs: 1000, timeoutMs: 30_000,
  });
  const rows = outputRows(result, config.name);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows), "utf8");
  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2) + "\n");
  await writeFile(resolve(directory, "scrape-result.json"), JSON.stringify(result, null, 2) + "\n");
  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(result.report, null, 2) + "\n");
  const summary = {
    company: config.name, slug: config.slug, workbookRow: config.workbookRow,
    sourceUrl: config.careersUrl, scrapedAt: result.report.scrapedAt,
    status: result.report.status, process: result.report.process,
    pagesRead: result.report.pagesVisited, advertisedJobs: result.report.advertisedUrls,
    jobs: new Set(result.rows.map(row => row.jobId)).size, locationRows: result.rows.length,
    postingDateFallbacks: result.report.dateFallbacks.length,
    reviewNotes: result.report.dataNotes.length,
    excluded: result.report.skipped.length, issues: result.report.issues.length,
    csv: `${config.slug}/jobs.csv`, code: `${config.slug}/code/scrape.ts`,
  };
  console.log(`Completed ${config.name}: ${summary.locationRows} rows, ${summary.postingDateFallbacks} date fallbacks, ${summary.status}.`);
  return summary;
}
