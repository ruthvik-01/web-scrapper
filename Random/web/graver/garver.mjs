import { chromium } from "playwright";
import fs from "fs";

/* ================= CONSTANTS ================= */
const LISTING_URL = "https://garverusa.com/careers/job-listings";
const COMPANY = "Garver";
const COUNTRY = "USA";
const ATS = "Custom"; // Changed from "Garver Careers" to "Custom"

const OUTPUT_FILE = "garver_jobs.json";
const JS_OUTPUT_FILE = "garver_jobs.js";
const EXCEL_OUTPUT_FILE = "garver_jobs.csv";
const DETAIL_CONCURRENCY = 3;

// One month ago filter
const ONE_MONTH_AGO = new Date();
ONE_MONTH_AGO.setMonth(ONE_MONTH_AGO.getMonth() - 1);

/* ================= HELPERS ================= */
function cleanText(str) {
  if (!str) return str;
  // Remove common headers and footers, newlines, tabs, extra spaces
  let cleaned = str
    .replace(/^\s*Careers\s*/i, "")
    .replace(/\s*Apply Now!\s*Get in Touch\s*$/i, "")
    .replace(/\s*Apply Now\s*$/i, "")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ");
  return cleaned.replace(/[^\w\s.,;:()[\]{}\-/$%&*@+!?]/g, "").trim();
}

function parseLocationFromUrl(url) {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter((p) => p);
    if (pathParts.length >= 5) {
      let state = decodeURIComponent(pathParts[3]);
      let city = decodeURIComponent(pathParts[4]);
      if (state.toLowerCase() === "none") state = null;
      if (city.toLowerCase() === "none") city = null;
      return { city, state };
    }
  } catch (e) {
    /* ignore */
  }
  return { city: null, state: null };
}

function extractJobIdFromUrl(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get("gni");
  } catch (e) {
    return null;
  }
}

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getDefaultPostedDate() {
  // Return today's date if not given
  return new Date().toISOString().slice(0, 10);
}

/* ================= SCRAPE LISTING PAGE ================= */
async function scrapeListingPage(page) {
  return page.$$eval("table#jobsTable tbody tr", (rows) => {
    return rows
      .map((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return null;

        const link = cells[0]?.querySelector("a");
        if (!link) return null;

        const title = link.textContent?.trim() || null;
        const href = link.href || null;
        const cityRaw = cells[1]?.textContent?.trim() || null;
        const stateRaw = cells[2]?.textContent?.trim() || null;
        const market = cells[3]?.textContent?.trim() || null;

        return {
          title,
          jobUrl: href,
          cityRaw,
          stateRaw,
          market,
        };
      })
      .filter(Boolean);
  });
}

