const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:\\\\Internship\\\\MAIN\\\\UK SCRAPPER\\\\output\\\\2026-09-25-main-uk-scrape\\\\jobs company wise\\\\morson';
const BASE_URL = 'https://www.morson.com/jobs';
const COMPANY = 'Morson';
const ATS = 'Morson';

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
  let pageCount = 0;
  
  try {
    while (true) {
      const url = `${BASE_URL}?page=${pageNum}`;
      console.log(`\n--- Scraping page ${pageNum} ---`);
      console.log('Navigating to:', url);
      
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await sleep(2000);
      
      const pageTitle = await page.title();
      console.log('Page title:', pageTitle);
      
      const jobsOnThisPage = await page.$$eval('.job-card', (cards) => {
        return cards.map(card => {
          const link = card.querySelector('a');
          if (!link) return null;
          
          let jobUrl = link.getAttribute('href') || '';
          if (!jobUrl) return null;
          
          // Filter out non-job URLs
          if (jobUrl.includes('/taxonomy/') || 
              jobUrl.includes('/category/') ||
              jobUrl.includes('/search') ||
              jobUrl.endsWith('/jobs') ||
              jobUrl === '/' ||
              /\/\d+$/.test(jobUrl)) {
            return null;
          }
          
          // Must have /jobs/ in URL to be a valid job
          if (!jobUrl.includes('/jobs/')) {
            return null;
          }
          
          // Get title from card heading
          const heading = card.querySelector('h2, h3, a[href*="/jobs/"]');
          let title = heading ? (heading.textContent || '').trim() : '';
          
          // Get location
          const locationEl = card.querySelector('[class*="location"], .location');
          let location = locationEl ? locationEl.textContent.trim() : '';
          
          // Get salary
          const salaryEl = card.querySelector('[class*="salary"], .salary');
          let salary = salaryEl ? salaryEl.textContent.trim() : '';
          
          // Get job type
          const typeEl = card.querySelector('[class*="type"], .type');
          let jobType = typeEl ? typeEl.textContent.trim() : '';
          
          // Extract jobId from URL
          const urlParts = jobUrl.split('/').filter(p => p);
          const jobId = urlParts[urlParts.length - 1] || '';
          
          return {
            jobId,
            title: title || `Job ${jobId}`,
            jobUrl: jobUrl.startsWith('http') ? jobUrl : `https://www.morson.com${jobUrl}`,
            location,
            salary,
            jobType
          };
        }).filter(j => j !== null);
      });
      
      console.log(`Found ${jobsOnThisPage.length} valid job links on page ${pageNum}`);
      
      if (jobsOnThisPage.length === 0) {
        pageCount++;
        if (pageCount >= 2) {
          console.log('No jobs found for 2 consecutive pages. Stopping.');
          break;
        }
      } else {
        pageCount = 0;
        allJobs.push(...jobsOnThisPage);
      }
      
      pageNum++;
      
      if (pageNum > 50) {
        console.log('Reached maximum pages limit (50). Stopping.');
        break;
      }
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
      uniqueJobs.push({
        jobId: job.jobId,
        title: job.title,
        description: '',
        jobUrl: job.jobUrl,
        postedDate: '',
        jdDeadline: '',
        company: COMPANY,
        salaryRange: job.salary,
        employmentType: job.jobType,
        worktype: job.jobType,
        location: job.location,
        city: job.location ? job.location.split(',')[0].trim() : '',
        state: '',
        country: 'UK',
        ats: ATS
      });
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
    console.log(`${idx + 1}. JobId: ${job.jobId}`);
    console.log(`   Title: ${job.title}`);
    console.log(`   URL: ${job.jobUrl}`);
    console.log(`   Location: ${job.location || 'N/A'}`);
  });
  
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(e => console.log(`- ${e}`));
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
