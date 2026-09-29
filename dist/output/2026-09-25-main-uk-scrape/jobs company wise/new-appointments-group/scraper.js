"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const csv = __importStar(require("csv-writer"));
const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\new-appointments-group';
const BASE_URL = 'https://newappointmentsgroup.co.uk/search/all?showAllJobs=true';
const MAX_SCROLLS = 50;
const CUTOFF_DATE = new Date('2026-07-25');
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    // Try various date formats
    const formats = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
    ];
    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            if (format === formats[0]) {
                return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
            }
            else if (format === formats[1]) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            else {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthIndex = months.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
                return new Date(parseInt(match[3]), monthIndex, parseInt(match[1]));
            }
        }
    }
    return null;
}
function generateJobId(url, index) {
    const urlParts = url.split('/');
    const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    return `NAG-${index.toString().padStart(5, '0')}-${slug?.substring(0, 20) || 'job'}`;
}
async function scrollToLoadAll(page) {
    let previousHeight = 0;
    let scrollCount = 0;
    while (scrollCount < MAX_SCROLLS) {
        const currentHeight = await page.evaluate(() => {
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight);
        });
        if (currentHeight === previousHeight) {
            console.log(`No more content to load after ${scrollCount} scrolls`);
            break;
        }
        previousHeight = currentHeight;
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        // Wait for potential content to load
        await page.waitForTimeout(2000);
        scrollCount++;
        console.log(`Scroll ${scrollCount}/${MAX_SCROLLS} - Document height: ${currentHeight}`);
    }
}
async function getJobCardSelector(page) {
    const selectors = ['.job-item', '.vacancy-item', 'article.job', '.search-result'];
    for (const selector of selectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
            console.log(`Found ${count} jobs using selector: ${selector}`);
            return selector;
        }
    }
    throw new Error('No job cards found with any of the specified selectors');
}
async function extractJobsFromPage(page) {
    const selector = await getJobCardSelector(page);
    const jobs = await page.locator(selector).evaluateAll((elements) => {
        return elements.map((el) => {
            const link = el.querySelector('a');
            const title = el.querySelector('h2, h3, .job-title, .vacancy-title, a')?.textContent?.trim() || '';
            const jobUrl = link?.href || '';
            return {
                title,
                jobUrl
            };
        });
    });
    return jobs;
}
async function getJobDetails(page, jobUrl) {
    const detailPage = await page.context().newPage();
    try {
        await detailPage.goto(jobUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await detailPage.waitForTimeout(1000);
        const details = await detailPage.evaluate(() => {
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };
            const getAllText = (selectors) => {
                for (const selector of selectors) {
                    const text = getText(selector);
                    if (text)
                        return text;
                }
                return '';
            };
            // Get description
            const descriptionSelectors = [
                '.job-description', '.vacancy-description', '.description',
                'article', '.content', '.detail-content', '.job-details',
                '.description-content', '#description'
            ];
            const description = getAllText(descriptionSelectors);
            // Get salary
            const salarySelectors = [
                '.salary', '.job-salary', '.vacancy-salary', '[class*="salary"]',
                '.job-details .salary', '.detail-salary'
            ];
            const salaryRange = getAllText(salarySelectors);
            // Get location
            const locationSelectors = [
                '.location', '.job-location', '.vacancy-location',
                '[class*="location"]', '.job-details .location'
            ];
            const location = getAllText(locationSelectors);
            // Get employment type
            const employmentSelectors = [
                '.employment-type', '.job-type', '.vacancy-type',
                '.contract-type', '[class*="type"]'
            ];
            const employmentType = getAllText(employmentSelectors);
            // Get posted date
            const dateSelectors = [
                '.posted-date', '.date-posted', '.job-date',
                '[class*="date"]', '.job-details .date'
            ];
            const postedDate = getAllText(dateSelectors);
            return {
                description,
                salaryRange,
                location,
                employmentType,
                postedDate
            };
        });
        return details;
    }
    catch (error) {
        console.error(`Error fetching job details for ${jobUrl}:`, error.message);
        return {
            description: '',
            salaryRange: '',
            location: '',
            employmentType: '',
            postedDate: ''
        };
    }
    finally {
        await detailPage.close();
    }
}
function parseLocation(location) {
    const parts = location.split(',').map(p => p.trim()).filter(p => p);
    const city = parts[0] || '';
    const state = parts.length > 2 ? parts[parts.length - 2] : '';
    const country = parts.length > 1 ? parts[parts.length - 1] || 'UK' : 'UK';
    return { city, state, country };
}
async function main() {
    console.log('Starting New Appointments Group job scraper...');
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created output directory: ${OUTPUT_DIR}`);
    }
    const browser = await playwright_1.chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });
    const context = await browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    const errors = [];
    const jobs = [];
    try {
        console.log(`Navigating to ${BASE_URL}`);
        await page.goto(BASE_URL, { timeout: 60000, waitUntil: 'networkidle' });
        // Accept cookies if present
        try {
            const acceptButton = page.locator('button:has-text("Accept"), button:has-text("accept"), button:has-text("OK"), button:has-text("I agree")');
            if (await acceptButton.count() > 0) {
                await acceptButton.first().click();
                await page.waitForTimeout(1000);
            }
        }
        catch (e) {
            // Ignore cookie banner errors
        }
        console.log('Performing infinite scroll to load all jobs...');
        await scrollToLoadAll(page);
        console.log('Extracting job cards...');
        const basicJobs = await extractJobsFromPage(page);
        console.log(`Found ${basicJobs.length} job cards`);
        // Process each job
        for (let i = 0; i < basicJobs.length; i++) {
            const basicJob = basicJobs[i];
            console.log(`Processing job ${i + 1}/${basicJobs.length}: ${basicJob.title}`);
            try {
                if (!basicJob.jobUrl) {
                    console.warn(`Skipping job ${i + 1}: No URL found`);
                    continue;
                }
                // Get full details
                const details = await getJobDetails(page, basicJob.jobUrl);
                // Parse location
                const locationParts = parseLocation(details.location || '');
                // Generate job ID
                const jobId = generateJobId(basicJob.jobUrl, i + 1);
                // Parse and check cutoff date
                const parsedPostedDate = details.postedDate ? parseDate(details.postedDate) : null;
                if (parsedPostedDate && parsedPostedDate < CUTOFF_DATE) {
                    console.log(`Job ${jobId} posted before cutoff date (${details.postedDate}), skipping`);
                    continue;
                }
                const job = {
                    jobId,
                    title: basicJob.title || '',
                    description: details.description || '',
                    jobUrl: basicJob.jobUrl || '',
                    postedDate: parsedPostedDate ? formatDate(parsedPostedDate) : '',
                    jdDeadline: '',
                    company: 'New Appointments Group',
                    salaryRange: details.salaryRange || '',
                    employmentType: details.employmentType || '',
                    worktype: details.employmentType || '',
                    location: details.location || '',
                    city: locationParts.city,
                    state: locationParts.state,
                    country: locationParts.country,
                    ats: 'New Appointments Group'
                };
                jobs.push(job);
                // Add delay to avoid overwhelming the server
                await page.waitForTimeout(500);
            }
            catch (error) {
                const errorMsg = `Error processing job ${i + 1}: ${error.message}`;
                console.error(errorMsg);
                errors.push(errorMsg);
            }
        }
        // Write JSON output
        const jsonPath = path.join(OUTPUT_DIR, 'jobs.json');
        fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), 'utf-8');
        console.log(`Written ${jobs.length} jobs to ${jsonPath}`);
        // Write CSV output
        const csvPath = path.join(OUTPUT_DIR, 'jobs.csv');
        const csvWriter = csv.createObjectCsvWriter({
            path: csvPath,
            header: [
                { id: 'jobId', title: 'jobId' },
                { id: 'title', title: 'title' },
                { id: 'description', title: 'description' },
                { id: 'jobUrl', title: 'jobUrl' },
                { id: 'postedDate', title: 'postedDate' },
                { id: 'jdDeadline', title: 'jdDeadline' },
                { id: 'company', title: 'company' },
                { id: 'salaryRange', title: 'salaryRange' },
                { id: 'employmentType', title: 'employmentType' },
                { id: 'worktype', title: 'worktype' },
                { id: 'location', title: 'location' },
                { id: 'city', title: 'city' },
                { id: 'state', title: 'state' },
                { id: 'country', title: 'country' },
                { id: 'ats', title: 'ats' }
            ]
        });
        await csvWriter.writeRecords(jobs);
        console.log(`Written CSV to ${csvPath}`);
        // Print summary
        console.log('\n========== SCRAPING SUMMARY ==========');
        console.log(`Total jobs found: ${jobs.length}`);
        console.log(`Errors encountered: ${errors.length}`);
        if (jobs.length > 0) {
            console.log('\nSample of first 3 jobs:');
            jobs.slice(0, 3).forEach((job, idx) => {
                console.log(`${idx + 1}. JobId: ${job.jobId}, Title: ${job.title}, Location: ${job.location}`);
            });
        }
        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach(err => console.log(`- ${err}`));
        }
    }
    catch (error) {
        console.error('Fatal error:', error.message);
        errors.push(`Fatal error: ${error.message}`);
    }
    finally {
        await browser.close();
        console.log('Scraper finished');
    }
}
main().catch(console.error);
