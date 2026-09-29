import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

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

const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\morson';
const BASE_URL = 'https://www.morson.com/jobs';
const COMPANY = 'Morson';
const ATS = 'Morson';
const CUTOFF_DATE = new Date('2026-07-25');

// Date format: DD-MM-YYYY
function formatDate(date: Date | null): string {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Try various formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or MM/DD/YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i, // DD Mon YYYY
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[2]) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = parseInt(match[1]);
        const month = months.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
        const year = parseInt(match[3]);
        return new Date(year, month, day);
      } else if (format === formats[1]) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else {
        // Assume DD/MM/YYYY for UK sites
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeJobList(page: Page, pageNum: number): Promise<Array<{jobId: string, title: string, jobUrl: string}>> {
  const jobs: Array<{jobId: string, title: string, jobUrl: string}> = [];
  
  try {
    const url = `${BASE_URL}?page=${pageNum}`;
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(3000);
    console.log('Page loaded');
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Try multiple selectors for job cards
    const selectors = ['.job-card', '.vacancy-item', 'article.job', '.search-result', '.job-result', '[data-job-id]', '.listing', '.vacancy'];
    let jobCards: any[] = [];
    
    for (const selector of selectors) {
      try {
        jobCards = await page.$$(selector);
        if (jobCards.length > 0) {
          console.log(`Found ${jobCards.length} jobs using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // If no jobs found with standard selectors, try alternative approach
    if (jobCards.length === 0) {
      // Look for any links that might be job links
      const pageContent = await page.content();
      if (pageContent.includes('job') || pageContent.includes('vacanc')) {
        // Try to find job links by URL pattern
        const links = await page.$$eval('a', (anchors) => 
          anchors
            .filter(a => {
              const href = a.getAttribute('href') || '';
              const text = a.textContent || '';
              return (href.includes('/job/') || href.includes('/vacanc') || href.includes('/career')) && text.trim().length > 5;
            })
            .map(a => ({
              url: a.getAttribute('href') || '',
              title: a.textContent?.trim() || ''
            }))
        );
        
        for (const link of links) {
          const jobId = link.url.split('/').filter((p: string) => p).pop() || '';
          if (jobId) {
            jobs.push({
              jobId,
              title: link.title,
              jobUrl: link.url.startsWith('http') ? link.url : `https://www.morson.com${link.url}`
            });
          }
        }
      }
    } else {
      // Extract job data from cards
      for (const card of jobCards) {
        try {
          // Try to get job link
          const link = await card.$('a');
          let jobUrl = '';
          let title = '';
          let jobId = '';
          
          if (link) {
            jobUrl = await link.getAttribute('href') || '';
            title = await link.textContent() || '';
            
            if (jobUrl && !jobUrl.startsWith('http')) {
              jobUrl = `https://www.morson.com${jobUrl}`;
            }
            
            // Extract jobId from URL
            const urlParts = jobUrl.split('/').filter((p: string) => p);
            jobId = urlParts[urlParts.length - 1] || '';
          }
          
          // Try to get title from other elements if not found
          if (!title) {
            const titleEl = await card.$('h2, h3, .title, .job-title, [class*="title"]');
            if (titleEl) {
              title = await titleEl.textContent() || '';
            }
          }
          
          // Try to get jobId from data attribute
          if (!jobId) {
            jobId = await card.getAttribute('data-job-id') || await card.getAttribute('data-id') || '';
          }
          
          if (jobUrl && title) {
            jobs.push({
              jobId: jobId || `morson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              title: title.trim(),
              jobUrl
            });
          }
        } catch (e) {
          console.error('Error extracting job card:', e);
        }
      }
    }
    
  } catch (error) {
    console.error(`Error scraping page ${pageNum}:`, error);
  }
  
  return jobs;
}

async function scrapeJobDetails(page: Page, job: {jobId: string, title: string, jobUrl: string}): Promise<Job> {
  const jobData: Job = {
    jobId: job.jobId,
    title: job.title,
    description: '',
    jobUrl: job.jobUrl,
    postedDate: '',
    jdDeadline: '',
    company: COMPANY,
    salaryRange: '',
    employmentType: '',
    worktype: '',
    location: '',
    city: '',
    state: '',
    country: 'UK',
    ats: ATS
  };
  
  try {
    await page.goto(job.jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(1000);
    
    // Extract description
    const descSelectors = ['.job-description', '.description', 'article', '.content', '.vacancy-description', 'main', '[class*="description"]'];
    for (const selector of descSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          jobData.description = await element.textContent() || '';
          if (jobData.description.length > 50) break;
        }
      } catch (e) {}
    }
    
    // Clean up description
    jobData.description = jobData.description.replace(/\s+/g, ' ').trim();
    
    // Extract salary
    const salaryPatterns = [
      /£[\d,]+(?:\s*[-–]\s*£?[\d,]+)?(?:\s*(?:per\s+annum|p\.a\.|pa|per\s+year|\/\s*year))?/gi,
    ];
    
    const pageText = await page.textContent('body') || '';
    
    for (const pattern of salaryPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        jobData.salaryRange = match[0];
        break;
      }
    }
    
    // Also try specific salary elements
    const salarySelectors = ['.salary', '[class*="salary"]', '.wage', '.pay'];
    for (const selector of salarySelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && (text.includes('£') || text.includes('$') || text.match(/\d+k/i))) {
            jobData.salaryRange = text.trim();
            break;
          }
        }
      } catch (e) {}
    }
    
    // Extract location
    const locationSelectors = ['.location', '[class*="location"]', '.address'];
    for (const selector of locationSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          jobData.location = await element.textContent() || '';
          break;
        }
      } catch (e) {}
    }
    
    // Parse city from location
    if (jobData.location) {
      const locationParts = jobData.location.split(',').map(p => p.trim());
      if (locationParts.length > 0) {
        jobData.city = locationParts[0];
      }
    }
    
    // Extract employment type
    const typePatterns = [
      { pattern: /contract/i, value: 'Contract' },
      { pattern: /permanent/i, value: 'Permanent' },
      { pattern: /temporary/i, value: 'Temporary' },
      { pattern: /full[- ]?time/i, value: 'Full-time' },
      { pattern: /part[- ]?time/i, value: 'Part-time' },
      { pattern: /freelance/i, value: 'Freelance' },
    ];
    
    for (const { pattern, value } of typePatterns) {
      if (pattern.test(pageText)) {
        jobData.employmentType = value;
        break;
      }
    }
    
    // Also try specific type elements
    const typeSelectors = ['.job-type', '[class*="type"]', '.employment-type', '.contract-type'];
    for (const selector of typeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          jobData.employmentType = await element.textContent() || '';
          break;
        }
      } catch (e) {}
    }
    
    // Extract posted date
    const dateSelectors = ['.posted', '[class*="date"]', '.created', '[class*="posted"]'];
    for (const selector of dateSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const dateText = await element.textContent() || '';
          const parsedDate = parseDate(dateText);
          if (parsedDate) {
            jobData.postedDate = formatDate(parsedDate);
            break;
          }
        }
      } catch (e) {}
    }
    
    // Set worktype same as employment type
    jobData.worktype = jobData.employmentType;
    
  } catch (error) {
    console.error(`Error scraping job details for ${job.jobUrl}:`, error);
  }
  
  return jobData;
}

async function main() {
  let browser: Browser | null = null;
  const allJobs: Job[] = [];
  const errors: string[] = [];
  
  try {
    console.log('Starting Morson job scraper...');
    
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    let pageNum = 1;
    let noNewJobsCount = 0;
    const maxEmptyPages = 3;
    
    while (true) {
      console.log(`\n--- Scraping page ${pageNum} ---`);
      
      const jobs = await scrapeJobList(page, pageNum);
      
      if (jobs.length === 0) {
        noNewJobsCount++;
        console.log(`No jobs found on page ${pageNum} (${noNewJobsCount}/${maxEmptyPages} empty pages)`);
        if (noNewJobsCount >= maxEmptyPages) {
          console.log('Reached maximum empty pages. Stopping pagination.');
          break;
        }
      } else {
        noNewJobsCount = 0;
        console.log(`Found ${jobs.length} jobs on page ${pageNum}`);
        
        // Scrape details for each job
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          console.log(`Scraping job ${i + 1}/${jobs.length}: ${job.title}`);
          
          try {
            const jobDetails = await scrapeJobDetails(page, job);
            
            // Check against cutoff date
            if (jobDetails.postedDate) {
              const postedDate = parseDate(jobDetails.postedDate);
              if (postedDate && postedDate < CUTOFF_DATE) {
                console.log(`Job posted before cutoff date (${jobDetails.postedDate}), excluding: ${job.title}`);
                continue;
              }
            }
            
            allJobs.push(jobDetails);
          } catch (e) {
            errors.push(`Error scraping job ${job.jobId}: ${e}`);
            console.error(`Error scraping job ${job.jobId}:`, e);
          }
          
          await sleep(500); // Be polite
        }
      }
      
      pageNum++;
      
      // Safety limit
      if (pageNum > 100) {
        console.log('Reached page limit. Stopping.');
        break;
      }
    }
    
    await browser.close();
    browser = null;
    
  } catch (error) {
    errors.push(`Main error: ${error}`);
    console.error('Fatal error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  // Save results
  console.log(`\nTotal jobs scraped: ${allJobs.length}`);
  
  // Create output directory if needed
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Save JSON
  const jsonPath = path.join(OUTPUT_DIR, 'jobs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allJobs, null, 2));
  console.log(`JSON saved to: ${jsonPath}`);
  
  // Save CSV
  const csvPath = path.join(OUTPUT_DIR, 'jobs.csv');
  const csvHeaders = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
  const csvRows = allJobs.map(job => {
    const escapeCSV = (str: string) => {
      if (!str) return '';
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
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
    ].join(',');
  });
  
  fs.writeFileSync(csvPath, csvHeaders + '\n' + csvRows.join('\n'));
  console.log(`CSV saved to: ${csvPath}`);
  
  // Report errors
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(e => console.log(`- ${e}`));
  }
  
  // Print first 3 jobs as sample
  console.log('\n=== Sample of first 3 jobs ===');
  allJobs.slice(0, 3).forEach((job, idx) => {
    console.log(`${idx + 1}. JobId: ${job.jobId}, Title: ${job.title}, Location: ${job.location || 'N/A'}`);
  });
  
  return { allJobs, errors };
}

main().catch(console.error);
