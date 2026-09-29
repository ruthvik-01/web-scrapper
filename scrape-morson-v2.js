const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:\\\\Internship\\\\MAIN\\\\UK SCRAPPER\\\\output\\\\2026-09-25-main-uk-scrape\\\\jobs company wise\\\\morson';
const BASE_URL = 'https://www.morson.com/jobs';
const COMPANY = 'Morson';
const ATS = 'Morson';
const CUTOFF_DATE = new Date('2026-07-25');
const MAX_PAGES = 10;
const MAX_JOBS_PER_PAGE = 50;

function formatDate(date) {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Starting Morson job scraper...');
  console.log('Output directory:', OUTPUT_DIR);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const allJobs = [];
  const errors = [];
  
  let pageNum = 1;
  let emptyPages = 0;
  
  try {
    while (pageNum <= MAX_PAGES && emptyPages < 2) {
      const url = `${BASE_URL}?page=${pageNum}`;
      console.log(`\n--- Scraping page ${pageNum} ---`);
      console.log('Navigating to:', url);
      
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await sleep(2000);
      
      const pageTitle = await page.title();
      console.log('Page title:', pageTitle);
      
      // Try to extract job cards using the correct selector
      const jobsOnThisPage = [];
      
      try {
        const jobCards = await page.$$('.job-card');
        console.log(`Found ${jobCards.length} job cards`);
        
        if (jobCards.length === 0) {
          emptyPages++;
          console.log('No jobs found on this page');
          pageNum++;
          continue;
        }
        
        emptyPages = 0;
        
        for (let i = 0; i < jobCards.length && i < MAX_JOBS_PER_PAGE; i++) {
          const card = jobCards[i];
          try {
            // Get the main link
            const link = await card.$('a');
            let jobUrl = '';
            let title = '';
            let jobId = '';
            
            if (link) {
              jobUrl = await link.getAttribute('href') || '';
              
              // Try to get title from heading inside card
              const heading = await card.$('h2, h3, .job-title, [class*="title"]');
              if (heading) {
                title = await heading.textContent() || '';
              } else {
                title = await link.textContent() || '';
              }
              
              // Extract jobId from URL
              const urlParts = jobUrl.split('/').filter(p => p);
              jobId = urlParts[urlParts.length - 1] || '';
            }
            
            // Get location
            let location = '';
            const locationEl = await card.$('.location, [class*="location"]');
            if (locationEl) {
              location = await locationEl.textContent() || '';
            }
            
            // Get salary
            let salary = '';
            const salaryEl = await card.$('.salary, [class*="salary"]');
            if (salaryEl) {
              salary = await salaryEl.textContent() || '';
            }
            
            // Get job type
            let jobType = '';
            const typeEl = await card.$('.type, .job-type, [class*="type"]');
            if (typeEl) {
              jobType = await typeEl.textContent() || '';
            }
            
            // Clean up values
            title = title.replace(/\s+/g, ' ').trim();
            location = location.replace(/\s+/g, ' ').trim();
            salary = salary.replace(/\s+/g, ' ').trim();
            jobType = jobType.replace(/\s+/g, ' ').trim();
            
            // Skip if title is "View job" or similar
            if (title.toLowerCase() === 'view job' || title.toLowerCase() === 'apply now' || title.length < 3) {
              // Try to get the job-id from the card directly
              jobId = await card.getAttribute('data-job-id') || await card.getAttribute('data-id') || jobId;
              
              if (!jobId) {
                // Generate from URL as last resort
                const urlMatch = jobUrl.match(/\/(\d+)[\/\?]?/);
                if (urlMatch) {
                  jobId = urlMatch[1];
                } else {
                  jobId = `morson-${Date.now()}-${i}`;
                }
              }
              
              title = `Job ${jobId}`;
            }
            
            if (jobUrl && !jobUrl.startsWith('http')) {
              jobUrl = `https://www.morson.com${jobUrl}`;
            }
            
            if (jobUrl) {
              jobsOnThisPage.push({
                jobId: jobId || `morson-${Date.now()}-${i}`,
                title: title,
                jobUrl: jobUrl,
                description: '',
                postedDate: '',
                jdDeadline: '',
                company: COMPANY,
                salaryRange: salary,
                employmentType: jobType,
                worktype: jobType,
                location: location,
                city: location ? location.split(',')[0].trim() : '',
                state: '',
                country: 'UK',
                ats: ATS
              });
            }
          } catch (e) {
            errors.push(`Error extracting job card ${i}: ${e.message}`);
          }
        }
        
        console.log(`Extracted ${jobsOnThisPage.length} jobs from page ${pageNum}`);
        allJobs.push(...jobsOnThisPage);
        
        // Check if there's a next page
        const nextButton = await page.$('a[href*="page=' + (pageNum + 1) + '"], .pagination a.next, .pagination-next a');
        if (!nextButton && jobsOnThisPage.length === 0) {
          console.log('No more pages available');
          break;
        }
        
      } catch (e) {
        console.error('Error extracting jobs from page:', e.message);
        errors.push(`Page ${pageNum} error: ${e.message}`);
      }
      
      pageNum++;
      await sleep(500);
    }
    
  } catch (error) {
    console.error('Error during scraping:', error.message);
    errors.push(`Main error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  // Remove duplicates by jobUrl
  const uniqueJobs = [];
  const seenUrls = new Set();
  for (const job of allJobs) {
    if (!seenUrls.has(job.jobUrl)) {
      seenUrls.add(job.jobUrl);
      uniqueJobs.push(job);
    }
  }
  
  console.log(`\nTotal unique jobs found: ${uniqueJobs.length}`);
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Save JSON
  const jsonPath = path.join(OUTPUT_DIR, 'jobs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(uniqueJobs, null, 2));
  console.log(`JSON saved to: ${jsonPath}`);
  
  // Save CSV
  const csvPath = path.join(OUTPUT_DIR, 'jobs.csv');
  const csvHeaders = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
  const escapeCSV = (str) => {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvRows = uniqueJobs.map(job => [
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
  ].join(','));
  
  fs.writeFileSync(csvPath, csvHeaders + '\n' + csvRows.join('\n'));
  console.log(`CSV saved to: ${csvPath}`);
  
  // Sample of first 3 jobs
  console.log('\n=== Sample of first 3 jobs ===');
  uniqueJobs.slice(0, 3).forEach((job, idx) => {
    console.log(`${idx + 1}. JobId: ${job.jobId}, Title: ${job.title}`);
    console.log(`   URL: ${job.jobUrl}`);
    console.log(`   Location: ${job.location || 'N/A'}`);
  });
  
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.slice(0, 10).forEach(e => console.log(`- ${e}`));
    if (errors.length > 10) console.log(`... and ${errors.length - 10} more`);
  }
  
  return { jobs: uniqueJobs, errors };
}

main().then((result) => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
