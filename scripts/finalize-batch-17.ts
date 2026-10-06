import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { normalizeJobs } from "../src/normalize.js";
import { outputRows, outputCsv } from "../src/output.js";
import { packageBatch } from "./package-batch.js";

const root = resolve(import.meta.dirname, "..");
const base = resolve(root, "output/batch 17-9-2026");
const manifest = resolve(root, "companies-batch-17-9-2026.json");
const companies = JSON.parse(await readFile(manifest, "utf8"));
const stage = await mkdtemp(resolve(tmpdir(), "uk-batch-17-"));
const combined = [], summaries = [];
for (const company of companies) {
  const original = resolve(base, "delivered", company.slug);
  const result = JSON.parse(await readFile(resolve(original, "scrape-result.json"), "utf8"));
  if (result.rawJobs?.length) {
    // The manifest name is the exported company identity for every row of this company.
    for (const job of result.rawJobs) job.company = company.name;
    const normalized = normalizeJobs(result.rawJobs, new Date(result.report.scrapedAt));
    result.rows = normalized.rows;
    Object.assign(result.report, normalized, {rows: normalized.rows.length});
    if (!result.report.issues.length && !result.report.limited) result.report.status = result.rows.length ? "ok" : "no_matches";
    result.report.reprocessedAt = new Date().toISOString();
    result.report.reprocessingNote = "Saved raw source records re-normalized under the permanent export contract; original scrape date and UK evidence retained. No new location inference.";
  } else assert.equal(result.rows.length, 0, "Nonempty results must have raw source records");
  const rows = outputRows(result, company.name);
  const folder = resolve(stage, company.slug);
  await mkdir(folder);
  for(const [name,value] of Object.entries({"company.json":company,"scrape-result.json":result,"scrape-report.json":result.report,"export-rows.json":rows})) {
    await writeFile(resolve(folder,name),JSON.stringify(value,null,2));
  }
  await writeFile(resolve(folder,"jobs.csv"),outputCsv(rows));
  combined.push(...rows);
  summaries.push({company:company.name,slug:company.slug,status:result.report.status,jobs:new Set(result.rows.map((r:any)=>r.jobId)).size,rows:result.rows.length,candidates:result.report.candidates,issues:result.report.issues.length,excluded:result.report.skipped.length});
}
await writeFile(resolve(stage,"companies.csv"),outputCsv(combined));
await writeFile(resolve(stage,"batch-report.json"),JSON.stringify(summaries,null,2));
assert.equal(companies.length,8);
const packaged=await packageBatch(stage,manifest);
await writeFile(resolve(base,"package-location.json"),JSON.stringify({stage,packaged,summaries},null,2));
console.log(JSON.stringify({stage,summaries,archive:packaged.archive},null,2));
