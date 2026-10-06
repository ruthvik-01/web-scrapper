
import { chromium } from 'playwright';
import fs from 'fs';

async function scrapeJobs() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const jobs = [];
  const seenUrls = new Set();
  
  // Start at careers page
  await page.goto('https://careers.pwh.org.uk/', { waitUntil: 'networkidle' });
  
  let pageNum = 1;
  let hasNextPage = true;
  
  while (hasNextPage) {
    console.log(`\n=== Processing page ${pageNum} ===`);
    await page.waitForTimeout(2000);
    
    // Get all job URLs on current page
    const pageUrls = await page.$$eval('a[href*="/job/"]', links => {
      const urls = [];
      links.forEach(a => {
        const href = a.href;
        if (href.match(/\/job\/\d+$/) && !urls.includes(href)) {
          urls.push(href);
        }
      });
      return urls;
    });
    
    console.log(`Found ${pageUrls.length} jobs on page ${pageNum}`);
    
    // Add new URLs to list
    for (const url of pageUrls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        console.log(`  ${url}`);
      }
    }
    
    // Check for Next/» button
    const nextButton = await page.$('text="»", text="›", a:has-text("Next")');
    
    if (nextButton) {
      const isDisabled = await nextButton.getAttribute('class');
      if (isDisabled && isDisabled.includes('disabled')) {
        console.log('Next button is disabled, stopping');
        hasNextPage = false;
      } else {
        console.log('Clicking next page...');
        await nextButton.click();
        await page.waitForTimeout(2000);
        pageNum++;
      }
    } else {
      // Try pagination number links
      const paginationLinks = await page.$$eval('a[href*="?page="], .pagination a', links => {
        return links.map(l => ({ text: l.textContent?.trim(), href: l.href }));
      });
      
      const nextLink = paginationLinks.find(l => {
        const num = parseInt(l.text);
        return !isNaN(num) && num === pageNum + 1;
      });
      
      if (nextLink) {
        console.log(`Going to page ${pageNum + 1}...`);
        await page.goto(nextLink.href, { waitUntil: 'networkidle' });
        pageNum++;
      } else {
        console.log('No more pages found');
        hasNextPage = false;
      }
    }
    
    // Safety limit
    if (pageNum > 20) {
      console.log('Reached page limit, stopping');
      break;
    }
  }
  
  console.log(`\nTotal unique job URLs: ${seenUrls.size}`);
  
  // Now scrape each job
  const allUrls = Array.from(seenUrls);
  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    console.log(`\n[${i+1}/${allUrls.length}] Scraping ${url}...`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      
      const text = await page.textContent('body');
      const fullText = text.split('\n').map(l => l.trim()).filter(l => l).join(' ');
      
      // Extract reference
      const refMatch = text.match(/([A-Z]{2}\d{7}[A-Z]+)/);
      const jobId = refMatch ? refMatch[1] : url.split('/').pop();
      
      // Extract title
      const titleEl = await page.$('h1');
      let title = jobId;
      if (titleEl) {
        title = await titleEl.textContent();
        title = title.trim().split('|')[0].trim();
      }
      
      // Extract location
      const locMatch = fullText.match(/Location[:\s]+([^E\n|]{5,50}?)/i);
      const location = locMatch ? locMatch[1].trim() : 'Pontefract, West Yorkshire';
      
      // Extract salary
      const salMatch = fullText.match(/Salary[:\s]+([£\d,\s-]+(?:per|pa|FTE|annum)?)/i);
      const salary = salMatch ? salMatch[1].trim() : 'See description';
      
      // Extract closing date
      const dateMatch = fullText.match(/Closing date[:\s]+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
      let closingDate = '';
      if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        try {
          const date = new Date(`${day} ${month} ${year}`);
          closingDate = date.toISOString().split('T')[0];
        } catch (e) {}
      }
      
      // Extract hours/contract type
      const hoursMatch = fullText.match(/Hours[:\s]+([^C]{5,100}?)(?:Contract|Are you|$)/i);
      const jobType = hoursMatch ? hoursMatch[1].trim().substring(0, 100) : 'Permanent';
      
      jobs.push({
        jobId,
        title,
        location: 'Pontefract, West Yorkshire',
        salary,
        closingDate,
        jobType: jobType.includes('Permanent') ? 'Permanent' : 'Contract',
        url
      });
      
      console.log(`  ✓ ${title}`);
      console.log(`    Salary: ${salary}`);
      console.log(`    Closing: ${closingDate}`);
      
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }
  
  await browser.close();
  
  fs.writeFileSync('prince-of-wales-all-jobs.json', JSON.stringify(jobs, null, 2));
  console.log(`\n=== SCRAPED ${jobs.length} TOTAL JOBS ===`);
  
  return jobs;
}

scrapeJobs().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
