import { mkdir, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { AccessPolicy } from "../src/crawl.js";
import { extractJobs } from "../src/extract.js";
import { normalizeJobs } from "../src/normalize.js";

// Candidate URLs read from COMPANIE LIST.xlsx; the workbook remains unchanged.
const candidates = [
  { row: 6, company: "Thinking Schools Academy Trust", url: "https://careers.tsatrust.org.uk/vacancies/vacancy-search-results.aspx" },
  { row: 8, company: "Big Yellow Group", url: "https://careers.bigyellow.co.uk/apply/vacancies/vacancy-search-results.aspx" },
  { row: 12, company: "Intercity Technology", url: "https://intercitytechnologyweb.eploy.net/vacancies/vacancy-search-results.aspx" },
  { row: 16, company: "Sperry Marine", url: "https://www.careers.sperrymarine.com/vacancies/vacancy-search-results.aspx" },
  { row: 18, company: "Walkers", url: "https://careers.walkersshortbread.com/vacancies/vacancy-search-results.aspx" },
];
const checks = [];
for (const candidate of candidates) {
  const policy = new AccessPolicy(1000, 20_000);
  try {
    const origin = new URL(candidate.url).origin;
    const robots = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(20_000) });
    if (!robots.ok) throw new Error(`robots.txt HTTP ${robots.status}`);
    const robotsText = await robots.text();
    const sitemap = /^sitemap:\s*(\S+)/im.exec(robotsText)?.[1];
    if (!sitemap) throw new Error("No public sitemap declared in robots.txt.");
    const index = await policy.html(sitemap);
    let xml = load(index.body, { xmlMode: true });
    let jobSitemap = sitemap;
    if (xml("sitemapindex").length) {
      jobSitemap = xml("sitemap > loc").first().text();
      const document = await policy.html(jobSitemap);
      xml = load(document.body, { xmlMode: true });
    }
    const urls = xml("url > loc").map((_, node) => xml(node).text()).get();
    const page = await policy.html(candidate.url);
    const title = load(page.body)("title").text().replace(/\s+/g, " ").trim();
    const samples = [];
    for (const url of urls.slice(-2)) {
      const detail = await policy.html(url);
      const jobs = extractJobs(detail.body, detail.url, candidate.company);
      const normalized = normalizeJobs(jobs);
      samples.push({
        url, jobRecords: jobs.length, qualifyingRows: normalized.rows.length,
        dates: jobs.map(job => job.postedDate), companies: jobs.map(job => job.company),
        skipReasons: normalized.skipped.map(job => job.reason),
      });
    }
    checks.push({ ...candidate, status: "checked", sitemap, jobSitemap, title, jobUrls: urls.length, samples });
  } catch (error) {
    checks.push({ ...candidate, status: "blocked", reason: String(error) });
  }
  console.log(JSON.stringify(checks.at(-1), null, 2));
}
await mkdir("output/_tracking", { recursive: true });
await writeFile("output/_tracking/selection-checks-2026-09-15.json", JSON.stringify(checks, null, 2));
