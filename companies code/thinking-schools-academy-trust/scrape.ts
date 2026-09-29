import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCompany, type CompanyConfig } from "./src/company-runner.js";
const config: CompanyConfig = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));
const directory = resolve(import.meta.dirname, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
console.log(`Saving this run to ${directory}`);
const summary = await runCompany(config, directory);
if (["failed", "partial", "unsupported"].includes(summary.status)) process.exitCode = 2;
