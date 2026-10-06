const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapePRDC() {
  console.log('🦷 PRDC Dental scraper starting...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const allJobs = [];
  const BASE_URL = 'https://careers.rodericksdentalpartners.co.uk';
  
  try {
    // Navigate to search page
    console.log('📄 Loading jobs search page...');
    await page.goto(`${BASE_URL}/jobs/search`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Find total pages
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
    
    console.log(`Found ${totalPages} pages to scrape`);
    
    // Scrape each page
    for (let pg = 1; pg <= totalPages; pg++) {
      console.log(`\n📄 Page ${pg}/${totalPages}`);
      
      if (pg > 1) {
        await page.goto(`${BASE_URL}/jobs/search/-1/${pg}`, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
      }
      
      // Extract jobs from this page
      const jobs = await page.evaluate((pageNum) => {
        const items = document.querySelectorAll('ul.jobs > li');
        const jobs = [];
        
        items.forEach(li => {
          const a = li.querySelector('a[href*="/jobs/job/"]');
          if (!a) return;
          
          const titleEl = li.querySelector('.job-list-title');
          const locationEl = li.querySelector('[itemprop="jobLocation"]');
          
          const urlMatch = a.href.match(/\/(\d+)(?:$|\?)/);
          const jobId = urlMatch ? urlMatch[1] : '';
          
          const fullText = li.textContent.trim();
          
          let contractType = '';
          if (fullText.includes('Full Time')) contractType = 'Full Time';
          else if (fullText.includes('Part Time')) contractType = 'Part Time';
          else {
            const seMatch = fullText.match(/(SE - [A-Za-z ]+)/);
            if (seMatch) contractType = seMatch[1].trim();
          }
          
          let salary = '';
          const salaryMatch = fullText.match(/(Competitive(?:\s+Salary)?|£[\d,]+(?:\s*-\s*£[\d,]+)?)/i);
          if (salaryMatch) salary = salaryMatch[1];
          
          jobs.push({
            jobId,
            title: titleEl ? titleEl.textContent.trim() : '',
            url: a.href,
            location: locationEl ? locationEl.textContent.trim() : '',
            contractType,
            salary,
            company: 'PRDC Dental',
            country: 'United Kingdom',
            page: pageNum
          });
        });
        
        return jobs;
      }, pg);
      
      console.log(`  Found ${jobs.length} jobs`);
      allJobs.push(...jobs);
      
      await page.waitForTimeout(1000);
    }
    
    console.log(`\n✅ Collected ${allJobs.length} jobs from all pages\n`);
    
    // Now scrape details for each job
    for (let i = 0; i < allJobs.length; i++) {
      const job = allJobs[i];
      process.stdout.write(`\r[${i + 1}/${allJobs.length}] Fetching: ${job.jobId} - ${job.title.substring(0, 40)}`);
      
      try {
        await page.goto(job.url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(800);
        
        const details = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const s of scripts) {
            try {
              const data = JSON.parse(s.textContent);
              if (data['@type'] === 'JobPosting') {
                return {
                  company: data.hiringOrganization?.name || 'Rodericks Dental Partners',
                  town: data.jobLocation?.address?.addressLocality || '',
                  county: data.jobLocation?.address?.addressRegion || '',
                  postcode: data.jobLocation?.address?.postalCode || '',
                  datePosted: data.datePosted || '',
                  validThrough: data.validThrough || ''
                };
              }
            } catch {}
          }
          return {};
        });
        
        Object.assign(job, details);
        
      } catch (err) {
        console.log(`\n  Error: ${err.message}`);
      }
      
      await page.waitForTimeout(500);
    }
    
  } finally {
    await browser.close();
  }
  
  // Save results
  const outputDir = path.join('D:', 'Internship', 'MAIN', 'UK SCRAPPER', 'output', 'prdc-dental-2026-09-24');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // JSON
  const jsonPath = path.join(outputDir, 'prdc_dental_jobs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allJobs, null, 2));
  
  // CSV
  const csvPath = path.join(outputDir, 'prdc_dental_jobs.csv');
  const header = 'jobId,title,url,company,location,town,county,country,industry,sector,datePosted,validThrough,contractType,salary,description';
  const rows = allJobs.map(job => {
    const loc = (job.location || '').replace(', United Kingdom', '').trim();
    const parts = loc.split(',');
    const town = parts[0]?.trim() || job.town || '';
    const county = parts.length > 1 ? parts[parts.length - 1].trim() : job.county || '';
    
    return [
      job.jobId,
      `"${(job.title || '').replace(/"/g, '""')}"`,
      job.url,
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
    ].join(',');
  });
  
  fs.writeFileSync(csvPath, [header, ...rows].join('\n'));
  
  console.log(`\n\n✅ Saved ${allJobs.length} jobs`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   CSV: ${csvPath}`);
}

scrapePRDC().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
