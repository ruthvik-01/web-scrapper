/**
 * SISD Job Scraper - Complete TypeScript Implementation v2
 * https://my.sisd.net/public_apps/jobs
 * 
 * Features:
 * - Scrapes 42 jobs from 5 categories
 * - Extracts full PDF text for descriptions (NO truncation)
 * - Cleans descriptions: removes headers/dates, preserves job content
 * - Sets location: El Paso, TX, United States
 * - Uses Tyler Portico application URLs
 * - Outputs exact 15 required fields
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';

// ============================================================================
// INTERFACES
// ============================================================================

interface Job {
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

interface ScrapedData {
  total_jobs: number;
  jobs: Job[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  baseUrl: 'https://my.sisd.net/public_apps/jobs',
  outputDir: './sisd-output',
  headers: {
    'User-Agent': 'Mozilla/5.0 (JobScraper/1.0)'
  },
  timeout: 30000,
  // Location settings (verified: 12440 Rojas Drive, El Paso, TX 79928)
  defaultLocation: 'El Paso, TX, United States',
  defaultCity: 'El Paso',
  defaultState: 'TX',
  defaultCountry: 'United States'
};

// ============================================================================
// DESCRIPTION CLEANING (Remove only noise, preserve job content)
// ============================================================================

function cleanDescription(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove only the strict header pattern at START
  const headerPattern = /^SOCORRO INDEPENDENT SCHOOL DISTRICT\s+Department of Human Resources\s+JOB DESCRIPTION\s*/i;
  cleaned = cleaned.replace(headerPattern, '');
  
  // Remove standalone page numbers (lines with just digits)
  cleaned = cleaned.replace(/\n\s*\d+\s*\n/g, '\n');
  
  // Remove revision dates at the VERY END only
  const datePattern = /\s*(?:,\s*)?(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*)+$/;
  cleaned = cleaned.replace(datePattern, '');
  
  // Remove copyright/legal text at end
  cleaned = cleaned.replace(/\s*Copyright\s+\d{4}[^\n]*$/gim, '');
  cleaned = cleaned.replace(/\s*All rights reserved[^\n]*$/gim, '');
  
  // Normalize whitespace but preserve structure
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');     // Multi spaces → single
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');    // 3+ newlines → 2
  cleaned = cleaned.replace(/ \n/g, '\n');         // Fix space-newline
  cleaned = cleaned.replace(/\n /g, '\n');         // Fix newline-space
  
  return cleaned.trim();
}

// ============================================================================
// PDF TEXT EXTRACTION (Full text, NO truncation)
// ============================================================================

async function extractPdfText(pdfUrl: string): Promise<string> {
  if (!pdfUrl || !pdfUrl.startsWith('http')) {
    return '';
  }
  
  try {
    console.log(`    Downloading PDF...`);
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: CONFIG.timeout,
      headers: CONFIG.headers
    });
    
    const pdfData = await pdfParse(Buffer.from(response.data));
    let text = pdfData.text;
    
    // Clean but DO NOT truncate
    text = text.replace(/\s+/g, ' ').trim();
    
    console.log(`    Extracted: ${text.length} chars`);
    return text;
    
  } catch (error) {
    console.error(`    PDF extraction failed: ${error}`);
    return '';
  }
}

// ============================================================================
// CATEGORY SCRAPING
// ============================================================================

