import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { canonicalUrl } from "../src/normalize.js";
import { OUTPUT_COLUMNS, outputCsv, type OutputRow } from "../src/output.js";
import { deliveryQuality, finalizeScrapeResult } from "../src/final-dataset.js";
import type { scrapeWebsite } from "../src/strategy.js";

// Usage: tsx scripts/finalize-delivery.ts sources.json output/30-9-26 30-9-26
// Sources are actual scraper result JSON files, never an audit CSV.
interface Source { name: string; slug: string; result: string; kind: string }
const [manifestFile, targetFolder, deliveryName] = process.argv.slice(2);
if (!manifestFile || !targetFolder || !deliveryName || !/^[\w-]+$/.test(deliveryName)) throw new Error("Pass a source manifest, output directory and safe delivery name.");
const sources: Source[] = JSON.parse(await readFile(resolve(manifestFile), "utf8"));
const now = new Date();
const rows: OutputRow[] = [];
const summaries = [];
const rejections: { company: string; jobUrl: string; reason: string; title?: string }[] = [];
const provenance = [];
const finalCompanies = [];
for (const source of sources) {
  const bytes = await readFile(resolve(source.result));
  const result: Awaited<ReturnType<typeof scrapeWebsite>> = JSON.parse(bytes.toString("utf8"));
  if (!result.rawJobs || result.report.limited) throw new Error(`${source.name}: missing source records or unfinished pagination.`);
  const finalized = finalizeScrapeResult(result, source.name, now);
  result.rows = finalized.rows;
  result.report = finalized.report;
  if (!finalized.report.qualityPassed) throw new Error(`${source.name}: output quality checks failed: ${JSON.stringify(finalized.quality)}`);
  rows.push(...finalized.rows);
  const rejected = result.report.skipped.map(item => ({ company: source.name, ...item }));
  // A discovered advert with no record remains visible in the rejection ledger.
  for (const issue of result.report.issues) {
    if (!result.rawJobs.some(job => canonicalUrl(job.jobUrl) === canonicalUrl(issue.url))) {
      rejected.push({ company: source.name, jobUrl: issue.url, title: "", reason: "missing_details" });
    }
  }
  const uniqueRejected = [...new Map(rejected.map(item => [`${item.jobUrl}|${item.reason}`, item])).values()];
  rejections.push(...uniqueRejected);
  const parsedUnique = new Set(result.rawJobs.map(job => canonicalUrl(job.jobUrl))).size;
  summaries.push({ company: source.name, sourceKind: source.kind, discovered: parsedUnique + uniqueRejected.filter(item => !result.rawJobs.some(job => canonicalUrl(job.jobUrl) === canonicalUrl(item.jobUrl))).length,
    scraped: parsedUnique, rawRecords: result.rawJobs.length, valid: finalized.rows.length, rejected: uniqueRejected.length,
    pages: result.report.pagesVisited, status: result.report.status, reasons: countBy(uniqueRejected, item => item.reason), merges: finalized.report.deliveryLocationMerges,
    unknownPostingDates: finalized.rows.filter(row => !row.postedDate).length, unknownSalary: finalized.rows.filter(row => !row.salaryRange).length });
  provenance.push({ ...source, sourceScrapedAt: result.report.scrapedAt, sha256: createHash("sha256").update(bytes).digest("hex") });
  finalCompanies.push({ source, result, rows: finalized.rows });
}
rows.sort((a, b) => b.postedDate.localeCompare(a.postedDate) || a.company.localeCompare(b.company) || a.jobId.localeCompare(b.jobId));
const checks = deliveryQuality(rows);
if (Object.values(checks).some(value => value !== 0)) throw new Error(`Final validation failed: ${JSON.stringify(checks)}`);
const csv = outputCsv(rows);
const parsed = csvRows(csv);
if (parsed.length !== rows.length || JSON.stringify(parsed) !== JSON.stringify(rows)) throw new Error("Final CSV round-trip changed a field or row.");
const target = resolve(targetFolder);
await mkdir(target, { recursive: true });
const destination = resolve(target, `${deliveryName}.csv`);
let baseline: OutputRow[] = [];
try {
  await copyFile(destination, resolve(target, `${deliveryName}.before-source-fixes.csv`), constants.COPYFILE_EXCL);
} catch (error) { if (!["ENOENT", "EEXIST"].includes((error as NodeJS.ErrnoException).code || "")) throw error; }
try { baseline = csvRows(await readFile(resolve(target, `${deliveryName}.before-source-fixes.csv`), "utf8")); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
for (const item of finalCompanies) {
  const folder = resolve(target, "final-companies", item.source.slug);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, "jobs.csv"), outputCsv(item.rows));
  await writeFile(resolve(folder, "export-rows.json"), JSON.stringify(item.rows, null, 2));
  await writeFile(resolve(folder, "scrape-result.json"), JSON.stringify(item.result, null, 2));
  await writeFile(resolve(folder, "scrape-report.json"), JSON.stringify(item.result.report, null, 2));
}
await writeFile(destination, csv);
await writeFile(resolve(target, "all_jobs_combined.csv"), csv);
// Inspect the actual file on disk as a final gate.
const onDisk = csvRows(await readFile(destination, "utf8"));
if (JSON.stringify(deliveryQuality(onDisk)) !== JSON.stringify(checks) || onDisk.length !== rows.length) throw new Error("Written CSV did not pass final validation.");
const report = { generatedAt: now.toISOString(), pipeline: "normalizeJobs -> outputRows -> mergeJobLocations -> quality -> outputCsv -> read-back",
  finalRows: rows.length, csvSha256: createHash("sha256").update(csv).digest("hex"), companies: countBy(rows, row => row.company), pages: summaries.reduce((sum, item) => sum + item.pages, 0),
  rejected: rejections.length, rejectionReasons: countBy(rejections, item => item.reason), quality: checks, summaries, provenance,
  baseline: { rows: baseline.length, companies: countBy(baseline, row => row.company) },
  reconciliation: sources.map(source => {
    const oldRows = baseline.filter(row => row.company === source.name);
    const newRows = rows.filter(row => row.company === source.name);
    // Official vacancy IDs survive harmless URL query/host-alias changes.
    return { company: source.name, beforeRows: oldRows.length, finalRows: newRows.length,
      added: newRows.filter(row => !oldRows.some(old => sameVacancy(old, row))).map(row => ({ jobId: row.jobId, jobUrl: row.jobUrl })),
      removed: oldRows.filter(row => !newRows.some(current => sameVacancy(row, current))).map(row => ({ jobId: row.jobId, jobUrl: row.jobUrl,
        reason: rejections.find(item => item.company === source.name && sameVacancy({ jobId: "", jobUrl: item.jobUrl }, row))?.reason ||
          (source.name === "Curtis Fox Limited" && row.jobId === "93" ? "withdrawn_http_410" : "not_in_current_source") })),
      changedFields: newRows.filter(row => oldRows.some(old => sameVacancy(old, row))).map(row => ({ jobId: row.jobId,
        fields: OUTPUT_COLUMNS.filter(field => oldRows.find(old => sameVacancy(old, row))![field] !== row[field]) })) };
  }),
  missingValues: "Blank CSV cells represent unavailable source fields; no dates, salaries or cities are invented.",
  sourceLimitations: [{ company: "Currie & Brown", jobId: "21863", description: null, location: null, salary: null,
    reason: "HTTP 200 static and rendered advert: primary role empty, location/salary Not Specified, no JobPosting. Truncated SEO metadata mentions Halol, Gujarat. Not exportable as a UK job." },
    { company: "Curtis Fox Limited", jobId: "93", reason: "Audited Operations Co-ordinator URL now returns HTTP 410 Gone and is absent from the current board; withdrawn from this delivery." }],
  samples: summaries.map(item => ({ company: item.company, rows: onDisk.filter(row => row.company === item.company).slice(0, 3).map(row => ({ ...row, description: row.description.slice(0, 180) })) })) };
