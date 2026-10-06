import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { compareScraperRows } from "../src/scraper-comparison.js";
import { COLUMNS, type JobRow } from "../src/normalize.js";
const { values } = parseArgs({ options: { old: { type: "string" }, new: { type: "string" }, out: { type: "string" } } });
if (!values.old || !values.new) throw new Error("Usage: node --import tsx scripts/compare-scrapers.ts --old old-jobs.json --new new-jobs.json --out difference.json");
async function rows(file: string): Promise<JobRow[]> {
  const data: unknown = JSON.parse((await readFile(resolve(file), "utf8")).replace(/^\uFEFF/, ""));
  const candidate = Array.isArray(data) ? data : data && typeof data === "object" && "rows" in data ? data.rows : undefined;
  if (!Array.isArray(candidate) || candidate.some(row => !row || COLUMNS.some(field => typeof row[field] !== "string"))) throw new Error("Comparison inputs must contain complete 15-column rows.");
  return candidate;
}
const report = compareScraperRows(await rows(values.old), await rows(values.new));
await writeFile(resolve(values.out || "scraper-difference.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(`${report.oldCount} old / ${report.newCount} new; ${report.unexplained} unexplained differences.`);
if (report.unexplained) process.exitCode = 2;
