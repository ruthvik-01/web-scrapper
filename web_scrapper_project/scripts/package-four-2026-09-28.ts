import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { OUTPUT_COLUMNS, outputCsv, type OutputRow } from "../src/output.js";

const root = resolve(process.argv[2] || "../output/2026-09-28-main-uk-scrape");
const verified = resolve(process.argv[3] || "../output/2026-09-28-verified");
const names: Record<string, string> = {
  "mayra-property-services": "Mayra Property Services",
  "mega-food-centre": "Mega food centre",
  "mountain-healthcare-ltd": "Mountain Healthcare Ltd",
  "northwood-hygiene-products-limited": "Northwood Hygiene Products Limited",
};
const problems: string[] = [];
const all = JSON.parse(await readFile(join(root, "companies.json"), "utf8")) as OutputRow[];
const allIds = new Set<string>(), allUrls = new Set<string>();
for (const [slug, name] of Object.entries(names)) {
  const dir = join(root, "jobs company wise", slug);
  const rows = JSON.parse(await readFile(join(dir, "jobs.json"), "utf8")) as OutputRow[];
  if (await readFile(join(dir, "jobs.csv"), "utf8") !== outputCsv(rows)) problems.push(`${slug}: CSV/JSON differ`);
  if (rows.length !== all.filter(row => row.company === name).length) problems.push(`${slug}: master count differs`);
  if (JSON.stringify(rows) !== JSON.stringify(all.filter(row => row.company === name))) problems.push(`${slug}: master rows differ`);
  for (const row of rows) {
    if (row.company !== name) problems.push(`${slug}: wrong company label`);
    if (JSON.stringify(Object.keys(row)) !== JSON.stringify(OUTPUT_COLUMNS)) problems.push(`${slug}: wrong columns`);
    for (const field of ["jobId", "title", "description", "jobUrl", "company", "country", "ats"] as const) {
      if (!row[field]?.trim()) problems.push(`${slug}: empty ${field}`);
    }
    if (row.country !== "United Kingdom" || row.ats !== "Custom") problems.push(`${slug}: country/ATS`);
    if (allIds.has(row.jobId) || allUrls.has(row.jobUrl)) problems.push(`${slug}: duplicate ID/URL`);
    allIds.add(row.jobId); allUrls.add(row.jobUrl);
    for (const field of ["postedDate", "jdDeadline"] as const) {
      if (row[field] && !/^\d{4}-\d{2}-\d{2}$/.test(row[field])) problems.push(`${slug}: invalid ${field}`);
    }
    if (row.jdDeadline && row.jdDeadline < "2026-09-28") problems.push(`${slug}: expired`);
    if (row.postedDate && row.postedDate < "2026-07-28") problems.push(`${slug}: older than window`);
    if (row.salaryRange && !/^£\d+(?:\.\d{1,2})?(?:-£\d+(?:\.\d{1,2})?)?$/.test(row.salaryRange)) problems.push(`${slug}: salary format`);
    if (/jobs\.nhs\.uk/i.test(row.jobUrl)) problems.push(`${slug}: NHS Jobs URL`);
  }
}
if (all.length !== allIds.size) problems.push("Master count differs from company rows");
if (await readFile(join(root, "companies.csv"), "utf8") !== outputCsv(all)) problems.push("Master CSV/JSON differ");
if (problems.length) throw new Error(problems.join("\n"));

async function files(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else result.push(relative(root, path).split(sep).join("/"));
  }
  return result;
}
const included = (await files(root)).filter(path =>
  ["companies.csv", "companies.json", "source-report.json", "README.md"].includes(path) ||
  path.startsWith("code/") ||
  (path.startsWith("jobs company wise/") && !path.endsWith("/export-rows.json")));
const inputs: Record<string, Uint8Array> = {};
for (const path of included) inputs[path] = await readFile(join(root, path));
const zip = zipSync(inputs, { level: 6 });
const unpacked = unzipSync(zip);
if (Object.keys(unpacked).length !== included.length) throw new Error("ZIP entry count mismatch");
for (const path of included) {
  const disk = inputs[path], zipped = unpacked[path];
  if (!zipped || !Buffer.from(disk).equals(Buffer.from(zipped))) throw new Error(`ZIP content mismatch: ${path}`);
}
await writeFile(join(root, "final.zip"), zip);
await mkdir(verified, { recursive: true });
for (const path of [...included, "final.zip", "batch-report.json"]) {
  const destination = join(verified, path);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await copyFile(join(root, path), destination);
  const a = await readFile(join(root, path)), b = await readFile(destination);
  if (!a.equals(b)) throw new Error(`Verified copy mismatch: ${path}`);
}
const report = {
  date: "2026-09-28", passed: true, rows: all.length,
  counts: Object.fromEntries(Object.entries(names).map(([slug, name]) => [slug, all.filter(row => row.company === name).length])),
  checks: ["CSV/JSON equality", "schema and required fields", "unique IDs and URLs", "date window and expiry", "salary format", "ZIP entry equality and CRC", "verified-copy byte equality"],
  limitations: ["Mayra supplied URL is a different German employer; no Mayra rows verified", "Mega food centre label differs from the source site's MegaCentre Rayleigh name", "Unknown source posting dates remain blank"],
  zipEntries: included.length,
};
await writeFile(join(root, "verification.json"), JSON.stringify(report, null, 2));
await copyFile(join(root, "verification.json"), join(verified, "verification.json"));
console.log(JSON.stringify(report));
