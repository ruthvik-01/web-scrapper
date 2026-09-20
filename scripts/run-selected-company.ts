import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrapeJobSitemap } from "../src/sitemap.js";
import { outputRows } from "../src/output.js";

// Company and careers URL read from COMPANIE LIST.xlsx, Sheet1 row 2.
// The sitemap URL was discovered from the careers site's robots.txt.
const company = "MWH Treatment";
const result = await scrapeJobSitemap(
  "https://careers.mwhtreatment.com/vacancies/vacancy-search-results.aspx",
  "https://careers.mwhtreatment.com/sitemap.xml",
  { company, maxPages: 250, delayMs: 1000 },
);
const directory = resolve("output/mwh-treatment");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "scrape-result.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(outputRows(result, company), null, 2) + "\n");
console.log(JSON.stringify({ ...result.report, skipped: result.report.skipped.length, issues: result.report.issues }, null, 2));
