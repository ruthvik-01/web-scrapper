"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const playwright_1 = require("playwright");
const CURRENT_DATE = new Date().toISOString().split('T')[0];
const COMPANY_LABEL = "SJC Partners";
const COMPANY_SLUG = "sjc-partners";
const SOURCE_URL = "https://sjcpartners.com/jobs/";
const ACTUAL_EMPLOYER = "SJC Partners";
// Cutoff date: 25-07-2026
const CUTOFF_DATE = new Date(2026, 6, 25); // Month is 0-indexed
/**
 * Format date to DD-MM-YYYY
 */
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}
/**
 * Parse date string to Date object
 */
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    // Try DD-MM-YYYY
    const ddmmyyyy = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (ddmmyyyy) {
        return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    }
    // Try YYYY-MM-DD
    const yyyymmdd = dateStr.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (yyyymmdd) {
        return new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    }
    // Try various text formats
    const textFormats = [
        /(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i
    ];
    for (const regex of textFormats) {
        const match = dateStr.match(regex);
        if (match) {
            const months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            let day, month, year;
            if (match[1].match(/^\d/)) {
                day = parseInt(match[1]);
                month = months.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
                year = parseInt(match[3]);
            }
            else {
                month = months.findIndex(m => m.toLowerCase() === match[1].toLowerCase());
                day = parseInt(match[2]);
                year = parseInt(match[3]);
            }
            if (month !== -1) {
                return new Date(year, month, day);
            }
        }
    }
    return null;
}
/**
 * Generate a unique job ID from URL or title
 */
function generateJobId(url, title) {
    // Try to extract ID from URL
    const urlMatch = url.match(/\/(\d+)\//);
    if (urlMatch)
        return urlMatch[1];
    // Try to find job ID in URL path
    const pathMatch = url.match(/\/job\/([^\/]+)/);
    if (pathMatch)
        return pathMatch[1];
    // Generate from title
    return title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}
/**
 * Extract salary information from text
 */
function extractSalary(text) {
    const salaryPatterns = [
        /£[\d,]+(?:\.\d+)?(?:\s*-\s*£[\d,]+(?:\.\d+)?)?(?:\s*(?:per\s+annum|pa|annually))?/gi,
        /\$[\d,]+(?:\.\d+)?(?:\s*-\s*\$[\d,]+(?:\.\d+)?)?(?:\s*(?:per\s+annum|pa|annually))?/gi,
        /[\d,]+(?:\.\d+)?\s*(?:k|K)\s*(?:GBP|USD|EUR)/gi,
        /(?:salary|salary range)[:\s]*([\w\s\d,.-]+)/i
    ];
    for (const pattern of salaryPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[0].trim();
        }
    }
    return "";
}
/**
 * Extract employment type from text
 */
function extractEmploymentType(text) {
    const types = {
        "Full-time": ["full-time", "fulltime", "full time", "permanent"],
        "Part-time": ["part-time", "parttime", "part time"],
        "Contract": ["contract", "contractor", "temporary", "temp"],
        "Freelance": ["freelance", "self-employed"],
        "Internship": ["internship", "intern", "placement"],
        "Remote": ["remote", "work from home", "wfh", "hybrid"]
    };
    const lowerText = text.toLowerCase();
    for (const [type, keywords] of Object.entries(types)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return type;
            }
        }
    }
    return "";
}
/**
 * Extract location components from text
 */
function extractLocation(text) {
    const result = {
        location: text.trim(),
        city: "",
        state: "",
        country: "United Kingdom"
    };
    // UK cities
    const cities = [
        "London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Bristol",
        "Sheffield", "Edinburgh", "Newcastle", "Nottingham", "Brighton", "Southampton",
        "Leicester", "Coventry", "Reading", "Belfast", "Cardiff", "Oxford", "Cambridge",
        "Bath", "York", "Norwich", "Plymouth", "Derby", "Preston", "Swindon", "Milton Keynes"
    ];
    const lowerText = text.toLowerCase();
    for (const city of cities) {
        if (lowerText.includes(city.toLowerCase())) {
            result.city = city;
            break;
        }
    }
    // Check for remote
    if (lowerText.includes("remote") || lowerText.includes("work from home")) {
        result.location = "Remote";
        result.city = "Remote";
    }
    return result;
}
/**
 * Scrape SJC Partners jobs page with pagination
 */
