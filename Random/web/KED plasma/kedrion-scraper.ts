/**
 * Kedrion Job Scraper - TypeScript Version
 * 
 * This script scrapes job listings from Kedrion careers site using Playwright
 * and outputs data in the required format with all 15 columns.
 * 
 * Requirements:
 * - Node.js 18+
 * - Playwright: npm install playwright
 * 
 * Usage:
 * - npm install playwright
 * - npx playwright install chromium
 * - ts-node kedrion-scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface JobData {
  jobId: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate: string;
  jdDeadline: string;
  company: string;
  salaryRange: string;
  employmentType: string;
  worktype: string;
  location: string;
  city: string;
  state: string;
  country: string;
  ats: string;
}

interface ScrapingConfig {
  startUrl: string;
  outputDir: string;
  dateCutoff: string; // Format: '2026-07-15'
  maxJobs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG: ScrapingConfig = {
  startUrl: 'https://careers.kedrion.com/search?searchResultView=LIST',
  outputDir: './scraped-data',
  dateCutoff: '2026-07-15',
  maxJobs: 500,
};

// US State abbreviations for location parsing
const US_STATES: string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR'
];

// Multi-word cities that need special handling
const MULTI_WORD_CITIES: { [key: string]: string } = {
  'Fort Lee': 'Fort Lee',
  'San Antonio': 'San Antonio',
  'Fort Worth': 'Fort Worth',
  'Las Vegas': 'Las Vegas',
  'El Paso': 'El Paso',
  'Los Angeles': 'Los Angeles',
  'New York': 'New York',
  'San Diego': 'San Diego',
  'San Jose': 'San Jose',
  'Oklahoma City': 'Oklahoma City',
  'Kansas City': 'Kansas City',
  'St Louis': 'St Louis',
  'St. Louis': 'St Louis',
  'Baton Rouge': 'Baton Rouge',
  'Cedar Rapids': 'Cedar Rapids',
  'Des Moines': 'Des Moines',
  'Colorado Springs': 'Colorado Springs',
  'Sioux Falls': 'Sioux Falls',
  'Little Rock': 'Little Rock',
  'New Orleans': 'New Orleans',
  'Corpus Christi': 'Corpus Christi',
  'Salt Lake City': 'Salt Lake City',
  'Temple Terrace': 'Temple Terrace',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse date from M/D/YY format to ISO format
 */
function parseDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (!match) return null;

  const [, month, day, year] = match;
  return `20${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Check if date is within 30-day window
 */
function isWithin30Days(dateStr: string, cutoffDate: string): boolean {
  const parsedDate = parseDate(dateStr);
  if (!parsedDate) return false;
  return parsedDate >= cutoffDate;
}

/**
 * Extract city, state, and location from URL
 */
function parseLocationFromUrl(url: string): { city: string; state: string; location: string } {
  const urlMatch = url.match(/\/job\/(.+?)\/(\d+)/);
  if (!urlMatch) {
    return { city: '', state: '', location: '' };
  }

  let path = urlMatch[1];

  // URL decode
  path = path.replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2C/g, ',');

  const parts = path.split('-');

  // Find state
  let stateIdx = -1;
  let state = '';

  for (let i = 0; i < parts.length; i++) {
    if (US_STATES.includes(parts[i])) {
      state = parts[i];
      stateIdx = i;
      break;
    }
  }

  if (stateIdx === -1) {
    return { city: '', state: '', location: '' };
  }

  // Get ZIP
  let zipCode = '';
  if (stateIdx + 1 < parts.length) {
    const zipCandidate = parts[stateIdx + 1];
    if (/^\d{5}$/.test(zipCandidate)) {
      zipCode = zipCandidate;
    }
  }

  // Everything before state is city + title
  const beforeState = parts.slice(0, stateIdx);

  // Check for multi-word cities
  let city = '';

  for (const [multiCity, fullName] of Object.entries(MULTI_WORD_CITIES)) {
    const cityParts = multiCity.replace(/ /g, '-').split('-');
    if (beforeState.length >= cityParts.length) {
      let match = true;
      for (let i = 0; i < cityParts.length; i++) {
        if (beforeState[i]?.toLowerCase() !== cityParts[i].toLowerCase()) {
          match = false;
          break;
        }
      }
      if (match) {
        city = fullName;
        break;
      }
    }
  }

  // Single-word city (first part)
  if (!city && beforeState.length > 0) {
    city = beforeState[0];
  }

  const location = `${city}, ${state} ${zipCode}`.trim();

  return { city, state, location };
}

/**
 * Clean description to English only
 */
function cleanDescription(text: string): string {
  if (!text) return '';

  // Remove JavaScript/CSS
  let cleaned = text
    .replace(/\(function\(\)[^{]*\{[^}]*\}\)\(\);?/g, ' ')
    .replace(/if\s*\([^)]*\)\s*\{[^}]*\}/g, ' ')
    .replace(/else\s*\{[^}]*\}/g, ' ')
    .replace(/var\s+\w+\s*=\s*[^;]+;/g, ' ')
    .replace(/@media\s+[^{]*\{[^}]*\}/g, ' ');

  // Remove cookie notices
  cleaned = cleaned.replace(
    /We use cookies to offer you the best possible website experience.*?Accept All Cookies/gis,
    ' '
  );
  cleaned = cleaned.replace(/Cookie Preferences/gi, ' ');
  cleaned = cleaned.replace(/Reject All Cookies/gi, ' ');

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, ' ');

  // Clean whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Extract sentences (keep only substantial ones)
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const englishSentences = sentences
    .map(s => s.trim())
    .filter(s => s.length > 30 && s[0] === s[0].toUpperCase())
    .slice(0, 5); // Keep first 5 substantial sentences

  return englishSentences.join(' ');
}

/**
 * Extract salary range from page HTML
 */
function extractSalary(html: string): string {
  // Match Hiring Pay Range Min/Max
  const minMatch = html.match(/Hiring Pay Range Min[^\d]*([\d,]+(?:\.\d+)?)/i);
  const maxMatch = html.match(/Hiring Pay Range Max[^\d]*([\d,]+(?:\.\d+)?)/i);

  if (minMatch && maxMatch) {
    const minVal = minMatch[1].replace(/,/g, '').split('.')[0];
    const maxVal = maxMatch[1].replace(/,/g, '').split('.')[0];
    return `$${minVal} - $${maxVal}`;
  } else if (minMatch) {
    const minVal = minMatch[1].replace(/,/g, '').split('.')[0];
    return `$${minVal} - `;
  }

  return '';
}

/**
 * Parse employment type from page text
 */
function parseEmploymentType(text: string): string {
  const contractMatch = text.match(/Contract Duration[:\s]+(\w+)/i);
  if (contractMatch) {
    return contractMatch[1].toLowerCase() === 'intern' ? 'Intern' : 'Contract';
  }
  return 'Contract';
}

// ============================================================================
// MAIN SCRAPER CLASS
// ============================================================================

class KedrionScraper {
  private browser: Browser | null = null;
  private jobs: JobData[] = [];

  async initialize(): Promise<void> {
    console.log('Initializing browser...');
    this.browser = await chromium.launch({
      headless: true,
    });
  }

  async scrape(): Promise<JobData[]> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    console.log('Starting scrape...');
    const page = await this.browser.newPage();

    try {
      // Navigate to search page
      await page.goto(CONFIG.startUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Get all job URLs
      const jobUrls = await this.extractJobUrls(page);
      console.log(`Found ${jobUrls.length} job URLs`);

      // Process each job
      for (let i = 0; i < jobUrls.length; i++) {
        const url = jobUrls[i];
        console.log(`[${i + 1}/${jobUrls.length}] Processing: ${url}`);

        try {
          const jobData = await this.scrapeJobDetail(url);

          // Filter by 30-day window
          if (jobData.postedDate && isWithin30Days(jobData.postedDate, CONFIG.dateCutoff)) {
            this.jobs.push(jobData);
            console.log(`  ✓ Added: ${jobData.title} (${jobData.postedDate})`);
          } else {
            console.log(`  ✗ Skipped: Outside 30-day window`);
          }
        } catch (error) {
          console.error(`  ✗ Error: ${error}`);
        }

        // Progress update every 10 jobs
        if ((i + 1) % 10 === 0) {
          console.log(`Progress: ${i + 1}/${jobUrls.length} | Jobs kept: ${this.jobs.length}`);
        }
      }

      console.log(`\nScrape complete: ${this.jobs.length} jobs within 30-day window`);
      return this.jobs;

    } finally {
      await page.close();
    }
  }

  private async extractJobUrls(page: Page): Promise<string[]> {
    const urls: string[] = [];

    // Get total pages
    const paginationText = await page.locator('[data-pagination]').textContent().catch(() => '');
    const totalMatch = paginationText.match(/of\s+(\d+)/);
    const totalPages = totalMatch ? parseInt(totalMatch[1]) : 1;

    console.log(`Total pages: ${totalPages}`);

    // Iterate through pages
    for (let pageNum = 1; pageNum <= Math.min(totalPages, 30); pageNum++) {
      if (pageNum > 1) {
        // Navigate to next page
        const nextUrl = `${CONFIG.startUrl}&from=${((pageNum - 1) * 25) + 1}`;
        await page.goto(nextUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);
      }

      // Extract job URLs
      const pageUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/job/"]'));
        return links
          .map(link => (link as HTMLAnchorElement).href)
          .filter(href => href && href.includes('/job/'));
      });

      urls.push(...pageUrls);
      console.log(`  Page ${pageNum}: Found ${pageUrls.length} URLs`);
    }

    // Deduplicate
    return [...new Set(urls)].slice(0, CONFIG.maxJobs);
  }

  private async scrapeJobDetail(url: string): Promise<JobData> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);

      // Extract job ID from URL
      const jobIdMatch = url.match(/\/(\d+)-en_US/);
      const jobId = jobIdMatch ? jobIdMatch[1] : '';

      // Extract title
      const titleEl = await page.locator('h1').first().textContent().catch(() => '');
      const title = titleEl.replace('Job Details', '').trim() || 'Unknown';

      // Extract posted date
      const postedDateMatch = text.match(/Posting Start Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2})/i);
      const postedDate = postedDateMatch ? parseDate(postedDateMatch[1]) || '' : '';

      // Extract description
      const description = cleanDescription(text);

      // Extract salary
      const salaryRange = extractSalary(html);

      // Extract employment type
      const employmentType = parseEmploymentType(text);

      // Parse location from URL
      const { city, state, location } = parseLocationFromUrl(url);

      // Extract work type
      const worktypeMatch = text.match(/Place of Employment[:\s]+(\w+)/i);
      const worktype = worktypeMatch ? worktypeMatch[1] : '';

      return {
        jobId,
        title,
        description,
        jobUrl: url,
        postedDate,
        jdDeadline: '',
        company: 'KEDPlasma LLC',
        salaryRange,
        employmentType,
        worktype,
        location,
        city,
        state,
        country: 'United States',
        ats: 'Custom',
      };

    } finally {
      await page.close();
    }
  }

  async saveToJson(): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const outputPath = path.join(CONFIG.outputDir, 'kedrion_jobs.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.jobs, null, 2));
    console.log(`\nSaved to: ${outputPath}`);
    console.log(`Total jobs: ${this.jobs.length}`);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed');
    }
  }
}

// ============================================================================
// EXPORT TO CSV
// ============================================================================

function exportToCsv(jobs: JobData[], outputPath: string): void {
  const headers = Object.keys(jobs[0] || {}).join(',');
  const rows = jobs.map(job => {
    return Object.values(job)
      .map(val => `"${String(val).replace(/"/g, '""').replace(/\n/g, ' ')}"`)
      .join(',');
  });

  const csv = [headers, ...rows].join('\n');
  fs.writeFileSync(outputPath, csv);
  console.log(`CSV saved to: ${outputPath}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  const scraper = new KedrionScraper();

  try {
    await scraper.initialize();
    const jobs = await scraper.scrape();
    await scraper.saveToJson();

    // Export to CSV as well
    const csvPath = path.join(CONFIG.outputDir, 'kedrion_jobs.csv');
    exportToCsv(jobs, csvPath);

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('SCRAPING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total jobs scraped: ${jobs.length}`);
    console.log(`With salary: ${jobs.filter(j => j.salaryRange).length}`);
    console.log(`With description: ${jobs.filter(j => j.description.length > 0).length}`);
    console.log(`Date range: ${CONFIG.dateCutoff} to 2026-08-14`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { KedrionScraper, parseLocationFromUrl, extractSalary, cleanDescription };
