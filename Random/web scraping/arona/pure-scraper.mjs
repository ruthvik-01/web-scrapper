
import { chromium } from "playwright";

// Configuration
const CONFIG = {
  baseUrl: "https://arona-home-essentials.hiringthing.com/",
  company: "Arona Home Essentials",
  ats: "HiringThing",
  filterDays: 30
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * PHASE 1: DISCOVER JOBS FROM LISTING PAGE
 */
async function discoverJobs(page) {
  console.log("\n[Phase 1] Discovering jobs from listing page...");

  const jobs = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Find all job headings
    document.querySelectorAll('h2').forEach(heading => {
      const title = heading.textContent?.trim();

      // Skip page title
      if (!title || title === "Career Opportunities") return;

      // Get link containing the heading
      const link = heading.closest('a') ||
        heading.parentElement?.querySelector('a');

      if (!link) return;

      const href = link.getAttribute('href');

      // Extract job ID from URL pattern: /job/123456/title
      const match = href?.match(/\/job\/(\d+)/);
      const jobId = match ? match[1] : null;

      // Find location from nearby elements
      let location = "";
      let salary = "";
      let parent = heading.parentElement?.parentElement;

      // Search up to 3 parent levels for location
      for (let i = 0; i < 3 && parent; i++) {
        const text = parent.innerText || "";

        text.split('\n').forEach(line => {
          const trimmed = line.trim();

          // Location pattern: "CITY, ST"
          if (trimmed.match(/^[A-Z][A-Za-z\s]+,\s*[A-Z]{2}$/)) {
            if (!location) location = trimmed;
          }

          // Salary pattern with $ and numbers
          if (trimmed.includes('$') && trimmed.match(/\d+/)) {
            if (!salary) salary = trimmed;
          }
        });

        parent = parent.parentElement;
      }

      // Build full URL
      const fullUrl = href?.startsWith('http') ? href :
        `https://arona-home-essentials.hiringthing.com${href}`;

      // Deduplicate
      const key = `${jobId}-${location}`;
      if (!seen.has(key) && title && location) {
        seen.add(key);
        results.push({ jobId, title, location, salary, url: fullUrl });
      }
    });

    return results;
  });

  console.log(`✅ Phase 1 Complete: Found ${jobs.length} jobs`);
  return jobs;
}

/**
 * PHASE 2: EXTRACT DETAILS FROM INDIVIDUAL JOB PAGE
 */
async function extractJobDetails(job, browser) {
  const page = await browser.newPage();

  const details = {
    description: "",
    postedDate: null,
    employmentType: null,
    worktype: null
  };

  try {
    // Load detail page
    await page.goto(job.url, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    // Extract JSON-LD schema (structured data)
    const jsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');

      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);

          // Look for JobPosting schema
          if (data["@type"] === "JobPosting") {
            return {
              // ISO 8601 date format: "2026-07-14T10:55:58-05:00"
              posted: data.datePosted,

              // HTML description
              desc: data.description,

              // e.g., "FULL_TIME", "PART_TIME"
              empType: data.employmentType
            };
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }

      return null;
    });

    // Process schema data
    if (jsonLd) {
      // Convert ISO date to YYYY-MM-DD
      if (jsonLd.posted) {
        const date = new Date(jsonLd.posted);
        details.postedDate = date.toISOString().split('T')[0];
      }

      // Clean HTML from description
      if (jsonLd.desc) {
        details.description = jsonLd.desc
          .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
          .replace(/\s+/g, ' ')       // Normalize whitespace
          .trim();
      }

      // Normalize employment type
      if (jsonLd.empType) {
        const emp = jsonLd.empType.toLowerCase();
        if (emp.includes('full')) details.employmentType = "FULL_TIME";
        else if (emp.includes('part')) details.employmentType = "PART_TIME";
        else if (emp.includes('contract')) details.employmentType = "CONTRACTOR";
      }
    }

    // Fallback: Extract employment type from page text
    if (!details.employmentType) {
      const pageText = await page.evaluate(() =>
        document.body.innerText.toLowerCase()
      );

      if (pageText.includes('full-time') || pageText.includes('full time')) {
        details.employmentType = "FULL_TIME";
      } else if (pageText.includes('part-time') || pageText.includes('part time')) {
        details.employmentType = "PART_TIME";
      }
    }

    // Worktype - evidence-based ONLY
    const pageText = await page.evaluate(() =>
      document.body.innerText.toLowerCase()
    );

    if (pageText.includes('remote') || pageText.includes('work from home')) {
      details.worktype = "remote";
    } else if (pageText.includes('hybrid')) {
      details.worktype = "hybrid";
    } else if (pageText.includes('on-site') || pageText.includes('onsite')) {
      details.worktype = "onsite";
    }
    // Note: "Delivery", "Field work" alone do NOT mean remote/onsite

    await page.close();

    // Parse location
    let city = null, state = null;
    if (job.location) {
      const parts = job.location.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1];
      }
    }

    // Build final job object
    return {
      jobId: job.jobId,
      title: job.title,
      description: details.description || "See job URL",
      jobUrl: job.url,
      postedDate: details.postedDate,
      jdDeadline: null,  // Not commonly provided
      company: CONFIG.company,
      salaryRange: job.salary || null,
      employmentType: details.employmentType,
      worktype: details.worktype,
      location: job.location,
      city,
      state,
      country: state === 'PR' ? 'Puerto Rico' : 'United States',
      ats: CONFIG.ats
    };

  } catch (err) {
    console.error(`❌ Error extracting ${job.url}: ${err.message}`);
    await page.close().catch(() => { });
    return null;
  }
}

