import { scrapeWebsite } from "../src/strategy.js";
import { outputRows } from "../src/output.js";

async function testCompany(name: string, url: string, options: any) {
  console.log(`\n================== TESTING ${name} ==================`);
  try {
    const result = await scrapeWebsite(url, { ...options, company: name });
    const rows = outputRows(result.rawJobs || result.rows);
    console.log(`Status: ${result.report.status}`);
    console.log(`Rows: ${rows.length}, Visited: ${result.report.pagesVisited}, Requests: ${result.report.requests}`);
    console.log(`Issues: ${result.report.issues.length}, Skipped: ${result.report.skipped.length}`);
    if (rows.length > 0) {
      console.log(`Sample row:`, JSON.stringify(rows[0], null, 2));
    }
  } catch (e: any) {
    console.error(`ERROR for ${name}:`, e.message, e.stack);
  }
}

async function run() {
  // 1. Louis Vuitton
  await testCompany("Louis Vuitton", "https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D", {
    mode: "auto",
    maxPages: 3000,
    delayMs: 1000,
    timeoutMs: 30000,
    selectors: {
      jobLinksOnly: "main > div.lv-career-job-list a[href*='/search-page/job/']",
    },
  });

  // 2. Morgan Law
  await testCompany("Morgan Law", "https://www.morgan-law.com/jobs/", {
    mode: "auto",
    maxPages: 3000,
    delayMs: 1000,
    timeoutMs: 30000,
    selectors: {
      jobLinksOnly: "a[href*='/job/']",
    },
  });

  // 3. Long Term Futures
  await testCompany("Long Term Futures", "https://www.longtermfutures.co.uk/job-search/", {
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
      next: "a[href*='/job-search/page/']",
    },
  });

  // 4. Michael Page Technology
  await testCompany("Michael Page Technology", "https://www.michaelpage.co.uk/jobs", {
    mode: "auto",
    maxPages: 3000,
    delayMs: 1000,
    timeoutMs: 30000,
  });
}

run().catch(console.error);
