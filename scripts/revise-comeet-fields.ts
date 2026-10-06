import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { extractComeetBoard } from "../src/comeet.js";
import { runBatch, type BatchCompany } from "../src/batch.js";
import { parsePostedDate, ukLocation } from "../src/normalize.js";
import { packageBatch } from "./package-batch.js";

const prior = resolve("output/comeet-combined-30-2026-09-18");
const out = resolve("output/comeet-updated-fields-2026-09-18");
const manifest = resolve("companies-comeet-updated-fields-2026-09-18.json");
const companies: BatchCompany[] = JSON.parse(await readFile("companies-comeet-combined-30-2026-09-18.json", "utf8"));
const sources = new Map<string, string>();
for (const [file, directory] of [
  ["companies-comeet-2026-09-18.json", "output/comeet-2026-09-18"],
  ["companies-comeet-second-2026-09-18.json", "output/comeet-second-2026-09-18"],
  ["companies-comeet-third-2026-09-18.json", "output/comeet-third-2026-09-18"],
]) {
  for (const company of JSON.parse(await readFile(file!, "utf8"))) sources.set(company.slug, directory!);
}
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const priorHash = hash(await readFile(resolve(prior, "final.zip")));
const changes = [];
const fieldAudit = [];
const summary = [];
await mkdir(out, { recursive: true });
for (const company of companies) {
  const previous = JSON.parse(await readFile(resolve(prior, company.slug, "scrape-result.json"), "utf8"));
  const snapshot = resolve(sources.get(company.slug)!, "preflight", `${company.slug}.html`);
  const bytes = await readFile(snapshot);
  const result = await extractComeetBoard(bytes.toString("utf8"), company.careersUrl, {
    company: company.name, now: new Date(previous.report.scrapedAt),
  });
  company.sourceNote = "User-requested policy: postedDate uses time_updated, not publication; two-month filtering uses update dates. Check workplace_type against location.is_remote. Employment type only from explicit source fields. " +
    (company.sourceNote || "").replace("Missing posting dates and deadlines use disclosed run-date fallback, not verified publication dates.", "").trim();
  await mkdir(resolve(out, company.slug), { recursive: true });
  await writeFile(resolve(out, company.slug, "company.json"), JSON.stringify(company, null, 2));
  await writeFile(resolve(out, company.slug, "scrape-result.json"), JSON.stringify(result, null, 2));
  assert.equal(result.report.dateFallbacks.length, 0);
  const accepted = new Set(result.rows.map(row => row.jobId));
  const priorRows = new Map<string, Record<string, string>>(previous.rows.map((row: Record<string, string>) => [row.jobId, row]));
  const removed = previous.rows.filter((row: Record<string, string>) => !accepted.has(row.jobId!));
  for (const row of result.rows) {
    const source = result.report.sourceFields.find(item => item.jobId === row.jobId)!;
    assert.ok(source);
    assert.equal(row.postedDate, parsePostedDate(source.time_updated, new Date(previous.report.scrapedAt)));
    assert.equal(row.employmentType, source.employment_type || "");
    assert.equal(row.worktype, source.workplace_type || (source.is_remote === true ? "Remote" : source.is_remote === false ? "On-site" : ""));
    const before = priorRows.get(row.jobId)!;
    assert.ok(before, "Unexpected newly accepted job");
    for (const key of Object.keys(row) as (keyof typeof row)[]) {
      if (!["postedDate", "employmentType", "worktype"].includes(key)) assert.equal(row[key], before[key], `${company.name}/${row.jobId}/${key}`);
    }
    fieldAudit.push({ company: company.name, ...source, postedDate: row.postedDate, employmentType: row.employmentType, worktype: row.worktype });
  }
  const uk = result.rawJobs.filter(job => job.locations.some(ukLocation));
  changes.push({
    company: company.name, snapshot, snapshotSha256: hash(bytes),
    originalScrapedAt: previous.report.scrapedAt, before: previous.rows.length, after: result.rows.length,
    removed: removed.map((row: Record<string, string>) => ({
      jobId: row.jobId, title: row.title, jobUrl: row.jobUrl,
      time_updated: result.report.sourceFields.find(item => item.jobId === row.jobId)?.time_updated,
      reason: result.report.skipped.find(item => item.jobUrl === row.jobUrl)?.reason,
    })),
  });
  summary.push({
    company: company.name, total_jobs_count: result.report.advertisedPositions,
    uk_jobs_count: uk.length, "uk_jobs_count-after-2months-filter": result.rows.length,
    reason: removed.length ? `${removed.length} previously exported roles outside update-date window` : result.rows.length ? "Retained under update-date rule" : "No usable UK roles on supplied board",
    issues: [
      result.rows.some(row => !row.employmentType) ? `${result.rows.filter(row => !row.employmentType).length} source employment types missing` : "",
      "Dates represent modification, not publication; see company source notes for identity/quality caveats",
    ].filter(Boolean).join("; "),
  });
}
await writeFile(manifest, JSON.stringify(companies, null, 2));
await runBatch(companies, out, true);
const packaged = await packageBatch(out, manifest);
assert.equal(hash(await readFile(resolve(prior, "final.zip"))), priorHash);
const audit = {
  method: "Reprocessed original saved website snapshots; no live refresh. Retained original scrape windows. postedDate now uses source time_updated in Europe/London. No fallback dates.",
  priorZipSha256: priorHash, priorZipUnchanged: true,
  retainedRows: fieldAudit.length,
  employmentTypeFilled: fieldAudit.filter(row => row.employmentType).length,
  employmentTypeMissing: fieldAudit.filter(row => !row.employmentType).length,
  isRemoteTrue: fieldAudit.filter(row => row.is_remote === true).length,
  isRemoteFalse: fieldAudit.filter(row => row.is_remote === false).length,
  changes,
};
await writeFile(resolve(out, "revision-audit.json"), JSON.stringify(audit, null, 2));
await writeFile(resolve(out, "source-field-audit.json"), JSON.stringify(fieldAudit, null, 2));
const columns = Object.keys(summary[0]!);
const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
await writeFile(resolve(out, "company-summary.csv"), "\uFEFF" +
  [columns, ...summary.map(row => columns.map(column => row[column as keyof typeof row]))].map(row => row.map(quote).join(",")).join("\r\n") + "\r\n");
console.log(JSON.stringify({
  archive: packaged.archive, retainedRows: audit.retainedRows,
  employmentTypeFilled: audit.employmentTypeFilled, employmentTypeMissing: audit.employmentTypeMissing,
  isRemoteTrue: audit.isRemoteTrue, isRemoteFalse: audit.isRemoteFalse,
  removed: changes.flatMap(change => change.removed),
}));
