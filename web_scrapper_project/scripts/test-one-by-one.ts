import { scrapeWebsite } from "../src/strategy.js";
import { outputRows } from "../src/output.js";

const target = process.argv[2] || "morgan-law";

const configs: Record<string, { name: string; url: string; options: any }> = {
  "laat": {
    name: "London Academy for Applied Technology",
    url: "https://laat.zohorecruit.eu/jobs/Careers",
    options: { mode: "auto" }
  },
  "louisvuitton": {
    name: "Louis Vuitton",
    url: "https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D",
    options: {
      mode: "auto",
      maxPages: 3000,
      delayMs: 1000,
      timeoutMs: 30000,
      selectors: {
        jobLinksOnly: "main > div.lv-career-job-list a[href*='/search-page/job/']"
      }
    }
  },
  "long-term-futures": {
    name: "Long Term Futures",
    url: "https://www.longtermfutures.co.uk/job-search/",
    options: {
      mode: "static",
      maxPages: 3000,
      delayMs: 1000,
      timeoutMs: 30000,
      selectors: {
        jobLinksOnly: ".global-jobsCard a[href*='/external_job/']",
        title: ".job-hero > h3",
        description: ".job-content .wysiwyg",
        postedDate: ".job-hero > p",
        location: ".job-hero > div > p",
        next: "a[href*='/job-search/page/']"
      }
    }
  },
  "morgan-law": {
    name: "Morgan Law",
    url: "https://www.morgan-law.com/jobs/",
    options: {
      mode: "auto",
      maxPages: 3000,
      delayMs: 1000,
      timeoutMs: 30000,
      selectors: {
        jobLinksOnly: "a[href*='/job/']"
      }
    }
  },
  "michaelpage": {
    name: "Michael Page Technology",
    url: "https://www.michaelpage.co.uk/jobs",
    options: {
      mode: "auto",
      maxPages: 1000,
      delayMs: 1000,
      timeoutMs: 30000
    }
  }
};

const config = configs[target];
if (!config) {
  console.error("Unknown target:", target);
  process.exit(1);
}

const start = Date.now();
const res = await scrapeWebsite(config.url, { ...config.options, company: config.name });
const rows = res.rows;
console.log(`Finished in ${(Date.now() - start) / 1000}s`);
console.log(`Status: ${res.report.status}`);
console.log(`Candidates: ${res.report.candidates}, Rows: ${rows.length}`);
console.log(`Pages Visited: ${res.report.pagesVisited}, Requests: ${res.report.requests}`);
console.log(`Issues: ${JSON.stringify(res.report.issues.slice(0, 5))}`);
console.log(`Skipped: ${res.report.skipped.length}`);
console.log(`Date Fallbacks: ${res.report.dateFallbacks.length}`);
if (rows.length > 0) {
  console.log(`Sample row 0:`, JSON.stringify(rows[0], null, 2));
}