/**
 * PHASE 3: FILTERING RULES
 * 
 * Rule 1: If postedDate exists → Keep last N days only
 * Rule 2: If postedDate is NULL → Keep Mexico/PR only
 */
function applyFilters(jobs, days) {
  console.log(`\n[Phase 3] Applying filters (last ${days} days)...`);

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filtered = [];

  for (const job of jobs) {
    // Check if job has a real posted date
    const hasRealDate = job.postedDate && job.postedDate !== new Date().toISOString().split('T')[0];

    if (hasRealDate) {
      // === RULE 1: Has date → Filter by date ===
      const posted = new Date(job.postedDate);
      if (posted >= cutoff) {
        filtered.push(job);
      }
    } else {
      // === RULE 2: No date → Filter by location (Mexico/PR only) ===
      const loc = (job.location || '').toLowerCase();
      const state = (job.state || '').toLowerCase();

      // Puerto Rico check
      const isPR = state === 'pr' || loc.includes('puerto rico');

      // Mexico check (but NOT New Mexico)
      const isMexico = loc.includes('mexico') &&
        !loc.includes('new mexico');

      if (isPR || isMexico) {
        filtered.push(job);
      }
    }
  }

  console.log(`✅ Phase 3 Complete: ${filtered.length} jobs after filtering`);
  return filtered;
}

/**
 * DEDUPLICATE BY URL
 */
function deduplicate(jobs) {
  const unique = [];
  const seenUrls = new Set();

  jobs.forEach(job => {
    if (!seenUrls.has(job.jobUrl)) {
      seenUrls.add(job.jobUrl);
      unique.push(job);
    }
  });

  return unique;
}

/**
 * MAIN FUNCTION
 */
async function scrapeJobs() {
  console.log("=".repeat(70));
  console.log("PURE WEB SCRAPING - NO OUTPUT FILES");
  console.log("=".repeat(70));
  console.log(`\nTarget: ${CONFIG.company}`);
  console.log(`ATS: ${CONFIG.ats}`);
  console.log("=".repeat(70) + "\n");

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  });

  // Phase 1: Discovery
  await page.goto(CONFIG.baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(3000);

  const listings = await discoverJobs(page);
  await page.close();

  // Phase 2: Detail Extraction
  const details = [];

  for (let i = 0; i < listings.length; i++) {
    console.log(`[Detail ${i + 1}/${listings.length}] ${listings[i].title}`);

    const detail = await extractJobDetails(listings[i], browser);
    if (detail) {
      details.push(detail);
      console.log(`  ✅ Posted: ${detail.postedDate || 'N/A'}`);
      console.log(`  ✅ Description: ${detail.description.length} chars`);
      if (detail.employmentType) {
        console.log(`  ✅ Type: ${detail.employmentType}`);
      }
    }

    // Rate limiting
    if (i < listings.length - 1) {
      await sleep(3000);
    }
  }

  await browser.close();

  // Phase 3: Filtering
  const filtered = applyFilters(details, CONFIG.filterDays);

  // Deduplicate
  const unique = deduplicate(filtered);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("SCRAPING COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nTotal jobs scraped: ${unique.length}`);

  // By state
  const byState = {};
  unique.forEach(j => {
    byState[j.state] = (byState[j.state] || 0) + 1;
  });

  console.log("\nJobs by State:");
  Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, c]) => {
      console.log(`  ${s}: ${c}`);
    });

  // Return data for further processing
  return unique;
}

// Run
scrapeJobs().then(jobs => {
  console.log("\n✅ Ready for export to Excel/CSV/JSON");
  console.log(`Total: ${jobs.length} jobs`);
  // Add your export logic here
}).catch(console.error);

/**
 * ATS IDENTIFICATION HELPER
 */
function identifyATS(url) {
  const patterns = {
    'hiringthing.com': 'HiringThing',
    'acquiretm.com': 'AcquireTM',
    'greenhouse.io': 'Greenhouse',
    'lever.co': 'Lever',
    'workday.com': 'Workday',
    'icims.com': 'iCIMS'
  };

  for (const [domain, ats] of Object.entries(patterns)) {
    if (url.includes(domain)) return ats;
  }
  return 'Unknown';
}