async function scrapeSJCPartners() {
    let browser = null;
    const jobs = [];
    try {
        console.log("Launching browser...");
        browser = await playwright_1.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        console.log(`Navigating to ${SOURCE_URL}...`);
        await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000);
        let pageNum = 1;
        let hasNextPage = true;
        let consecutiveFailures = 0;
        while (hasNextPage && pageNum <= 50) {
            console.log(`\nScraping page ${pageNum}...`);
            // Wait for job cards to load
            await page.waitForTimeout(2000);
            // Try different selectors for job cards
            const cardSelectors = ['.job-item', '.vacancy-item', 'article.job', '.job-listing', '.job-card', '[class*="job"]'];
            let jobCards = [];
            for (const selector of cardSelectors) {
                try {
                    jobCards = await page.$$(selector);
                    if (jobCards.length > 0) {
                        console.log(`Found ${jobCards.length} job cards using selector: ${selector}`);
                        break;
                    }
                }
                catch (e) {
                    // Continue to next selector
                }
            }
            // If no specific selectors found, try to find all links that might be jobs
            if (jobCards.length === 0) {
                console.log("Trying alternative method: scanning for job links...");
                // Find all links that look like job links
                const links = await page.$$('a[href*="/job"], a[href*="/vacancy"], a[href*="/career"], a[href*="/role"]');
                if (links.length > 0) {
                    for (const link of links) {
                        try {
                            const href = await link.getAttribute('href') || '';
                            const title = await link.textContent() || '';
                            if (href && title && title.trim().length > 5) {
                                const jobUrl = href.startsWith('http') ? href : new URL(href, SOURCE_URL).href;
                                // Skip if already scraped
                                if (jobs.some(j => j.jobUrl === jobUrl))
                                    continue;
                                const jobId = generateJobId(jobUrl, title);
                                const job = {
                                    jobId,
                                    title: title.trim(),
                                    description: "",
                                    jobUrl,
                                    postedDate: "",
                                    jdDeadline: "",
                                    company: COMPANY_LABEL,
                                    salaryRange: "",
                                    employmentType: "",
                                    worktype: "",
                                    location: "",
                                    city: "",
                                    state: "",
                                    country: "United Kingdom",
                                    ats: "SJC Partners"
                                };
                                jobs.push(job);
                            }
                        }
                        catch (e) {
                            console.log("Error extracting job link:", e);
                        }
                    }
                }
            }
            // Extract jobs from detected cards
            for (const card of jobCards) {
                try {
                    // Get title and URL
                    const linkElement = await card.$('a[href]') || card;
                    const href = await linkElement.getAttribute('href') || '';
                    const title = await (await card.$('h1, h2, h3, h4, .title, [class*="title"]'))?.textContent()
                        || await card.textContent()
                        || '';
                    if (!href || !title || title.trim().length < 3)
                        continue;
                    const jobUrl = href.startsWith('http') ? href : new URL(href, SOURCE_URL).href;
                    // Skip if already scraped
                    if (jobs.some(j => j.jobUrl === jobUrl))
                        continue;
                    const jobId = generateJobId(jobUrl, title);
                    // Try to get additional info
                    const location = await (await card.$('[class*="location"], .location'))?.textContent() || '';
                    const salary = await (await card.$('[class*="salary"], .salary'))?.textContent() || '';
                    const type = await (await card.$('[class*="type"], .type, [class*="employment"]'))?.textContent() || '';
                    const locationInfo = extractLocation(location);
                    const job = {
                        jobId,
                        title: title.trim(),
                        description: "",
                        jobUrl,
                        postedDate: "",
                        jdDeadline: "",
                        company: COMPANY_LABEL,
                        salaryRange: salary || "",
                        employmentType: type || extractEmploymentType(title + ' ' + location),
                        worktype: "",
                        location: locationInfo.location,
                        city: locationInfo.city,
                        state: locationInfo.state,
                        country: locationInfo.country,
                        ats: "SJC Partners"
                    };
                    jobs.push(job);
                    console.log(`  Found: ${job.title}`);
                }
                catch (e) {
                    console.log("Error extracting job card:", e);
                }
            }
            // Try to find and click next page
            let nextClicked = false;
            const nextSelectors = [
                'a.next', '.next a', '.pagination .next', '.pagination-next',
                'button:has-text("Next")', 'a:has-text("Next")', 'a:has-text(">")',
                '[aria-label="Next"]', '[aria-label="Go to next page"]', '.nav-next a',
                '.page-numbers.next', '.pagination li:last-child a', '.pager-next a'
            ];
            for (const selector of nextSelectors) {
                try {
                    const nextBtn = await page.$(selector);
                    if (nextBtn) {
                        const isVisible = await nextBtn.isVisible();
                        const isDisabled = await nextBtn.getAttribute('aria-disabled') || await nextBtn.getAttribute('disabled');
                        if (isVisible && isDisabled === null && isDisabled !== 'true') {
                            console.log(`Clicking next page using: ${selector}`);
                            await nextBtn.click();
                            await page.waitForTimeout(2000);
                            nextClicked = true;
                            consecutiveFailures = 0;
                            break;
                        }
                    }
                }
                catch (e) {
                    // Continue to next selector
                }
            }
            if (!nextClicked) {
                consecutiveFailures++;
                console.log("No next button found");
                if (consecutiveFailures >= 2 || jobCards.length === 0) {
                    hasNextPage = false;
                }
            }
            pageNum++;
        }
        console.log(`\nFound ${jobs.length} jobs. Fetching details...`);
        // Now fetch details for each job
        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            console.log(`\nFetching details for job ${i + 1}/${jobs.length}: ${job.title}`);
            try {
                await page.goto(job.jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(1500);
                // Get full page content for description
                const content = await page.content();
                // Extract description
                const descSelectors = [
                    '.job-description', '.description', '.vacancy-description',
                    'article', '.content', '.entry-content', '[class*="description"]', 'main'
                ];
                for (const selector of descSelectors) {
                    try {
                        const descElement = await page.$(selector);
                        if (descElement) {
                            const desc = await descElement.textContent();
                            if (desc && desc.trim().length > 50) {
                                job.description = desc.trim().replace(/\s+/g, ' ').substring(0, 5000);
                                break;
                            }
                        }
                    }
                    catch (e) {
                        // Continue to next selector
                    }
                }
                // Extract additional details if not already found
                if (!job.location) {
                    const locSelectors = ['.location', '[class*="location"]', '.job-location', '.vacancy-location'];
                    for (const selector of locSelectors) {
                        try {
                            const locElement = await page.$(selector);
                            if (locElement) {
                                const loc = await locElement.textContent();
                                if (loc) {
                                    const locInfo = extractLocation(loc);
                                    job.location = locInfo.location;
                                    job.city = locInfo.city;
                                    job.country = locInfo.country;
                                    break;
                                }
                            }
                        }
                        catch (e) {
                            // Continue
                        }
                    }
                }
                if (!job.salaryRange) {
                    const text = await page.textContent('body') || '';
                    job.salaryRange = extractSalary(text);
                }
                if (!job.employmentType) {
                    const text = await page.textContent('body') || '';
                    job.employmentType = extractEmploymentType(text);
                }
                // Extract posted date
                const dateSelectors = ['.date', '[class*="date"]', '.posted', '.posting-date', 'time'];
                for (const selector of dateSelectors) {
                    try {
                        const dateElement = await page.$(selector);
                        if (dateElement) {
                            const dateText = await dateElement.textContent();
                            const parsedDate = parseDate(dateText || '');
                            if (parsedDate) {
                                job.postedDate = formatDate(parsedDate);
                                break;
                            }
                        }
                    }
                    catch (e) {
                        // Continue
                    }
                }
            }
            catch (e) {
                console.log(`Error fetching details for ${job.jobUrl}:`, e);
            }
        }
        await browser.close();
        browser = null;
        // Filter by cutoff date
        const filteredJobs = jobs.filter(job => {
            if (!job.postedDate)
                return true;
            const postedDate = parseDate(job.postedDate);
            if (!postedDate)
                return true;
            return postedDate <= CUTOFF_DATE;
        });
        console.log(`\nAfter cutoff date filter (before ${formatDate(CUTOFF_DATE)}): ${filteredJobs.length} jobs`);
        return filteredJobs;
    }
    catch (error) {
        console.error("Scraper error:", error);
        if (browser) {
            await browser.close();
        }
        return jobs;
    }
}
/**
 * Convert jobs to CSV format with exact 15-column schema
 */
