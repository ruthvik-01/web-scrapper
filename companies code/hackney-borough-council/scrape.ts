// Standalone Jev scraper entry for this company.
// Needs a TypeSafe Jev key in .env (see .env.example); without one it still
// scrapes deterministically, just with fewer semantic judgments.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./src/env.js";
import { scrape } from "./src/scraper.js";
loadEnv();
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = await scrape({
  url: "https://recruitment.hackney.gov.uk/job-search/",
  company: "Hackney Borough Council",
  out: resolve(directory, "output"),
  mode: "auto",
  maxPages: 250,
  concurrency: 8,
  delayMs: 600,
  confidence: 0.6,
  monthsBack: 2,
  timeoutMs: 30000,
  employers: ["Hackney Borough Council"],
  sitemapUrl: undefined,
});
