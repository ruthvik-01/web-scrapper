
const { chromium } = require('playwright');
const fs = require('fs');

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
      await page.waitForTimeout(1000);
      
      const text = await page.textContent('body');
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      
      // Extract job details
      const fullText = lines.join(' ');
      
      // Extract reference
      const refMatch = text.match(/([A-Z]{2}\d{7}[A-Z]+)/);
      const jobId = refMatch ? refMatch[1] : url.split('/').pop();
      
      // Extract title
      const titleMatch = fullText.match(/([A-Z][^(]+?)\s*(?:\(|\||\n|Location:)/);
      let title = titleMatch ? titleMatch[1].trim() : '';
      
      // Clean title from common prefixes
      const titleEl = await page.$('h1, .job-title');
      if (titleEl) {
        title = await titleEl.textContent();
        title = title.trim();
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
      
      // Extract description - first substantial paragraph
      const descMatch = fullText.match(/About the Role(.{100,500}?)(?:Why You|Benefits|For more)/is);
      let description = descMatch ? descMatch[1].trim() : '';
      if (description.length < 100) {
        const altMatch = fullText.match(/We are looking for[^\n]{100,300}/i);
        description = altMatch ? altMatch[0].trim() : '';
      }
      
      jobs.push({
        jobId,
        title,
        location,
        salary: salary || 'See description',
        closingDate,
        url,
        description: description.substring(0, 500)
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
  console.log(`\nScraped ${jobs.length} jobs`);
  console.log(JSON.stringify(jobs, null, 2));
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
