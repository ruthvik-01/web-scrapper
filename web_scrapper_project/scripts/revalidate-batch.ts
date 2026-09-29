import { copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccessPolicy } from "../src/crawl.js";
import { extractJobs } from "../src/extract.js";
import { Geography } from "../src/geography.js";
import { normalizeJobs, type RawJob } from "../src/normalize.js";
import { runBatch, type BatchCompany } from "../src/batch.js";

const directory = resolve("output/batch-2026-09-16");
const manifest: BatchCompany[] = JSON.parse(await readFile("companies-next-five.json", "utf8"));
for (const slug of ["mencap", "intercity-technology"]) {
  const path = resolve(directory, slug, "scrape-result.json");
  const result = JSON.parse(await readFile(path, "utf8"));
  if (result.report.revalidatedAt) continue;
  await copyFile(path, resolve(directory, "evidence", `${slug}-before-revalidation.json`));
  const geo = new Geography();
  let raw: RawJob[];
  if (slug === "mencap") {
    raw = [];
    for (const job of result.rawJobs as RawJob[]) {
      // Re-run country verification on preserved source records, not a new scrape.
      const evidence = result.report.locationEvidence.find((item: { jobId: string; jobUrl: string }) =>
        item.jobId === job.jobId && item.jobUrl === job.jobUrl);
      raw.push(await geo.resolve({ ...job, locations: evidence?.sourceLocations || job.locations }));
    }
  } else {
    raw = [];
    const policy = new AccessPolicy(1000, 30000);
    for (const url of new Set<string>(result.rows.map((row: { jobUrl: string }) => row.jobUrl))) {
      const document = await policy.html(url);
      const extracted = extractJobs(document.body, document.url, "Intercity Technology");
      if (!extracted.length) throw new Error(`Revalidation found no job: ${url}`);
      raw.push(...extracted);
    }
  }
  const normalized = normalizeJobs(raw, new Date(result.report.scrapedAt));
  result.rows = normalized.rows;
  result.rawJobs = raw;
  Object.assign(result.report, {
    rows: normalized.rows.length, candidates: raw.length,
    skipped: normalized.skipped, dateFallbacks: normalized.dateFallbacks,
    dataNotes: normalized.dataNotes,
    status: result.report.issues.length || result.report.limited ? "partial" : normalized.rows.length ? "ok" : "no_matches",
    locationEvidence: [...result.report.locationEvidence, ...geo.evidence],
    revalidatedAt: new Date().toISOString(),
    revalidation: slug === "mencap"
      ? "Revalidated preserved role text for explicit UK work-eligibility requirements. No headquarters-based country inference."
      : "Refetched all six details; use identifier.value for vacancy ID and decode title entities.",
  });
  result.report.attempts.push({
    method: "SOURCE EVIDENCE REVALIDATION", status: result.report.status,
    candidates: raw.length, rows: normalized.rows.length,
  });
  await writeFile(path, JSON.stringify(result, null, 2));
}
if (process.argv.includes("--sources-only")) process.exit(0);
// Scope is an export-only filter; preserve the original Compass group response
// as evidence and apply the source-employer restriction without another crawl.
const compass = manifest.find(company => company.slug === "compass-schools")!;
const compassPath = resolve(directory, compass.slug);
await copyFile(resolve(compassPath, "scrape-result.json"), resolve(directory, "evidence/compass-group-before-scope.json"));
await writeFile(resolve(compassPath, "company.json"), JSON.stringify(compass, null, 2));
const summaries = await runBatch(manifest, directory, true);
console.log(JSON.stringify(summaries, null, 2));