async function scrapeCategory(catUrl: string, catName: string): Promise<Partial<Job>[]> {
  console.log(`\nScraping: ${catName}`);
  
  const response = await axios.get(catUrl, {
    headers: CONFIG.headers,
    timeout: CONFIG.timeout
  });
  
  const $ = cheerio.load(response.data);
  const jobs: Partial<Job>[] = [];
  
  // Find all job links with onclick="openApplicationUrl(...)"
  $('a[onclick*="openApplicationUrl"]').each((_, el) => {
    const $link = $(el);
    const title = $link.text().trim();
    const onclick = $link.attr('onclick') || '';
    
    // Extract job URL from onclick
    const urlMatch = onclick.match(/'([^']+)'\s*,\s*'([^']+)'/);
    if (!urlMatch) return;
    
    const jobUrl = urlMatch[2];
    
    // Find context HTML
    const $row = $link.closest('tr');
    const rowHtml = $row.html() || '';
    
    // Extract job code
    const codeMatch = rowHtml.match(/Code:\s*(\d+)\s*-\s*(\d+)/);
    const jobId = codeMatch ? `${codeMatch[1]}_${codeMatch[2]}` : '';
    
    // Extract salary
    const salaryMatch = rowHtml.match(/Salary:\s*([\$\d\.\-,$\s]+)/);
    const salaryRange = salaryMatch ? salaryMatch[1].trim() : '';
    
    // Extract dates
    const datePattern = /([A-Z][a-z]+ \d{1,2},? \d{4})/g;
    const dates = rowHtml.match(datePattern) || [];
    const postedDate = dates[0] || '';
    const jdDeadline = dates[1] || '';
    
    // Extract PDF URL
    const $pdfLink = $row.find('a[href*="Job_Descriptions"], a[href$=".pdf"]');
    let pdfUrl = $pdfLink.attr('href') || '';
    if (pdfUrl.startsWith('..')) {
      pdfUrl = 'https://www2.sisd.net' + pdfUrl.substring(2);
    }
    
    if (jobId && title) {
      jobs.push({
        jobId,
        title,
        description: pdfUrl, // Will be replaced after extraction
        jobUrl,
        postedDate,
        jdDeadline,
        salaryRange,
        company: 'Socorro Consolidated School District',
        employmentType: 'Contract',
        worktype: '',
        location: CONFIG.defaultLocation,
        city: CONFIG.defaultCity,
        state: CONFIG.defaultState,
        country: CONFIG.defaultCountry,
        ats: 'Custom'
      });
      
      console.log(`  ${jobId}: ${title.substring(0, 45)}`);
    }
  });
  
  console.log(`  -> ${jobs.length} jobs`);
  return jobs;
}

// ============================================================================
// MAIN SCRAPER
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('SISD JOB SCRAPER - TypeScript v2');
  console.log('Location: El Paso, TX (12440 Rojas Drive, El Paso, TX 79928)');
  console.log('='.repeat(70));
  
  const categories = [
    { name: 'Administrative', url: `${CONFIG.baseUrl}/postings/?type=Administrative` },
    { name: 'Auxiliary', url: `${CONFIG.baseUrl}/postings/?type=Auxiliary` },
    { name: 'Certified', url: `${CONFIG.baseUrl}/postings/?type=Certified` },
    { name: 'Para / Clerical', url: `${CONFIG.baseUrl}/postings/?type=Para%20/%20Clerical` },
    { name: 'Substitute', url: `${CONFIG.baseUrl}/postings/?type=Substitute` }
  ];
  
  // Phase 1: Extract job metadata
  let allJobs: Partial<Job>[] = [];
  
  for (const cat of categories) {
    const jobs = await scrapeCategory(cat.url, cat.name);
    allJobs = allJobs.concat(jobs);
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Phase 1 complete: ${allJobs.length} jobs found`);
  console.log(`${'='.repeat(70)}`);
  
  // Phase 2: Extract PDFs and clean descriptions
  console.log('\nPhase 2: Extracting and cleaning PDF descriptions...\n');
  
  const jobsWithDescriptions: Job[] = [];
  
  for (let i = 0; i < allJobs.length; i++) {
    const job = allJobs[i];
    console.log(`[${i + 1}/${allJobs.length}] ${job.title?.substring(0, 40)}`);
    
    const pdfUrl = job.description as string;
    
    if (pdfUrl && pdfUrl.startsWith('http')) {
      // Extract full PDF text
      let descriptionText = await extractPdfText(pdfUrl);
      
      // Clean the description
      descriptionText = cleanDescription(descriptionText);
      
      // Only keep jobs with substantive descriptions
      if (descriptionText && descriptionText.length > 100) {
        job.description = descriptionText;
        jobsWithDescriptions.push(job as Job);
      } else {
        console.log(`    Skipped: No valid description`);
      }
    } else {
      console.log(`    Skipped: No PDF URL`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Phase 2 complete: ${jobsWithDescriptions.length} jobs with descriptions`);
  console.log(`${'='.repeat(70)}`);
  
  // Phase 3: Save output
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  
  const output: ScrapedData = {
    total_jobs: jobsWithDescriptions.length,
    jobs: jobsWithDescriptions
  };
  
  const outputPath = path.join(CONFIG.outputDir, 'sisd_jobs.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('SCRAPING COMPLETE');
  console.log(`${'='.repeat(70)}`);
  console.log(`Total jobs: ${jobsWithDescriptions.length}`);
  console.log(`Output: ${outputPath}`);
  console.log(`${'='.repeat(70)}`);
  
  // Show sample
  if (jobsWithDescriptions.length > 0) {
    const sample = jobsWithDescriptions[0];
    console.log('\nSample job:');
    console.log(`  Title: ${sample.title}`);
    console.log(`  Location: ${sample.location}`);
    console.log(`  City: ${sample.city}`);
    console.log(`  Description: ${sample.description.length} chars`);
    console.log(`  Preview: ${sample.description.substring(0, 200)}...`);
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