/* ================= SCRAPE JOB DETAIL PAGE ================= */
async function scrapeJobDetailWithRetry(page, url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(500);
      return await scrapeJobDetailExtract(page);
    } catch (e) {
      if (i === retries) throw e;
      console.warn(`  [Retry ${i + 1}] ${url}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

async function scrapeJobDetailExtract(page) {
  return page.evaluate(() => {
    // Try multiple selectors for description
    const descSelectors = [
      ".articleBody",
      "#jobOpening",
      ".job-description",
      "[class*='job-description']",
      "[class*='jobDescription']",
      ".job-detail",
      ".jobdetails",
      "article",
    ];

    let description = null;
    let bestEl = null;
    let maxLen = 0;

    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || "";
        if (text.length > maxLen) {
          maxLen = text.length;
          bestEl = el;
          description = text;
        }
      }
    }

    // Look for dates in page text
    const pageText = document.body.textContent || "";
    const postedMatch = pageText.match(/posted\s*:?\s*([\d/.\-]+)/i);
    const deadlineMatch = pageText.match(/deadline|closing|apply by\s*:?\s*([\d/.\-]+)/i);

    // Look for employment type
    const empTypeMatch = pageText.match(/(Full-Time|Part-Time|Full Time|Part Time|Contract|Temporary)/i);
    const worktypeMatch = pageText.match(/(Remote|Hybrid|On-site|Onsite)/i);

    // Look for salary - require $ prefix to avoid matching years like "1919"
    const salaryMatch = pageText.match(/\$\d{2,3}[k,]?\d*\s*[-–to]+\s*\$?\d{2,3}[k,]?\d*/i);

    return {
      description: description && description.length > 100 ? description : null,
      postedDate: postedMatch?.[1] || null,
      deadline: deadlineMatch?.[1] || null,
      employmentType: empTypeMatch?.[1] || null,
      worktype: worktypeMatch?.[1] || null,
      salaryRange: salaryMatch?.[0] || null,
    };
  });
}

async function scrapeJobDetail(page, url) {
  try {
    return await scrapeJobDetailWithRetry(page, url);
  } catch (e) {
    console.warn(`  [Detail Error] ${url}: ${e.message}`);
    return {
      description: null,
      postedDate: null,
      deadline: null,
      employmentType: null,
      worktype: null,
      salaryRange: null,
    };
  }
}

/* ================= MAIN ================= */
(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log(`[Opening] ${LISTING_URL}`);
    await page.goto(LISTING_URL, { waitUntil: "networkidle" });

    const listingJobs = await scrapeListingPage(page);
    console.log(`[Found] ${listingJobs.length} job rows`);

    // Filter out valid jobs
    const validJobs = listingJobs.filter((j) => j.jobUrl && j.title);
    console.log(`[Valid] ${validJobs.length} jobs with URLs`);

    // Deduplicate by job URL
    const seen = new Set();
    const uniqueJobs = [];
    for (const job of validJobs) {
      const jobId = extractJobIdFromUrl(job.jobUrl);
      if (jobId && !seen.has(jobId)) {
        seen.add(jobId);
        uniqueJobs.push({ ...job, jobId });
      } else if (!jobId) {
        uniqueJobs.push({ ...job, jobId: null });
      }
    }
    console.log(`[Unique] ${uniqueJobs.length} jobs (by job ID)`);

    // Enrich with detail pages
    const detailPage = await browser.newPage();
    const enrichedJobs = [];

    for (let i = 0; i < uniqueJobs.length; i++) {
      const job = uniqueJobs[i];
      console.log(`  [Detail ${i + 1}/${uniqueJobs.length}] ${job.title}`);
      const detail = await scrapeJobDetail(detailPage, job.jobUrl);
      enrichedJobs.push({ ...job, detail });
      await new Promise((r) => setTimeout(r, 200));
    }

    await detailPage.close();
    await browser.close();

    // Shape to target schema
    const records = enrichedJobs.map((job) => {
      const locFromUrl = parseLocationFromUrl(job.jobUrl);

      // Prefer state/city from table if available, fallback to URL
      let city = job.cityRaw || locFromUrl.city;
      let state = job.stateRaw || locFromUrl.state;

      // Handle REMOTE case
      const isRemote =
        (job.cityRaw?.toLowerCase() === "remote") ||
        (job.title?.toLowerCase().includes("remote"));

      if (isRemote && !city) {
        city = "REMOTE";
      }

      const location = [city, state, COUNTRY].filter(Boolean).join(", ");

      // Clean description
      const description = cleanText(job.detail?.description) || null;

      // Posted date: use extracted or default to today
      let postedDate = job.detail?.postedDate;
      if (postedDate) {
        const d = new Date(postedDate);
        if (!isNaN(d.getTime())) {
          postedDate = d.toISOString().slice(0, 10);
        }
      } else {
        postedDate = getDefaultPostedDate();
      }

      return {
        jobId: job.jobId,
        title: job.title,
        description: description,
        jobUrl: job.jobUrl,
        postedDate: postedDate,
        jdDeadline: job.detail?.deadline || null,
        company: COMPANY,
        salaryRange: job.detail?.salaryRange || null,
        employmentType: job.detail?.employmentType || null,
        worktype: job.detail?.worktype || (isRemote ? "Remote" : null),
        location: location,
        city: city,
        state: state,
        country: COUNTRY,
        ats: ATS,
      };
    });

    // Filter to one month ago only
    const oneMonthAgoJobs = records.filter((job) => {
      const jobDate = new Date(job.postedDate);
      return jobDate >= ONE_MONTH_AGO;
    });
    console.log(`[Filtered to 1 month ago] ${oneMonthAgoJobs.length} jobs`);

    // Validation
    const errors = [];
    const jobIds = new Set();
    const urls = new Set();

    for (const job of oneMonthAgoJobs) {
      if (!job.jobId) errors.push(`Missing jobId for ${job.title}`);
      if (!job.title) errors.push(`Missing title`);
      if (!job.jobUrl) errors.push(`Missing URL for ${job.jobId}`);
      if (jobIds.has(job.jobId)) errors.push(`Duplicate jobId: ${job.jobId}`);
      if (urls.has(job.jobUrl)) errors.push(`Duplicate URL: ${job.jobUrl}`);
      if (job.jobUrl && !job.jobUrl.includes("garverusa.com")) {
        errors.push(`Invalid URL for ${job.jobId}: ${job.jobUrl}`);
      }

      jobIds.add(job.jobId);
      urls.add(job.jobUrl);
    }

    if (errors.length > 0) {
      console.warn("\n[Validation Warnings]");
      errors.slice(0, 10).forEach((e) => console.warn(`  - ${e}`));
      if (errors.length > 10) console.warn(`  ... and ${errors.length - 10} more`);
    }

    // Save JSON output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(oneMonthAgoJobs, null, 2));
    console.log(`\n[Saved JSON] ${OUTPUT_FILE} (${oneMonthAgoJobs.length} records)`);

    // Save JS module output
    const jsContent = `// Garver Jobs - Generated: ${new Date().toISOString()}\n` +
      `// Total jobs: ${oneMonthAgoJobs.length}\n` +
      `// Filtered to last 30 days\n\n` +
      `export const jobs = ${JSON.stringify(oneMonthAgoJobs, null, 2)};\n\n` +
      `export default jobs;\n\n` +
      `export function getJobsByCity(city) {\n` +
      `  return jobs.filter(j => j.city?.toLowerCase() === city?.toLowerCase());\n}\n\n` +
      `export function getJobsByState(state) {\n` +
      `  return jobs.filter(j => j.state?.toLowerCase() === state?.toLowerCase());\n}\n\n` +
      `export function getJobsByTitle(titlePattern) {\n` +
      `  return jobs.filter(j => j.title?.toLowerCase().includes(titlePattern?.toLowerCase()));\n}\n`;
    fs.writeFileSync(JS_OUTPUT_FILE, jsContent);
    console.log(`[Saved JS Module] ${JS_OUTPUT_FILE}`);

    // Save Excel/CSV output
    const headers = [
      "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
      "company", "salaryRange", "employmentType", "worktype", "location",
      "city", "state", "country", "ats"
    ];
    const csvRows = oneMonthAgoJobs.map(job => {
      return headers.map(h => {
        const val = job[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "string" && val.includes(",")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(",");
    });
    const csvContent = [headers.join(","), ...csvRows].join("\n");
    fs.writeFileSync(EXCEL_OUTPUT_FILE, csvContent);
    console.log(`[Saved CSV] ${EXCEL_OUTPUT_FILE}`);

    // Summary
    console.log("\n========== SUMMARY ==========");
    console.log(`Total unique jobs scraped: ${records.length}`);
    console.log(`Jobs from last 30 days: ${oneMonthAgoJobs.length}`);
    console.log(`ATS: ${ATS}`);
    console.log(`Jobs with descriptions: ${oneMonthAgoJobs.filter((j) => j.description).length}`);
    console.log(`Jobs with dates (defaulted to today): ${oneMonthAgoJobs.filter((j) => j.postedDate).length}`);
    console.log("=============================");

  } catch (err) {
    console.error("[Failed]", err);
    process.exitCode = 1;
  }
})();
