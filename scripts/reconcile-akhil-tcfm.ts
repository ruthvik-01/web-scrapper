import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractJobs } from "../src/extract.js";
import { Geography } from "../src/geography.js";
import { normalizeJobs, type RawJob } from "../src/normalize.js";
import { runBatch, type BatchCompany } from "../src/batch.js";

const oldDirectory = resolve("output/akhil-recovery-2026-09-18/tcfm");
const directory = resolve("output/akhil-tcfm-verified-2026-09-18");
const old = JSON.parse(await readFile(resolve(oldDirectory, "scrape-result.json"), "utf8"));
const listing = JSON.parse(await readFile(resolve(oldDirectory, "active-listing-audit.json"), "utf8"));
const id = (url: string) => /\/vacancies\/(\d+)\//.exec(url)?.[1];
const active = new Set<string>(listing.activeUrls.map(id));
assert.equal(active.size, 86);
assert.ok([...active].every(Boolean));
const geo = new Geography();
const jobs: RawJob[] = old.rawJobs.filter((job: RawJob) => active.has(id(job.jobUrl)!));
for (const url of listing.missingUrls as string[]) {
  const html = await readFile(resolve("output/akhil-ruthvik-2026-09-18/research", `tcfm-${id(url)}`, "page.html"), "utf8");
  const extracted = extractJobs(html, url, "TCFM").filter(job => id(job.jobUrl) === id(url));
  assert.equal(extracted.length, 1, `Expected one matching job for ${url}`);
  jobs.push(await geo.resolve(extracted[0]!));
}
assert.equal(jobs.length, 86);
assert.deepEqual(new Set(jobs.map(job => id(job.jobUrl))), active);
const normalized = normalizeJobs(jobs, new Date(old.report.scrapedAt));
const company: BatchCompany = JSON.parse(await readFile(resolve(oldDirectory, "company.json"), "utf8"));
company.sourceNote += " Reconciled against all eight live listing pages: 86 advertised IDs, 86 complete job records. Three listing-only records recovered; six stale sitemap URLs are not on the active board.";
const result = { rows: normalized.rows, rawJobs: jobs, report: {
  ...old.report,
  process: "STATIC Eploy + complete DOM listing reconciliation",
  revalidatedAt: new Date().toISOString(),
  status: normalized.rows.length ? "ok" : "no_matches",
  rows: normalized.rows.length, candidates: jobs.length,
  pagesVisited: old.report.pagesVisited + listing.sourcePages + listing.missingUrls.length,
  issues: [], limited: false, pendingUrls: [],
  skipped: normalized.skipped, dateFallbacks: normalized.dateFallbacks,
  dataNotes: normalized.dataNotes,
  locationEvidence: [...old.report.locationEvidence, ...geo.evidence],
  sourceListing: listing,
  staleSitemapIssues: old.report.issues,
  attempts: [...old.report.attempts, {
    method: "COMPLETE LISTING RECONCILIATION", status: normalized.rows.length ? "ok" : "no_matches",
    candidates: jobs.length, rows: normalized.rows.length,
  }],
} };
await mkdir(resolve(directory, "tcfm"), { recursive: true });
await writeFile(resolve(directory, "tcfm/company.json"), JSON.stringify(company, null, 2));
await writeFile(resolve(directory, "tcfm/scrape-result.json"), JSON.stringify(result, null, 2));
await writeFile(resolve(directory, "companies.json"), JSON.stringify([company], null, 2));
await runBatch([company], directory, true);
