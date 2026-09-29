import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { ScrapeOptions } from "./src/crawl.js";
import { object } from "./src/normalize.js";
import { scrapeWebsite } from "./src/strategy.js";
import { outputCsv, outputRows } from "./src/output.js";
import type { Selectors } from "./src/extract.js";

export { scrapeCompany } from "./src/crawl.js";
export { scrapeJobSitemap } from "./src/sitemap.js";
export { scrapeWebsite } from "./src/strategy.js";
export { COLUMNS, normalizeJobs } from "./src/normalize.js";
export type { JobRow, RawJob } from "./src/normalize.js";

const help = `
UK company job scraper — one company URL per run

  npm run scrape -- "https://company.example/careers" --company "Company"

Options:
  --company NAME         Fallback company name when the website omits it
  --out DIR              Output directory (default: output)
  --max-pages N          Browser/API request budget (default: 100)
  --browser NAME         chromium (default), chrome, or msedge
  --delay-ms N           Minimum navigation/API delay (default: 1000)
  --render-wait-ms N     Wait after render/pagination (default: 1500)
  --timeout-ms N         Page/API timeout (default: 30000)
  --selectors FILE       JSON CSS selectors for an unsupported website
  --sitemap URL          Read an explicit public job sitemap using STATIC extraction
  --mode NAME            auto (default), api, static, or dom
  --api-url URL          Public schema.org JobPosting JSON endpoint
  --help                 Show this help

Outputs: unique *.json, *.csv, and *.report.json files for each run.
15 job columns; ats is Custom. Missing values are empty.
UK locations and an inclusive rolling two-calendar-month posting window only.
Missing posting dates use the current UK run date and are recorded in the report.
Present but invalid/ambiguous dates and unconfirmed UK countries are excluded.
Exit codes: 0 finished; 1 fatal error; 2 partial/unsupported extraction.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      company: { type: "string" }, out: { type: "string" }, browser: { type: "string" },
      "max-pages": { type: "string" }, "delay-ms": { type: "string" },
      "render-wait-ms": { type: "string" }, "timeout-ms": { type: "string" },
      selectors: { type: "string" }, sitemap: { type: "string" }, mode: { type: "string" }, "api-url": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) { console.log(help); return; }
  if (positionals.length !== 1) throw new Error(`Pass exactly one company URL.\n${help}`);
  if (values.browser && !["chromium", "chrome", "msedge"].includes(values.browser)) {
    throw new Error("--browser must be chromium, chrome, or msedge.");
  }
  if (values.mode && !["auto", "api", "static", "dom"].includes(values.mode)) throw new Error("--mode must be auto, api, static, or dom.");
  const options: ScrapeOptions = {
    company: values.company,
    browser: values.browser as ScrapeOptions["browser"],
    mode: values.mode as ScrapeOptions["mode"], apiUrl: values["api-url"], sitemapUrl: values.sitemap,
  };
  for (const [flag, field] of [
    ["max-pages", "maxPages"], ["delay-ms", "delayMs"],
    ["render-wait-ms", "renderWaitMs"], ["timeout-ms", "timeoutMs"],
  ] as const) {
    if (values[flag] !== undefined) options[field] = Number(values[flag]);
  }
  if (values.selectors) {
    const parsed: unknown = JSON.parse(await readFile(resolve(values.selectors), "utf8"));
    const selectors = object(parsed);
    if (!Object.keys(selectors).length || Object.values(selectors).some(value => typeof value !== "string")) {
      throw new Error("Selectors file must be a nonempty JSON object of CSS selector strings.");
    }
    options.selectors = selectors as Selectors;
  }
  const url = positionals[0]!;
  const result = await scrapeWebsite(url, options);
  const exportedRows = outputRows(result, values.company);
  const directory = resolve(values.out || "output");
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stem = resolve(directory, `${new URL(url).hostname}-${timestamp}`);
  await writeFile(`${stem}.json`, JSON.stringify(exportedRows, null, 2) + "\n", { flag: "wx" });
  await writeFile(`${stem}.csv`, outputCsv(exportedRows), { flag: "wx" });
  await writeFile(`${stem}.report.json`, JSON.stringify(result.report, null, 2) + "\n", { flag: "wx" });
  console.log(`${result.rows.length} UK location rows | ${result.report.status} | ${result.report.window.from} through ${result.report.window.to}`);
  console.log(`JSON: ${stem}.json\nCSV: ${stem}.csv\nReport: ${stem}.report.json`);
  if (result.report.status === "partial" || result.report.status === "unsupported") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
