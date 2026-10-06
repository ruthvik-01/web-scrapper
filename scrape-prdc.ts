#!/usr/bin/env node
/**
 * PRDC Dental (Rodericks Dental Partners) scraper
 * URL: https://careers.rodericksdentalpartners.co.uk/jobs/search
 * ATS: Tribepad
 * 
 * Scrapes all jobs with checkpointing for reliable long-running extraction
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, Browser, Page } from 'playwright';

const BASE_URL = 'https://careers.rodericksdentalpartners.co.uk';
const OUTPUT_DIR = resolve(join('output', 'prdc-dental-2026-09-24'));

interface Job {
  jobId: string;
  title: string;
  url: string;
  company: string;
  location: string;
  town: string;
  county: string;
  country: string;
  datePosted: string;
  validThrough: string;
  contractType: string;
  salary: string;
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  return OUTPUT_DIR;
}

async function extractJobsFromPage(page: Page): Promise<Partial<Job>[]> {
  return await page.evaluate(() => {
    const jobs: Partial<Job>[] = [];
    const items = document.querySelectorAll('ul.jobs > li');
    
    items.forEach(li => {
      const a = li.querySelector('a[href*="/jobs/job/"]');
      if (!a) return;
      
      const titleEl = li.querySelector('.job-list-title');
      const locationEl = li.querySelector('[itemprop="jobLocation"]');
      
      // Job ID from URL
      const urlMatch = a.href.match(/\/(\d+)(?:$|\?)/);
      const jobId = urlMatch ? urlMatch[1] : '';
      
      // Get full text for extraction
      const fullText = li.textContent?.trim() || '';
      
      // Contract type
      let contractType = '';
      if (fullText.includes('Full Time')) contractType = 'Full Time';
      else if (fullText.includes('Part Time')) contractType = 'Part Time';
      else {
        const seMatch = fullText.match(/(SE - [A-Za-z ]+)/);
        if (seMatch) contractType = seMatch[1].trim();
      }
      
      // Salary
      let salary = '';
      const salaryMatch = fullText.match(/(Competitive(?:\s+Salary)?|£[\d,]+(?:\s*-\s*£[\d,]+)?)/i);
      if (salaryMatch) salary = salaryMatch[1];
      
      jobs.push({
        jobId,
        title: titleEl?.textContent?.trim() || '',
        url: a.href,
        location: locationEl?.textContent?.trim() || '',
        contractType,
        salary,
        company: 'PRDC Dental',
        country: 'United Kingdom'
      });
    });
    
    return jobs;
  });
}

async function extractJobDetails(page: Page, job: Partial<Job>): Promise<void> {
  try {
    await page.goto(job.url!, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    const schemaData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      let jobData: any = { company: 'PRDC Dental' };
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || '{}');
          if (data['@type'] === 'JobPosting') {
            jobData = {
              company: data.hiringOrganization?.name || 'PRDC Dental',
              town: data.jobLocation?.address?.addressLocality || '',
              county: data.jobLocation?.address?.addressRegion || '',
              postcode: data.jobLocation?.address?.postalCode || '',
              datePosted: data.datePosted || '',
              validThrough: data.validThrough || ''
            };
            break;
          }
        } catch {}
      }
      // Extract description container (exclude nav, controls, related jobs)
      const descEl = document.querySelector('main .job-description, main article, .job-detail-description, #job-description, main') || document.body;
      let description = descEl ? descEl.innerText || descEl.textContent || '' : '';
      // Remove navigation, apply buttons, related job cards, page controls
      description = description
        .replace(/Apply now|Share this job|Back to search|Print this page/gi, '')
        .replace(/Related jobs|Other vacancies|Similar positions|You may also like/gi, '')
        .replace(/Posted on.*|Closing Date.*|Job Reference.*/gi, '')
        .replace(/\s*\n\s*\n\s*/g, '\n\n')
        .trim();
      // Clean HTML entities
      description = description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      jobData.description = description;
      // Extract Contract Type, salary from visible text (Rodericks specific)
      const pageText = document.body.innerText || '';
      const contractMatch = pageText.match(/Contract Type[:\s]*([^\n]+)/i);
      if (contractMatch) jobData.contractType = contractMatch[1].trim();
      const salaryMatch = pageText.match(/Salary[:\s]*([^\n]+)|£[\d,]+(?:\s*-\s*£?[\d,]+)?/i);
      if (salaryMatch) jobData.salary = (salaryMatch[1] || salaryMatch[0]).trim();
      // Clean city: take first sensible place name, drop address/postcode
      if (jobData.town) {
        let c = jobData.town.replace(/\d.*$/, '').replace(/,.*$/, '').trim();
        if (c.length > 3 && !/\d/.test(c)) jobData.town = c;
      }
      return jobData;
    });
    
    job.company = schemaData.company;
    if (schemaData.town) job.town = schemaData.town;
    if (schemaData.county) job.county = schemaData.county;
    if (schemaData.datePosted) job.datePosted = schemaData.datePosted;
    if (schemaData.validThrough) job.validThrough = schemaData.validThrough;
    if (schemaData.description) job.description = schemaData.description;
    if (schemaData.contractType) job.contractType = schemaData.contractType;
    if (schemaData.salary) job.salary = schemaData.salary;
    
  } catch (error) {
    console.log(`    Error fetching details: ${error}`);
  }
}

