import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { normalizeJobs, ukLocation, type RawJob } from "../src/normalize.js";

const base = resolve("output/comeet-combined-30-2026-09-18");
const manifest = JSON.parse(await readFile("companies-comeet-combined-30-2026-09-18.json", "utf8"));
const summaries = [];
const audit = [];
const count = (jobs: { jobUrl: string }[]) => new Set(jobs.map(job => job.jobUrl)).size;
const warnings: Record<string, string> = {
  alice: "Identity mismatch: alice.io, not Alice + Olivia",
  persivalenic: "Demo board; supplied company identity unverified; 2 other records lack details",
  kaltura: "Board website is corp.kaltura.com, not supplied kaltural.com",
  "noma-security": "One role has conflicting Remote/On-site source fields",
  checkmarx: "Country repeated in state was cleared",
  overwolf: "Remote-as-city corrected using separate London source label",
  classiq: "Identity mismatch: classiq.io, not classiquelimo.com",
  curve: "Supplied board empty; other careers sites not assessed",
  monday: "Supplied board empty; other careers sites not assessed",
};

for (const company of manifest) {
  const saved = JSON.parse(await readFile(resolve(base, company.slug, "scrape-result.json"), "utf8"));
  const raw: RawJob[] = saved.rawJobs;
  const report = saved.report;
  const uk = raw.filter(job => job.locations.some(ukLocation));
  const after = count(saved.rows);
  assert.equal(count(raw), raw.length, `${company.name}: duplicate raw URLs`);
  assert.equal(report.advertisedPositions, raw.length + report.nonVacancyExcluded.length);
  assert.deepEqual(
    normalizeJobs(raw, new Date(report.scrapedAt)).rows,
    saved.rows,
    `${company.name}: normalization replay differs`,
  );
  assert.ok(after <= count(uk) && count(uk) <= raw.length);
  const reasons = [];
  const byReason: Record<string, number> = {};
  for (const excluded of report.nonVacancyExcluded) {
    byReason[excluded.reason] = (byReason[excluded.reason] || 0) + 1;
  }
  if (byReason.explicit_demo_not_real_vacancy) reasons.push(`${byReason.explicit_demo_not_real_vacancy} demo listings excluded`);
  if (byReason.general_interest_not_specific_vacancy) reasons.push(`${byReason.general_interest_not_specific_vacancy} general-interest listings excluded`);
  if (byReason.internal_only) reasons.push(`${byReason.internal_only} internal listings excluded`);
  const skipped: Record<string, number> = {};
  for (const item of report.skipped) skipped[item.reason] = (skipped[item.reason] || 0) + 1;
  if (skipped.no_confirmed_uk_location) reasons.push(`${skipped.no_confirmed_uk_location} non-UK/unconfirmed`);
  if (skipped.missing_details) reasons.push(`${skipped.missing_details} missing details`);
  if (skipped.outside_date_window) reasons.push(`${skipped.outside_date_window} outside date window`);
  if (skipped.unknown_date) reasons.push(`${skipped.unknown_date} invalid dates`);
  const issues = [];
  if (report.dateFallbacks.length) issues.push(`${report.dateFallbacks.length} fallback dates; recency unverified`);
  if (warnings[company.slug]) issues.push(warnings[company.slug]);
  if (report.issues.length) issues.push(`${report.issues.length} extraction issues`);
  if (report.limited) issues.push("Extraction limited");
  summaries.push({
    company: company.name,
    total_jobs_count: report.advertisedPositions,
    uk_jobs_count: count(uk),
    "uk_jobs_count-after-2months-filter": after,
    reason: reasons.join("; ") || (report.advertisedPositions ? "All retained" : "Empty supplied board"),
    issues: issues.join("; ") || "None recorded",
  });
  audit.push({
    company: company.name, source: resolve(base, company.slug, "scrape-result.json"),
    scrapedAt: report.scrapedAt, window: report.window,
    listedRecords: report.advertisedPositions, nonVacancyExcluded: byReason,
    remainingCandidates: raw.length, ukBeforeDateFilter: count(uk), accepted: after,
    skippedReasons: skipped, fallbackDates: report.dateFallbacks.length,
  });
}

const totals = {
  total_jobs_count: summaries.reduce((sum, row) => sum + row.total_jobs_count, 0),
  uk_jobs_count: summaries.reduce((sum, row) => sum + row.uk_jobs_count, 0),
  "uk_jobs_count-after-2months-filter": summaries.reduce((sum, row) => sum + row["uk_jobs_count-after-2months-filter"], 0),
};
assert.equal(summaries.length, 30);
assert.equal(totals.total_jobs_count, 854);
assert.equal(totals.uk_jobs_count, 66);
assert.equal(totals["uk_jobs_count-after-2months-filter"], 65);
const method = "Saved September 18, 2026 snapshots; no live refresh. total_jobs_count counts all board-listed position records, including 23 demo and 3 general-interest records that were excluded before UK/date evaluation. UK counts exclude those non-vacancies and use distinct position URLs, preserving location-specific IDs. After-filter means final usable exported records after detail validation and the existing July 18–September 18, 2026 date rule, including disclosed missing-date fallback. All 65 retained jobs have fallback dates, so publication recency is not verified. Of 66 UK-tagged candidates, one Aviation record lacks details; no UK records were removed for age. Across all records: 26 non-vacancies, 759 geography exclusions, 4 missing-detail exclusions, 65 exports. Earlier delivery summaries incorrectly grouped all 763 skipped records as geography exclusions; original job data is unchanged.";
const destination = resolve("output/comeet-company-summary-2026-09-18");
await mkdir(destination, { recursive: true });
const columns = Object.keys(summaries[0]!);
const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
await writeFile(resolve(destination, "company-summary.csv"), "\uFEFF" +
  [columns, ...summaries.map(row => columns.map(column => row[column as keyof typeof row]))]
    .map(row => row.map(quote).join(",")).join("\r\n") + "\r\n");
await writeFile(resolve(destination, "audit.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), method, totals, companies: audit,
}, null, 2));
await writeFile(resolve(destination, "README.md"), `# Comeet company summary\n\n${method}\n\nNo existing delivery files were changed.\n`);
console.log(JSON.stringify({ method, totals, summaries }, null, 2));
