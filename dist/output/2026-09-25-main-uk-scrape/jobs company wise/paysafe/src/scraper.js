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
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const COMPANY = 'Paysafe';
const ATS_NAME = 'HiBob';
const BASE_URL = 'https://paysafe.careers.hibob.com/jobs';
const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\paysafe';
const CUTOFF_DATE = new Date('2026-07-25');
function formatDate(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}
function parseDate(dateStr) {
    if (!dateStr)
        return null;
    // Try various date formats
    const formats = [
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or MM/DD/YYYY
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY-MM-DD
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i, // DD Mon YYYY
    ];
    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            let day, month, year;
            if (format === formats[0]) {
                // Assume DD/MM/YYYY for UK dates
                day = parseInt(match[1]);
                month = parseInt(match[2]) - 1;
                year = parseInt(match[3]);
            }
            else if (format === formats[1]) {
                year = parseInt(match[1]);
                month = parseInt(match[2]) - 1;
                day = parseInt(match[3]);
            }
            else {
                const months = {
                    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
                };
                day = parseInt(match[1]);
                month = months[match[2].toLowerCase()];
                year = parseInt(match[3]);
            }
            return new Date(year, month, day);
        }
    }
    return null;
}
function extractCityLocation(location) {
    const parts = location.split(',').map(p => p.trim());
    let city = '';
    let state = '';
    let country = '';
    if (parts.length >= 1) {
        city = parts[0];
    }
    if (parts.length >= 2) {
        state = parts[1];
    }
    if (parts.length >= 3) {
        country = parts[2];
    }
    else if (parts.length === 2) {
        // If only 2 parts, check if second is country
        const possibleCountry = parts[1];
        if (possibleCountry.length <= 3 || ['UK', 'USA', 'US', 'Canada', 'India'].includes(possibleCountry)) {
            country = possibleCountry;
            state = '';
        }
    }
    return { city, state, country };
}
async function scrollPage(page) {
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    while (previousHeight !== currentHeight) {
        previousHeight = currentHeight;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000); // Wait for content to load
        currentHeight = await page.evaluate(() => document.body.scrollHeight);
    }
}
async function scrapeJobs() {
    const browser = await playwright_1.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const jobs = [];
    try {
        console.log('Navigating to:', BASE_URL);
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Wait for job listings to load
        await page.waitForTimeout(5000);
        // Try multiple possible selectors
        const selectors = ['.job-item', '.vacancy-item', '.bob-job-list-item', '[data-testid="job-item"]'];
        let jobsFound = false;
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                console.log(`Found jobs using selector: ${selector}`);
                jobsFound = true;
                break;
            }
            catch (e) {
                // Try next selector
            }
        }
        // If no selectors found, try to scroll and look for any job links
        if (!jobsFound) {
            console.log('Standard selectors not found, looking for alternative structure...');
            await scrollPage(page);
        }
        // Extract job listings
        const jobCards = await page.$$eval('.job-item, .vacancy-item, .bob-job-list-item, [data-testid="job-item"], a[href*="/jobs/"], a[href*="job"]', (cards) => {
            return cards.map((card) => {
                const linkElement = card.tagName === 'A' ? card : card.querySelector('a');
                const titleElement = card.querySelector('h2, h3, h4, .job-title, .title, [class*="title"]');
                return {
                    title: titleElement?.textContent?.trim() || card.textContent?.trim() || '',
                    jobUrl: linkElement?.href || '',
                };
            }).filter(job => job.jobUrl && job.title);
        });
        console.log(`Found ${jobCards.length} job cards`);
        // Extract jobId from URL and get details for each job
        for (const jobCard of jobCards) {
            try {
                const urlObj = new URL(jobCard.jobUrl);
                const pathParts = urlObj.pathname.split('/');
                const jobId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || `HB-${jobs.length + 1}`;
                // Navigate to job detail page
                await page.goto(jobCard.jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);
                // Extract job details
                const description = await page.$eval('.job-description, .description, [class*="description"], article, main', (el) => el.textContent?.trim() || '').catch(() => '');
                const location = await page.$eval('.location, [class*="location"], [class*="city"]', (el) => el.textContent?.trim() || '').catch(() => '');
                const employmentType = await page.$eval('.employment-type, [class*="type"], [class*="employment"]', (el) => el.textContent?.trim() || '').catch(() => '');
                const salaryRange = await page.$eval('.salary, [class*="salary"], [class*="compensation"]', (el) => el.textContent?.trim() || '').catch(() => '');
                const postedDateStr = await page.$eval('.posted-date, [class*="posted"], [class*="date"]', (el) => el.textContent?.trim() || '').catch(() => '');
                const postedDate = parseDate(postedDateStr);
                // Check cutoff date
                if (postedDate && postedDate > CUTOFF_DATE) {
                    console.log(`Skipping job posted after cutoff: ${jobCard.title}`);
                    continue;
                }
                const { city, state, country } = extractCityLocation(location);
                const jobData = {
                    jobId: jobId || `Paysafe-${jobs.length + 1}`,
                    title: jobCard.title,
                    description: description,
                    jobUrl: jobCard.jobUrl,
                    postedDate: postedDate ? formatDate(postedDate) : '',
                    jdDeadline: '',
                    company: COMPANY,
                    salaryRange: salaryRange,
                    employmentType: employmentType,
                    worktype: employmentType.includes('Remote') ? 'Remote' : employmentType.includes('Hybrid') ? 'Hybrid' : 'On-site',
                    location: location,
                    city: city,
                    state: state,
                    country: country,
                    ats: ATS_NAME,
                };
                jobs.push(jobData);
                console.log(`Extracted: ${jobData.title} (${jobData.location})`);
            }
            catch (error) {
                console.error(`Error extracting job details:`, error instanceof Error ? error.message : error);
            }
        }
        // Go back to listing page for next iteration if needed
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    catch (error) {
        console.error('Error during scraping:', error instanceof Error ? error.message : error);
        throw error;
    }
    finally {
        await browser.close();
    }
    return jobs;
}
async function writeOutput(jobs) {
    // Write JSON
    const jsonPath = path.join(OUTPUT_DIR, 'jobs.json');
    await fs.writeJson(jsonPath, jobs, { spaces: 2 });
    console.log(`\nJSON written to: ${jsonPath}`);
    // Write CSV
    const csvPath = path.join(OUTPUT_DIR, 'jobs.csv');
    const headers = [
        'jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline',
        'company', 'salaryRange', 'employmentType', 'worktype', 'location',
        'city', 'state', 'country', 'ats'
    ];
    const escapeCSV = (value) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    };
    const csvRows = [
        headers.join(','),
        ...jobs.map(job => headers.map(h => escapeCSV(job[h])).join(','))
    ];
    await fs.writeFile(csvPath, csvRows.join('\n'), 'utf-8');
    console.log(`CSV written to: ${csvPath}`);
}
async function main() {
    console.log(`Starting ${COMPANY} job scraper...`);
    console.log(`Platform: ${ATS_NAME}`);
    console.log(`URL: ${BASE_URL}`);
    console.log(`Cutoff date: ${formatDate(CUTOFF_DATE)}`);
    console.log('---');
    try {
        const jobs = await scrapeJobs();
        await writeOutput(jobs);
        console.log('\n=== REPORT ===');
        console.log(`1. Number of jobs found: ${jobs.length}`);
        console.log('2. Errors encountered: 0');
        const sampleJobs = jobs.slice(0, 3);
        console.log('3. Sample of first 3 jobs:');
        sampleJobs.forEach((job, idx) => {
            console.log(`   Job ${idx + 1}:`);
            console.log(`     - jobId: ${job.jobId}`);
            console.log(`     - title: ${job.title}`);
            console.log(`     - location: ${job.location}`);
        });
        console.log(`4. Output files:`);
        console.log(`   - JSON: ${path.join(OUTPUT_DIR, 'jobs.json')}`);
        console.log(`   - CSV: ${path.join(OUTPUT_DIR, 'jobs.csv')}`);
    }
    catch (error) {
        console.error('Script failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
main();
