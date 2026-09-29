/**
 * End-to-end validation against a local fixture server with REAL Jev calls.
 * Serves a static careers page + two embedded-JobPosting vacancy pages (one UK,
 * one US) and runs the actual scraper, proving crawl -> Jev link triage ->
 * fetch -> JSON-LD extract -> Jev judge -> UK filter -> CSV. Not part of
 * `npm test` (which stays offline/deterministic); run on demand:
 *   npx tsx scripts/e2e-local.ts
 */
import { createServer, type Server } from "node:http";
import { loadEnv } from "../src/env.js";
import { scrape, type ScrapeConfig } from "../src/scraper.js";

const ukJob = {
  "@context": "https://schema.org", "@type": "JobPosting",
  title: "Support Worker",
  description: "<p>Support Worker needed in Manchester. You must already have the right to work in the UK; we cannot offer sponsorship. Full-time, permanent, hybrid role with two days on site. Salary £24,500 - £26,000 per annum.</p>",
  datePosted: "2026-09-10", validThrough: "2026-10-10",
  employmentType: "FULL_TIME",
  jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Manchester", addressRegion: "England", addressCountry: "United Kingdom" } },
  baseSalary: { "@type": "MonetaryAmount", currency: "GBP", value: { "@type": "QuantitativeValue", minValue: 24500, maxValue: 26000, unitText: "YEAR" } },
};
const usJob = {
  "@context": "https://schema.org", "@type": "JobPosting",
  title: "Account Executive",
  description: "<p>Account Executive based in New York, United States. Full-time.</p>",
  datePosted: "2026-09-12",
  jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "New York", addressRegion: "NY", addressCountry: "United States" } },
};

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const page = (title: string, inner: string) =>
  `<!doctype html><html><head><title>${title}</title>${inner}</head><body>${inner.includes("ld+json") ? "" : inner}</body></html>`;

const careers = `<!doctype html><html><head><title>Careers</title></head><body>
  <nav><a href="/about">About us</a><a href="/contact">Contact</a></nav>
  <a href="/jobs/support-worker">Support Worker - Manchester</a>
  <a href="/jobs/account-executive">Account Executive - New York</a>
  <a href="/privacy">Privacy policy</a>
</body></html>`;

function start(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    res.setHeader("Content-Type", "text/html");
    if (path === "/robots.txt") res.end("User-agent: *\nAllow: /\n");
    else if (path === "/careers") res.end(careers);
    else if (path === "/jobs/support-worker") res.end(page("Support Worker", ld(ukJob)));
    else if (path === "/jobs/account-executive") res.end(page("Account Executive", ld(usJob)));
    else if (path === "/about" || path === "/contact" || path === "/privacy") res.end(page("Info", "<p>text</p>"));
    else { res.statusCode = 404; res.end("not found"); }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    resolve({ server, base: `http://127.0.0.1:${port}` });
  }));
}

const { server, base } = await start();
loadEnv();
const config: ScrapeConfig = {
  url: `${base}/careers`, company: "FixtureCo", out: "runs/e2e-local",
  mode: "auto", maxPages: 20, concurrency: 4, delayMs: 0, confidence: 0.6,
  monthsBack: 2, timeoutMs: 20_000,
};
try {
  console.log(`e2e against local fixture at ${base} (real Jev)`);
  const { rows, skipped } = await scrape(config);
  console.log("\n=== ROWS ===");
  console.log(JSON.stringify(rows, null, 2));
  console.log("=== SKIPPED ===");
  console.log(JSON.stringify(skipped, null, 2));
  const ok =
    rows.length === 1 && rows[0]!.title === "Support Worker" && rows[0]!.country === "UK" &&
    rows[0]!.salaryRange === "£24500-£26000" &&
    skipped.some(s => /account-executive/.test(s.jobUrl));
  console.log(ok ? "\nE2E PASS: UK job kept, US job filtered, salary normalised." : "\nE2E CHECK: inspect output above.");
  process.exitCode = ok ? 0 : 1;
} finally {
  server.close();
}
