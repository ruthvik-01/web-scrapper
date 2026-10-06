import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Geography } from "../src/geography.js";
import { ukLocation, normalizeJobs, type RawJob, type JobRow } from "../src/normalize.js";

const batches = ["batch 15-9-2026", "batch-2026-09-16", "combined 17-9-26 batches"];
const companies = [
  ["MWH Treatment", "mwh-treatment", 0],
  ["Thinking Schools Academy Trust", "thinking-schools-academy-trust", 0],
  ["Walkers", "walkers-shortbread", 0],
  ["Guide Dogs", "guide-dogs", 0],
  ["Alzheimer's Society", "alzheimers-society", 0],
  ["Mencap", "mencap", 1],
  ["Intercity Technology", "intercity-technology", 1],
  ["London Borough of Bexley", "london-borough-of-bexley", 1],
  ["SeeAbility", "seeability", 1],
  ["Compass Schools", "compass-schools", 1],
  ["News UK", "news-uk", 2],
  ["Tower Hamlets", "tower-hamlets", 2],
  ["CC Nurseries", "cc-nurseries", 2],
  ["B&M", "bmstores", 2],
  ["London Borough of Hillingdon", "london-borough-of-hillingdon", 2],
  ["Frasers Hospitality", "frasers-hospitality", 2],
  ["Restore", "restore", 2],
  ["Wren Kitchens", "wren-kitchens", 2],
] as const;
const geography = new Geography();
const summaries: Record<string, string | number>[] = [];
const audit: unknown[] = [];
const count = (jobs: { jobUrl: string }[]) => new Set(jobs.map(job => job.jobUrl)).size;

for (const [company, slug, batch] of companies) {
  const source = path.resolve("output", batches[batch]!, "jobs company wise", slug, "scrape-result.json");
  const saved = JSON.parse(fs.readFileSync(source, "utf8"));
  const raw: RawJob[] = saved.rawJobs.filter((job: RawJob) => slug !== "compass-schools" || job.company === company);
  assert.equal(count(raw), raw.length, `${company}: duplicate source URLs`);
  const old = new Set(saved.report.skipped.filter((job: { reason: string }) => job.reason === "outside_date_window")
    .map((job: { jobUrl: string }) => job.jobUrl));
  const resolved: RawJob[] = [];
  for (const job of raw) {
    resolved.push(old.has(job.jobUrl) && !job.locations.some(ukLocation) ? await geography.resolve(job) : job);
  }
  const accepted: JobRow[] = saved.rows;
  const total = raw.length;
  // Preserve the documented owner-approved UK-only organisation exception.
  const uk = slug === "mencap" ? total : count(resolved.filter(job => job.locations.some(ukLocation)));
  const after = count(accepted);
  if (slug !== "mencap") {
    const replay = normalizeJobs(raw, new Date(saved.report.scrapedAt));
    assert.deepEqual([...new Set(replay.rows.map(job => job.jobUrl))].sort(),
      [...new Set(accepted.map(job => job.jobUrl))].sort(), `${company}: export replay mismatch`);
  }
  assert(after <= uk && uk <= total, `${company}: inconsistent counts`);
  const notes: string[] = [];
  const fallbacks = saved.report.dateFallbacks.filter((item: { jobUrl: string }) =>
    accepted.some(job => job.jobUrl === item.jobUrl)).length;
  if (fallbacks) notes.push(`${fallbacks} accepted jobs use scrape-date fallback (posted date and deadline missing)`);
  if (slug === "mencap") notes.push("UK-only organisation exception; recency is not independently verified");
  if (slug === "compass-schools") notes.push(`Shared portal: ${saved.rawJobs.length} jobs; ${saved.rawJobs.length - total} other-employer jobs excluded`);
  if (slug === "intercity-technology") notes.push("Old careers host failed; replacement official careers site used");
  if (slug === "frasers-hospitality") notes.push("Supplied Malmaison/Hotel du Vin portal only, not worldwide group vacancies");
  if (slug === "walkers-shortbread") notes.push("Walkers means Walker's Shortbread");
  if (slug === "tower-hamlets") notes.push("Saved location corrections retained");
  if (saved.report.issues.length) notes.push(`${saved.report.issues.length} extraction issues`);
  if (saved.report.limited) notes.push("Scrape limited");
  const reason = [
    total > uk ? `${total - uk} non-UK/unconfirmed UK excluded` : "",
    uk > after ? `${uk - after} UK jobs outside date window` : "",
  ].filter(Boolean).join("; ") || "All retained under configured rules";
  summaries.push({
    company,
    total_jobs_count: total,
    uk_jobs_count: uk,
    "uk_jobs_count-after-2months-filter": after,
    reason,
    issues: notes.join("; ") || "None recorded",
  });
  audit.push({ company, source, scrapedAt: saved.report.scrapedAt, window: saved.report.window,
    portalJobs: saved.rawJobs.length, locationRows: accepted.length, total, uk, after,
    ukUnconfirmed: resolved.filter(job => !job.locations.some(ukLocation)).map(job => job.jobUrl) });
  console.log(JSON.stringify(summaries.at(-1)));
}
const destination = path.resolve("output", "company-job-counts-2026-09-17");
fs.mkdirSync(destination, { recursive: true });
const columns = Object.keys(summaries[0]!);
const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
fs.writeFileSync(path.join(destination, "company-job-counts.csv"), "\uFEFF" +
  [columns, ...summaries.map(row => columns.map(column => row[column]))].map(row => row.map(quote).join(",")).join("\r\n") + "\r\n");
fs.writeFileSync(path.join(destination, "audit.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  method: "Distinct saved job URLs; source scrape windows retained. Previously date-skipped jobs receive geography-only checks; no vacancy rescrape. Existing exports are unchanged.",
  companies: audit, geographyEvidence: geography.evidence,
}, null, 2));
console.log(`Verified ${summaries.length} companies. Saved ${destination}`);
