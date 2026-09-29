
import { chromium } from 'playwright';
import fs from 'fs';

async function scrapeJobs() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const jobs = [];
  const jobUrls = [
    'https://careers.pwh.org.uk/job/947191',
    'https://careers.pwh.org.uk/job/939522',
    'https://careers.pwh.org.uk/job/939517',
    'https://careers.pwh.org.uk/job/943218',
    'https://careers.pwh.org.uk/job/943193'
  ];
  
  for (const url of jobUrls) {
    console.log(`Scraping ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const text = await page.textContent('body');
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      const fullText = lines.join(' ');
      
      // Extract reference
      const refMatch = text.match(/([A-Z]{2}\d{7}[A-Z]+)/);
      const jobId = refMatch ? refMatch[1] : url.split('/').pop();
      
      // Extract title from h1
      const titleEl = await page.$('h1');
      let title = jobId;
      if (titleEl) {
        title = await titleEl.textContent();
        title = title.trim().split('|')[0].trim();
      }
      
      // Extract location
      const locMatch = fullText.match(/Location[:\s]+([^E\n|]+)/i);
      const location = locMatch ? locMatch[1].trim() : 'The Prince of Wales Hospice';
      
      // Extract salary
      const salMatch = fullText.match(/Salary[:\s]+([£\d,\s-]+(?:per|pa|FTE))/i);
      const salary = salMatch ? salMatch[1].trim() : '';
      
      // Extract closing date
      const dateMatch = fullText.match(/Closing date[:\s]+([^\n]+)/i);
      const closingDate = dateMatch ? dateMatch[1].trim() : '';
      
      // Extract job type (first line with description-like content)
      let jobType = '';
      const hoursMatch = fullText.match(/Hours[:\s]+([^C\n]+)/i);
      if (hoursMatch) {
        jobType = hoursMatch[1].trim().split(/[A-Z]{2,}/)[0].trim();
      }
      
      jobs.push({
        jobId,
        title,
        location,
        salary: salary || 'See description',
        closingDate,
        jobType,
        url,
        fullText: fullText.substring(0, 2000)
      });
      
      console.log(`  Found: ${title} (${jobId})`);
    } catch (err) {
      console.error(`  Error scraping ${url}:`, err.message);
    }
  }
  
  await browser.close();
  return jobs;
}

scrapeJobs().then(jobs => {
  fs.writeFileSync('prince-of-wales-jobs.json', JSON.stringify(jobs, null, 2));
  console.log(`\n=== SCRAPED ${jobs.length} JOBS ===`);
  jobs.forEach((j, i) => {
    console.log(`\n${i+1}. ${j.title}`);
    console.log(`   ID: ${j.jobId}`);
    console.log(`   Location: ${j.location}`);
    console.log(`   Salary: ${j.salary}`);
    console.log(`   Closing: ${j.closingDate}`);
  });
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
