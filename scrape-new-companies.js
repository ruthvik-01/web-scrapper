const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RUN_OUTPUT = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise';
const CUTOFF = new Date('2026-07-25');

const COMPANIES = [
  {
    name: 'Mayra Property Services',
    slug: 'mayra-property-services',
    careerUrl: 'https://wearemayra.com/en/karriere',
    ats: 'Custom',
    industry: 'Real Estate & Property',
    region: 'Greater London', city: 'London', country: 'United Kingdom'
  },
  {
    name: 'Mega food centre',
    slug: 'mega-food-centre',
    careerUrl: 'https://www.megacentrerayleigh.co.uk/recruitment',
    ats: 'Custom',
    industry: 'Hospitality & Food Service',
    region: 'Greater London', city: 'London', country: 'United Kingdom'
  },
  {
    name: 'Mountain Healthcare Ltd',
    slug: 'mountain-healthcare-ltd',
    careerUrl: 'https://mountainhealthcare.co.uk/careers',
    ats: 'Custom',
    industry: 'Healthcare & Social Care',
    region: 'Buckinghamshire', city: 'Milton Keynes', country: 'United Kingdom'
  },
  {
    name: 'Northwood Hygiene Products Limited',
    slug: 'northwood-hygiene-products-limited',
    careerUrl: 'https://www.northwood.co.uk/careers',
    ats: 'Custom',
    industry: 'Other Services',
    region: 'Buckinghamshire', city: 'Milton Keynes', country: 'United Kingdom'
  }
];

function cleanText(t) { if (!t) return ''; return t.replace(/\s+/g,' ').trim(); }
function escapeCSV(s) { if (s==null) return ''; s=String(s); if (s.includes(',')||s.includes('"')||s.includes('\n')) return '"'+s.replace(/"/g,'""')+'"'; return s; }

async function scrapeCompany(company) {
  const outDir = path.join(RUN_OUTPUT, company.slug);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ timeout: 60000 });
  const jobs = [];
  try {
    console.log('Visiting', company.careerUrl);
    await page.goto(company.careerUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1500);

    // collect candidate links
    const anchors = await page.$$eval('a', as => as.map(a => ({href: a.href, text: a.textContent || ''})));
    const candidates = anchors.filter(a => a.href && (a.href.toLowerCase().includes('/job') || a.href.toLowerCase().includes('vacanc') || a.href.toLowerCase().includes('/careers/') || a.href.toLowerCase().includes('/jobs/') || a.text.toLowerCase().includes('apply') || a.text.toLowerCase().includes('vacancy'))).map(a=>a.href);
    const uniq = Array.from(new Set(candidates));
    console.log('Found candidate links:', uniq.length);

    for (let i=0;i<uniq.length;i++) {
      const url = uniq[i];
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(800);
        const title = cleanText(await page.title()) || cleanText(await page.$eval('h1', el=>el.textContent).catch(()=>''));
        let description = '';
        try { description = cleanText(await page.$eval('.job-description, .description, article, main', el=>el.textContent)); } catch(e) { description = (await page.textContent('body')) || ''; description = cleanText(description).slice(0,8000); }
        // job ref
        const body = await page.textContent('body') || '';
        let m = body.match(/Job\s*(?:ref(?:erence)?|reference)?\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
        if (!m) m = body.match(/(?:Ref|Reference)\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
        const jobRef = m && m[1] ? m[1].trim() : null;
        // posted date
        m = body.match(/Posted(?: on)?\s*[:\-]?\s*([\d\w\s\/-]{6,30})/i);
        let posted = null;
        if (m && m[1]) posted = m[1].trim();
        else {
          m = body.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
          if (m) posted = m[1];
          else {
            m = body.match(/(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
            if (m) posted = m[1];
          }
        }
        // salary
        let salary = '';
        const salMatch = body.match(/£[\d,]+(?:\s*[-–]\s*£?[\d,]+)?(?:\s*(?:per\s+annum|per\s+year|pa|p\.a\.|per\s+hour|per\s+day|pd|day))?/i);
        if (salMatch) salary = salMatch[0];

        const jobId = jobRef || url.split('/').filter(p=>p).pop() || require('crypto').createHash('md5').update(url).digest('hex').slice(0,8);

        // apply postedDate filter if parsed and older than cutoff
        let postedDate = '';
        if (posted) {
          postedDate = posted;
          // try to parse dd/mm/yyyy
          const mm = posted.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (mm) {
            const d = parseInt(mm[1],10), mo = parseInt(mm[2],10)-1, y = parseInt(mm[3],10);
            const pd = new Date(y,mo,d);
            if (pd < CUTOFF) { console.log('Skipping older job', jobId); continue; }
          }
        }

        jobs.push({ jobId, title, description, jobUrl: url, postedDate, jdDeadline: '', company: company.name, salaryRange: salary, employmentType: '', worktype: '', location: company.region || '', city: company.city || '', state: '', country: company.country || '', ats: company.ats });
        console.log('Saved job:', jobId, title.substring(0,60));
      } catch (e) {
        console.error('Error scraping job URL', url, e.message);
      }
    }

  } catch (e) {
    console.error('Error scraping company', company.name, e.message);
  } finally {
    await page.close();
    await browser.close();
  }

  // write jobs.json and jobs.csv
  const jsonPath = path.join(outDir, 'jobs.json');
  const csvPath = path.join(outDir, 'jobs.csv');
  fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), 'utf8');
  const header = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
  const rows = jobs.map(j => [j.jobId,j.title,j.description,j.jobUrl,j.postedDate,j.jdDeadline,j.company,j.salaryRange,j.employmentType,j.worktype,j.location,j.city,j.state,j.country,j.ats].map(escapeCSV).join(','));
  fs.writeFileSync(csvPath, header + '\n' + rows.join('\n'), 'utf8');
  console.log('Wrote outputs for', company.name, 'jobs:', jobs.length);
}

(async () => {
  for (const c of COMPANIES) {
    await scrapeCompany(c);
  }
  // run normalize and combine
  try { const { execSync } = require('child_process'); execSync('node "normalize-and-verify-all.js"', { stdio: 'inherit', cwd: path.join('D:\\Internship\\MAIN\\UK SCRAPPER') }); } catch(e){ console.error('Normalization run failed', e.message); }
})();
