import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runBatch, type BatchCompany } from "./src/batch.js";
const config: BatchCompany = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));
const directory = resolve(import.meta.dirname, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
console.log(`Saving this run to ${directory}`);
const report = await runBatch([config], directory);
if (report.some(item => ["failed", "partial", "unsupported"].includes(String(item.status)))) process.exitCode = 2;