function jobsToCSV(jobs) {
    const header = "jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats";
    if (jobs.length === 0) {
        return header;
    }
    const rows = jobs.map(job => {
        const escapeCSV = (value) => {
            if (!value)
                return "";
            const escaped = value.replace(/\n/g, " ").replace(/\r/g, "").replace(/"/g, '""');
            return escaped.includes(",") || escaped.includes('"') ? `"${escaped}"` : escaped;
        };
        return [
            escapeCSV(job.jobId),
            escapeCSV(job.title),
            escapeCSV(job.description),
            escapeCSV(job.jobUrl),
            escapeCSV(job.postedDate),
            escapeCSV(job.jdDeadline),
            escapeCSV(job.company),
            escapeCSV(job.salaryRange),
            escapeCSV(job.employmentType),
            escapeCSV(job.worktype),
            escapeCSV(job.location),
            escapeCSV(job.city),
            escapeCSV(job.state),
            escapeCSV(job.country),
            escapeCSV(job.ats)
        ].join(",");
    });
    return [header, ...rows].join("\n");
}
/**
 * Main execution
 */
async function main() {
    const outputDir = process.env.OUTPUT_DIR ||
        (0, node_path_1.resolve)("D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise", COMPANY_SLUG);
    console.log(`Scraping ${COMPANY_LABEL}...`);
    console.log(`Source: ${SOURCE_URL}`);
    console.log(`Output: ${outputDir}`);
    // Run scraper
    const jobs = await scrapeSJCPartners();
    // Create output directory
    await (0, promises_1.mkdir)(outputDir, { recursive: true });
    // Write jobs.csv
    const csv = jobsToCSV(jobs);
    await (0, promises_1.writeFile)((0, node_path_1.resolve)(outputDir, "jobs.csv"), csv, "utf8");
    // Write jobs.json
    await (0, promises_1.writeFile)((0, node_path_1.resolve)(outputDir, "jobs.json"), JSON.stringify(jobs, null, 2), "utf8");
    console.log(`\n${"=".repeat(60)}`);
    console.log(`RESULTS`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Company: ${COMPANY_LABEL}`);
    console.log(`Jobs found: ${jobs.length}`);
    console.log(`Output directory: ${outputDir}`);
    if (jobs.length > 0) {
        console.log(`\nFirst 3 jobs:`);
        jobs.slice(0, 3).forEach((job, i) => {
            console.log(`  ${i + 1}. ${job.jobId} | ${job.title} | ${job.location || 'N/A'}`);
        });
    }
    console.log(`\nFiles created:`);
    console.log(`  - ${(0, node_path_1.resolve)(outputDir, "jobs.json")}`);
    console.log(`  - ${(0, node_path_1.resolve)(outputDir, "jobs.csv")}`);
}
main().catch(console.error);