await writeFile(resolve(target, `${deliveryName}-summary.json`), JSON.stringify(report, null, 2));
await writeFile(resolve(target, "rejections.json"), JSON.stringify(rejections, null, 2));
await writeFile(resolve(target, "provenance.json"), JSON.stringify(provenance, null, 2));
console.log(JSON.stringify({ destination, finalRows: rows.length, companies: report.companies, rejected: report.rejected, reasons: report.rejectionReasons, quality: checks, summaries }, null, 2));

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[key(value)] = (counts[key(value)] || 0) + 1;
  return counts;
}
function sameVacancy(a: Pick<OutputRow, "jobId" | "jobUrl">, b: Pick<OutputRow, "jobId" | "jobUrl">): boolean {
  const sourceId = (value: string) => {
    const url = new URL(value);
    return /\/(?:vacancies|Jobs\/Advert)\/(\d+)(?:\/|$)/i.exec(url.pathname)?.[1] || url.searchParams.get("VacancyID") || "";
  };
  return Boolean(a.jobId && a.jobId === b.jobId) || canonicalUrl(a.jobUrl) === canonicalUrl(b.jobUrl) ||
    Boolean(sourceId(a.jobUrl) && sourceId(a.jobUrl) === sourceId(b.jobUrl));
}
function csvRows(csv: string): OutputRow[] {
  const book = XLSX.read(csv.replace(/^\uFEFF/, ""), { type: "string", raw: true });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  const header = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]!;
  if (JSON.stringify(header) !== JSON.stringify(OUTPUT_COLUMNS)) throw new Error("Unexpected CSV schema.");
  return XLSX.utils.sheet_to_json<OutputRow>(sheet, { defval: "", raw: true });
}