function saveJobs(jobs: Partial<Job>[], outputDir: string, filename: string = 'all_jobs'): void {
  // JSON
  const jsonPath = join(outputDir, `${filename}.json`);
  writeFileSync(jsonPath, JSON.stringify(jobs, null, 2));
  
  // CSV with 15 columns
  const csvPath = join(outputDir, `${filename}.csv`);
  const csvRows = [
    'jobId,title,url,company,location,town,county,country,industry,sector,datePosted,validThrough,contractType,salary,description'
  ];
  
  jobs.forEach(job => {
    // Clean location
    const loc = (job.location || '').replace(', United Kingdom', '').trim();
    const parts = loc.split(',');
    const town = parts[0]?.trim() || job.town || '';
    const county = parts.length > 1 ? parts[parts.length - 1].trim() : job.county || '';
    
    csvRows.push([
      job.jobId || '',
      `"${(job.title || '').replace(/"/g, '""')}"`,
      job.url || '',
      job.company || 'PRDC Dental',
      `"${loc.replace(/"/g, '""')}"`,
      `"${town.replace(/"/g, '""')}"`,
      `"${county.replace(/"/g, '""')}"`,
      'United Kingdom',
      'Healthcare & Social Care',
      'Dental',
      job.datePosted || '',
      job.validThrough || '',
      `"${(job.contractType || '').replace(/"/g, '""')}"`,
      `"${(job.salary || '').replace(/"/g, '""')}"`,
      ''
    ].join(','));
  });
  
  writeFileSync(csvPath, csvRows.join('\n'));
  console.log(`Saved ${jobs.length} jobs to ${filename}.json and ${filename}.csv`);
}

async function main(): Promise<void> {
  const outputDir = ensureOutputDir();
  
  // Check for existing checkpoint
  const checkpointPath = join(outputDir, 'checkpoint.json');
  let allJobs: Partial<Job>[] = [];
  let startPage = 1;
  
  if (existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    allJobs = checkpoint.jobs || [];
    startPage = checkpoint.last_page + 1;
    console.log(`Resuming from page ${startPage} with ${allJobs.length} existing jobs`);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    // Get total pages
    console.log('Checking pagination...');
    await page.goto(`${BASE_URL}/jobs/search`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const totalPages = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/jobs/search/-1/"]'));
      const pages = links
        .map(a => {
          const m = a.href.match(/\/jobs\/search\/-1\/(\d+)/);
          return m ? parseInt(m[1]) : 0;
        })
        .filter(n => n > 0);
      return Math.max(...pages, 1);
    });
    
    console.log(`Total pages to scrape: ${totalPages}`);
    
    // Scrape listings from all pages
    for (let pg = startPage; pg <= totalPages; pg++) {
      console.log(`\nPage ${pg}/${totalPages}`);
      
      if (pg > 1) {
        await page.goto(`${BASE_URL}/jobs/search/-1/${pg}`, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1500);
      }
      
      const jobs = await extractJobsFromPage(page);
      console.log(`  Found ${jobs.length} jobs`);
      allJobs.push(...jobs);
      
      // Save checkpoint every 5 pages
      if (pg % 5 === 0 || pg === totalPages) {
        writeFileSync(checkpointPath, JSON.stringify({
          jobs: allJobs,
          last_page: pg,
          timestamp: new Date().toISOString()
        }));
        saveJobs(allJobs, outputDir, `checkpoint_pg${pg}`);
        console.log(`  Checkpoint saved at page ${pg}`);
      }
      
      await page.waitForTimeout(800);
    }
    
    console.log(`\n✓ Collected ${allJobs.length} jobs from listings`);
    
    // Now scrape details for each job
    for (let i = 0; i < allJobs.length; i++) {
      const job = allJobs[i];
      
      if (job.datePosted) {
        console.log(`[${i + 1}/${allJobs.length}] Skipping ${job.jobId} - already has details`);
        continue;
      }
      
      console.log(`[${i + 1}/${allJobs.length}] Fetching details for ${job.jobId}: ${(job.title || '').substring(0, 40)}`);
      await extractJobDetails(page, job);
      await page.waitForTimeout(500);
      
      // Save progress every 20 jobs
      if (i > 0 && i % 20 === 0) {
        saveJobs(allJobs, outputDir, `progress_${i}`);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // Final save
  saveJobs(allJobs, outputDir, 'prdc_dental_final');
  
  // Remove checkpoint
  if (existsSync(checkpointPath)) {
    const fs = await import('node:fs/promises');
    await fs.unlink(checkpointPath);
  }
  
  console.log(`\n✅ Complete! Total: ${allJobs.length} jobs`);
}

main().catch(console.error);
