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
const BASE_URL = 'https://www.smarted.co.uk/Vacancy/Vacancies';
const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\smart-ed';
const CUTOFF_DATE = new Date(2026, 6, 25); // 25-07-2026
function formatDate(date) {
    if (!date)
        return '';
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
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY-MM-DD
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i, // DD Month YYYY
    ];
    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            try {
                let day, month, year;
                if (format === formats[0]) {
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
                        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                    };
                    day = parseInt(match[1]);
                    month = months[match[2].toLowerCase()];
                    year = parseInt(match[3]);
                }
                return new Date(year, month, day);
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
function isAfterCutoff(date) {
    if (!date)
        return true; // Include if date can't be parsed
    return date >= CUTOFF_DATE;
}
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function scrapeJobs() {
    let browser = null;
    const jobs = [];
    const errors = [];
    try {
        console.log('Launching browser...');
        browser = await playwright_1.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        console.log(`Navigating to ${BASE_URL}...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(2000);
        let currentPage = 1;
        let hasNextPage = true;
        while (hasNextPage) {
            console.log(`\nProcessing page ${currentPage}...`);
            // Wait for job listings to load
            try {
                await page.waitForSelector('.job-item, .vacancy-item, article.job, .job-listing, .vacancy-listing, [class*="job"], [class*="vacancy"]', { timeout: 10000 });
            }
            catch (e) {
                console.log('Waiting for page content...');
                await delay(2000);
            }
            // Get all job cards
            const jobCards = await page.$$('.job-item, .vacancy-item, article.job, .job-listing, .vacancy-listing, .list-item, [class*="job-card"], [class*="vacancy-card"]');
            console.log(`Found ${jobCards.length} job cards on page ${currentPage}`);
            if (jobCards.length === 0) {
                // Try alternative selectors
                const alternativeSelectors = [
                    'table tr td a',
                    '.results-list > div',
                    '.search-results > div',
                    'ul li a[href*="vacancy"], ul li a[href*="job"]',
                    'a[href*="/Vacancy/"], a[href*="/job/"]'
                ];
                for (const selector of alternativeSelectors) {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        console.log(`Found ${elements.length} items using selector: ${selector}`);
                        for (const element of elements) {
                            try {
                                const job = await extractJobFromElement(page, element);
                                if (job && !jobs.find(j => j.jobId === job.jobId)) {
                                    jobs.push(job);
                                    console.log(`Extracted: ${job.title} - ${job.location}`);
                                }
                            }
                            catch (e) {
                                errors.push(`Error extracting job: ${e.message}`);
                            }
                        }
                        break;
                    }
                }
            }
            else {
                for (const card of jobCards) {
                    try {
                        const job = await extractJobFromCard(page, card);
                        if (job && !jobs.find(j => j.jobId === job.jobId)) {
                            jobs.push(job);
                            console.log(`Extracted: ${job.title} - ${job.location}`);
                        }
                    }
                    catch (e) {
                        errors.push(`Error extracting job from card: ${e.message}`);
                    }
                }
            }
            // Check for next page
            const nextButton = await page.$('a[rel="next"], .next a, .pagination .next, button:has-text("Next"), a:has-text("Next"), a:has-text(">"), li.next a, [aria-label="Next"]');
            if (nextButton) {
                const isDisabled = await nextButton.getAttribute('disabled');
                const hasDisabledClass = await nextButton.getAttribute('class');
                if (isDisabled || (hasDisabledClass && hasDisabledClass.includes('disabled'))) {
                    hasNextPage = false;
                }
                else {
                    console.log('Clicking next button...');
                    await nextButton.click();
                    await delay(3000);
                    currentPage++;
                }
            }
            else {
                // Try pagination numbers
                const paginationNumbers = await page.$$('.pagination a, .page-numbers a');
                const lastPage = await page.$('.pagination li:last-child a, .page-numbers li:last-child a');
                if (paginationNumbers.length > 0 && lastPage) {
                    const currentPageElement = await page.$('.pagination li.active a, .page-numbers.current, .pagination .active');
                    if (currentPageElement) {
                        const currentText = await currentPageElement.textContent();
                        const lastText = await lastPage.textContent();
                        if (currentText && lastText && parseInt(currentText.trim()) >= parseInt(lastText.trim())) {
                            hasNextPage = false;
                        }
                    }
                }
                else {
                    hasNextPage = false;
                }
            }
            // Safety limit
            if (currentPage > 100) {
                console.log('Reached maximum page limit');
                break;
            }
        }
        await browser.close();
        browser = null;
    }
    catch (error) {
        errors.push(`Main scraping error: ${error.message}`);
        console.error('Error during scraping:', error);
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
    if (errors.length > 0) {
        console.log('\nErrors encountered:');
        errors.forEach(e => console.log(`  - ${e}`));
    }
    return jobs;
}
async function extractJobFromCard(page, card) {
    try {
        // Try to find the link within the card
        const link = await card.$('a[href*="vacancy"], a[href*="job"], a');
        if (!link)
            return null;
        const jobUrl = await link.getAttribute('href');
        if (!jobUrl)
            return null;
        const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.smarted.co.uk${jobUrl}`;
        // Extract jobId from URL
        const jobIdMatch = fullUrl.match(/\/(\d+)|\/([a-zA-Z0-9-]+)(?:\?|$)/);
        const jobId = jobIdMatch ? (jobIdMatch[1] || jobIdMatch[2]) : `job-${Date.now()}`;
        // Get title
        let title = await card.$eval('h2, h3, h4, .title, .job-title, .vacancy-title', el => el.textContent?.trim() || '').catch(() => '');
        if (!title) {
            title = await link.textContent() || '';
        }
        title = title.trim();
        if (!title)
            return null;
        // Get basic details from card
        const location = await card.$eval('.location, .area, [class*="location"]', el => el.textContent?.trim() || '').catch(() => '');
        const salary = await card.$eval('.salary, [class*="salary"]', el => el.textContent?.trim() || '').catch(() => '');
        // Get job details page for more information
        const detailsPage = await page.context().newPage();
        let description = '';
        let employmentType = '';
        let postedDate = null;
        let deadline = '';
        try {
            await detailsPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await delay(1000);
            // Get description
            description = await detailsPage.$eval('.description, .job-description, .vacancy-description, .details, article, .content', el => el.textContent?.trim() || '').catch(() => '');
            if (!description) {
                // Try to get all text content
                const bodyText = await detailsPage.$eval('body', el => el.innerText);
                if (bodyText) {
                    // Extract relevant portion
                    const lines = bodyText.split('\n').filter(l => l.trim());
                    description = lines.slice(0, 20).join('\n'); // Get first 20 lines as description
                }
            }
            // Get employment type
            employmentType = await detailsPage.$eval('[class*="type"], [class*="employment"], [class*="contract"]', el => el.textContent?.trim() || '').catch(() => '');
            // Look for posted date
            const dateText = await detailsPage.$eval('[class*="date"], [class*="posted"], [class*="created"]', el => el.textContent?.trim() || '').catch(() => '');
            if (dateText) {
                postedDate = parseDate(dateText);
            }
            // Look for deadline
            deadline = await detailsPage.$eval('[class*="deadline"], [class*="closing"]', el => el.textContent?.trim() || '').catch(() => '');
        }
        catch (e) {
            console.log(`Could not fetch details for job ${jobId}: ${e.message}`);
        }
        finally {
            await detailsPage.close();
        }
        return {
            jobId,
            title,
            description,
            jobUrl: fullUrl,
            postedDate: formatDate(postedDate),
            jdDeadline: deadline,
            company: 'SmartEd',
            salaryRange: salary,
            employmentType,
            worktype: '',
            location,
            city: location.split(',')[0]?.trim() || '',
            state: location.split(',')[1]?.trim() || '',
            country: 'UK',
            ats: 'SmartEd'
        };
    }
    catch (e) {
        console.error('Error extracting job from card:', e);
        return null;
    }
}
async function extractJobFromElement(page, element) {
    try {
        const jobUrl = await element.getAttribute('href');
        if (!jobUrl)
            return null;
        const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.smarted.co.uk${jobUrl}`;
        // Extract jobId from URL
        const jobIdMatch = fullUrl.match(/\/(\d+)|\/([a-zA-Z0-9-]+)(?:\?|$)/);
        const jobId = jobIdMatch ? (jobIdMatch[1] || jobIdMatch[2]) : `job-${Date.now()}`;
        let title = await element.textContent() || '';
        title = title.trim();
        if (!title)
            return null;
        // Get job details
        const detailsPage = await page.context().newPage();
        let description = '';
        let location = '';
        let salary = '';
        let employmentType = '';
        let postedDate = null;
        let deadline = '';
        try {
            await detailsPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await delay(1000);
            // Try to extract all relevant information
            description = await detailsPage.$eval('.description, .job-description, .vacancy-description', el => el.textContent?.trim() || '').catch(() => '');
            location = await detailsPage.$eval('.location, [class*="location"]', el => el.textContent?.trim() || '').catch(() => '');
            salary = await detailsPage.$eval('[class*="salary"]', el => el.textContent?.trim() || '').catch(() => '');
            employmentType = await detailsPage.$eval('[class*="type"], [class*="employment"]', el => el.textContent?.trim() || '').catch(() => '');
            const dateText = await detailsPage.$eval('[class*="date"], [class*="posted"]', el => el.textContent?.trim() || '').catch(() => '');
            if (dateText) {
                postedDate = parseDate(dateText);
            }
            deadline = await detailsPage.$eval('[class*="deadline"], [class*="closing"]', el => el.textContent?.trim() || '').catch(() => '');
        }
        catch (e) {
            console.log(`Could not fetch details for job ${jobId}`);
        }
        finally {
            await detailsPage.close();
        }
        return {
            jobId,
            title,
            description,
            jobUrl: fullUrl,
            postedDate: formatDate(postedDate),
            jdDeadline: deadline,
            company: 'SmartEd',
            salaryRange: salary,
            employmentType,
            worktype: '',
            location,
            city: location.split(',')[0]?.trim() || '',
            state: location.split(',')[1]?.trim() || '',
            country: 'UK',
            ats: 'SmartEd'
        };
    }
    catch (e) {
        return null;
    }
}
function saveJobs(jobs) {
    // Save as JSON
    const jsonPath = path.join(OUTPUT_DIR, 'jobs.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), 'utf-8');
    console.log(`\nSaved ${jobs.length} jobs to ${jsonPath}`);
    // Save as CSV
    const csvPath = path.join(OUTPUT_DIR, 'jobs.csv');
    const headers = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
    const csvRows = jobs.map(job => {
        return [
            job.jobId,
            escapeCSV(job.title),
            escapeCSV(job.description),
            job.jobUrl,
            job.postedDate,
            job.jdDeadline,
            job.company,
            escapeCSV(job.salaryRange),
            escapeCSV(job.employmentType),
            job.worktype,
            escapeCSV(job.location),
            job.city,
            job.state,
            job.country,
            job.ats
        ].join(',');
    });
    const csvContent = [headers, ...csvRows].join('\n');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`Saved ${jobs.length} jobs to ${csvPath}`);
}
function escapeCSV(str) {
    if (!str)
        return '';
    // If contains comma, newline, or quotes, wrap in quotes and escape existing quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}
// Main execution
(async () => {
    console.log('Starting SmartEd job scraper...');
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`Cutoff date: ${formatDate(CUTOFF_DATE)}`);
    const jobs = await scrapeJobs();
    console.log(`\nTotal jobs found: ${jobs.length}`);
    if (jobs.length > 0) {
        saveJobs(jobs);
        console.log('\nFirst 3 jobs:');
        jobs.slice(0, 3).forEach((job, i) => {
            console.log(`${i + 1}. ID: ${job.jobId}, Title: ${job.title}, Location: ${job.location}`);
        });
    }
    else {
        console.log('No jobs found. Check connectivity or site structure.');
    }
    process.exit(0);
})();
