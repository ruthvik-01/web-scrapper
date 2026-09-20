import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runBatch, type BatchCompany } from "./src/batch.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, resume: { type: "boolean", default: false } },
});
if (positionals.length !== 1) throw new Error("Usage: tsx batch.ts companies.json --out output/new-batch [--resume]");
const companies: BatchCompany[] = JSON.parse(await readFile(resolve(positionals[0]!), "utf8"));
const report = await runBatch(companies, resolve(values.out || `output/batch-${Date.now()}`), values.resume);
if (report.some(item => ["failed", "partial", "unsupported"].includes(String(item.status)))) process.exitCode = 2;
