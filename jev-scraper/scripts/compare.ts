/** Field-by-field comparison of a jev-scraper run against a parent-project baseline.
 * Usage: npx tsx scripts/compare.ts <jevJobsCsv> <baselineJobsCsv>
 *
 * Matches rows by normalised jobUrl, then reports per-field fill rates and
 * disagreements so quality optimisation targets are evidence-based rather than
 * guessed.
 */
import { readFileSync } from "node:fs";

const [, , jevPath, basePath] = process.argv;
if (!jevPath || !basePath) {
  console.error("Usage: npx tsx scripts/compare.ts <jevJobsCsv> <baselineJobsCsv>");
  process.exit(2);
}

function parseCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { current.push(field); field = ""; }
    else if (ch === "\r") { continue; }
    else if (ch === "\n") { current.push(field); rows.push(current); current = []; field = ""; }
    else field += ch;
  }
  const [header = [], ...body] = rows.filter(r => r.length > 1 || r[0]?.trim());
  return body.map(cells => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

const normUrl = (url: string): string =>
  url.trim().toLowerCase().replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");

/** Path-only key: the same board is often reachable under several hostnames
 * (e.g. careers.compasscommunity.co.uk vs compasscommunityweb.eploy.net). */
const normPath = (url: string): string => {
  try { return new URL(url.trim()).pathname.replace(/\/$/, "").toLowerCase(); }
  catch { return ""; }
};

const jev = parseCsv(jevPath);
const base = parseCsv(basePath);
const baseByUrl = new Map<string, Record<string, string>>(base.map(row => [normUrl(row.jobUrl ?? ""), row] as const));
const jevByUrl = new Map<string, Record<string, string>>(jev.map(row => [normUrl(row.jobUrl ?? ""), row] as const));
const baseByPath = new Map<string, Record<string, string>>(base.map(row => [normPath(row.jobUrl ?? ""), row] as const).filter(([key]) => key));
const jevByPath = new Map<string, Record<string, string>>(jev.map(row => [normPath(row.jobUrl ?? ""), row] as const).filter(([key]) => key));

const overlap = jev.filter(row => baseByUrl.has(normUrl(row.jobUrl ?? "")) || (normPath(row.jobUrl ?? "") && baseByPath.has(normPath(row.jobUrl ?? ""))));
const onlyJev = jev.filter(row => !overlap.includes(row));
const onlyBase = base.filter(row => !jevByUrl.has(normUrl(row.jobUrl ?? "")) && !(normPath(row.jobUrl ?? "") && jevByPath.has(normPath(row.jobUrl ?? ""))));

const byUrl = (row: Record<string, string>): Record<string, string> | undefined =>
  baseByUrl.get(normUrl(row.jobUrl ?? "")) ?? (normPath(row.jobUrl ?? "") ? baseByPath.get(normPath(row.jobUrl ?? "")) : undefined);

console.log(`jev=${jev.length} baseline=${base.length} overlap=${overlap.length} onlyJev=${onlyJev.length} onlyBase=${onlyBase.length}`);

const fields = ["title", "description", "location", "city", "state", "country", "postedDate", "jdDeadline", "employmentType", "worktype", "salaryRange", "company"];
for (const field of fields) {
  const jevFilled = jev.filter(r => (r[field] ?? "").trim()).length;
  const baseFilled = base.filter(r => (r[field] ?? "").trim()).length;
  console.log(`${field.padEnd(15)} jev=${String(jevFilled).padStart(4)}  base=${String(baseFilled).padStart(4)}`);
}

console.log("\n--- disagreements on overlapping rows (first 25) ---");
let shown = 0;
for (const row of overlap) {
  const other = byUrl(row)!;
  for (const field of fields) {
    const a = (row[field] ?? "").trim();
    const b = (other[field] ?? "").trim();
    if (a !== b && (a || b) && shown < 25) {
      shown++;
      console.log(`  [${row.title?.slice(0, 44)}] ${field}: jev=${JSON.stringify(a.slice(0, 60))} base=${JSON.stringify(b.slice(0, 60))}`);
    }
  }
}

console.log("\n--- baseline-only sample (may be stale listings or filter misses) ---");
for (const row of onlyBase.slice(0, 10)) console.log(`  ${row.title} :: ${row.jobUrl}`);
console.log("\n--- jev-only sample (may be fresh listings or scope leaks) ---");
for (const row of onlyJev.slice(0, 10)) console.log(`  ${row.title} :: ${row.jobUrl}`);
