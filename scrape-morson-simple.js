const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:\\\\Internship\\\\MAIN\\\\UK SCRAPPER\\\\output\\\\2026-09-25-main-uk-scrape\\\\jobs company wise\\\\morson';
const BASE_URL = 'https://www.morson.com/jobs';
const COMPANY = 'Morson';
const ATS = 'Morson';
const CUTOFF_DATE = new Date('2026-07-25');

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
  
  try {
    console.log('Navigating to:', BASE_URL);
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
    console.log('Page loaded');
    
    await sleep(3000);
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    
    // Try multiple selectors
    const selectors = ['.job-card', '.vacancy-item', 'article.job', '.search-result', '.job-result', '[data-job-id]', '.listing', '.vacancy', '.job-listing', '.result'];
    let jobCards = [];
    
    for (const selector of selectors) {
      try {
        jobCards = await page.$$(selector);
        if (jobCards.length > 0) {
          console.log(`Found ${jobCards.length} jobs using selector: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    // If no direct selectors work, try finding all links that look like jobs
    if (jobCards.length === 0) {
      console.log('No standard job cards found. Looking for job links...');
      const links = await page.$$eval('a', (anchors) => {
        return anchors
          .filter(a => {
            const href = a.getAttribute('href') || '';
            const text = a.textContent || '';
            return (href.includes('/job/') || href.includes('/vacanc') || href.includes('/career')) && text.trim().length > 10;
          })
          .slice(0, 50) // Limit to first 50
          .map(a => ({
            url: a.getAttribute('href') || '',
            title: a.textContent.trim()
          }));
      });
      
      console.log(`Found ${links.length} potential job links`);
      
      for (const link of links) {
        const jobId = link.url.split('/').filter(p => p).pop() || '';
        const jobUrl = link.url.startsWith('http') ? link.url : `https://www.morson.com${link.url}`;
        
        if (jobId && jobUrl) {
          allJobs.push({
            jobId,
            title: link.title,
            jobUrl,
            description: '',
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
          });
        }
      }
    } else {
      // Extract from job cards
      for (const card of jobCards) {
        try {
          const link = await card.$('a');
          if (link) {
            const jobUrl = await link.getAttribute('href') || '';
            const title = await link.textContent() || '';
            const urlParts = jobUrl.split('/').filter(p => p);
            const jobId = urlParts[urlParts.length - 1] || '';
            
            if (jobUrl && title) {
              allJobs.push({
                jobId: jobId || `morson-${Date.now()}`,
                title: title.trim(),
                jobUrl: jobUrl.startsWith('http') ? jobUrl : `https://www.morson.com${jobUrl}`,
                description: '',
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
              });
            }
          }
        } catch (e) {
          errors.push(`Error extracting job card: ${e.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error during scraping:', error.message);
    errors.push(`Main error: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  console.log(`\nTotal jobs found: ${allJobs.length}`);
  
  // Create output directory
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
  const escapeCSV = (str) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvRows = allJobs.map(job => [
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
  allJobs.slice(0, 3).forEach((job, idx) => {
    console.log(`${idx + 1}. JobId: ${job.jobId}, Title: ${job.title}, Location: ${job.location || 'N/A'}`);
  });
  
  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(e => console.log(`- ${e}`));
  }
}

main().then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
