import { loadEnv } from "./env.js";
import { scrape, type ScrapeConfig } from "./scraper.js";

function arg(name: string, fallback = ""): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function args(name: string): string[] {
  return process.argv
    .map((value, index) => (value === `--${name}` ? process.argv[index + 1] : ""))
    .filter((value): value is string => Boolean(value));
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.argv[2] && !process.argv[2]!.startsWith("--") ? process.argv[2]! : arg("url");
  if (!url) {
    console.error("Usage: npm run scrape -- <careers-url> [--company Name] [--out output/dir] [--mode auto|schema|crawl|sitemap]");
    console.error("Options: --max-pages 100 --concurrency 6 --delay-ms 800 --confidence 0.6 --timeout-ms 30000");
    console.error("         --employer \"Compass Schools\" (repeatable) --sitemap-url <url>");
    process.exit(2);
  }
  const company = arg("company", new URL(url).hostname.replace(/^www\./, ""));
  const out = arg("out", `runs/${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`);
  const employers = args("employer");
  const sitemapUrl = arg("sitemap-url");
  const config: ScrapeConfig = {
    url, company, out,
    mode: (arg("mode", "auto") as ScrapeConfig["mode"]),
    maxPages: Number(arg("max-pages", "100")),
    concurrency: Number(arg("concurrency", "6")),
    delayMs: Number(arg("delay-ms", "800")),
    confidence: Number(arg("confidence", "0.6")),
    monthsBack: Number(arg("months-back", "2")),
    timeoutMs: Number(arg("timeout-ms", "30000")),
    ...(employers.length ? { employers } : {}),
    ...(sitemapUrl ? { sitemapUrl } : {}),
  };
  console.log(`[${config.company}] scraping ${config.url} (mode=${config.mode}, confidence=${config.confidence})`);
  await scrape(config);
  console.log(`Outputs in ${out}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
