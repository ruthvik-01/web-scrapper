// Re-export saved jobs without fetching sources or changing diagnostic reports.
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { outputCsv, outputRows } from "../src/output.js";

const root = resolve(import.meta.dirname, "..");
let count = 0;
async function refresh(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => entry.name === "export-rows.json")) {
    const saved = JSON.parse(await readFile(resolve(directory, "export-rows.json"), "utf8"));
    const report = JSON.parse(await readFile(resolve(directory, "scrape-report.json"), "utf8"));
    const rows = outputRows({ rows: saved.filter((row: { jobId: string }) => row.jobId), report }, saved[0]?.company || "");
    await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2));
    await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows));
    for (const entry of entries) {
      if (entry.name.startsWith("MWH_Treatment_UK_Jobs_") && entry.name.endsWith(".csv")) {
        await writeFile(resolve(directory, entry.name), outputCsv(rows));
      }
    }
    if (entries.some(entry => entry.name === "code")) {
      for (const name of ["output.ts", "normalize.ts"]) {
        await copyFile(resolve(root, "src", name), resolve(directory, "code/src", name));
      }
    }
    count++;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !["_history", "_tracking", "node_modules", "code"].includes(entry.name)) {
      await refresh(resolve(directory, entry.name));
    }
  }
}
await refresh(resolve(root, "output"));
console.log(`Updated ${count} saved exports and their output/normalization code; historical archives and reports preserved.`);
