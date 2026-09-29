const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\morson';
const JSON_PATH = path.join(BASE, 'jobs.json');
const CSV_PATH = path.join(BASE, 'jobs.csv');
const BACKUP_JSON = path.join(BASE, 'jobs.json.bak');
const BACKUP_CSV = path.join(BASE, 'jobs.csv.bak');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parseDateText(dateText) {
  if (!dateText) return null;
  let m = dateText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = parseInt(m[1],10); const mo = parseInt(m[2],10); const y = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${y}`;
  }
  m = dateText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
  if (m) {
    const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    const d = parseInt(m[1],10); const mo = months[m[2].toLowerCase()]; const y = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${y}`;
  }
  m = dateText.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1],10); const mo = parseInt(m[2],10); const d = parseInt(m[3],10);
    return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${y}`;
  }
  return null;
}

(async () => {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('jobs.json not found in', BASE);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  let jobs;
  try { jobs = JSON.parse(raw); } catch (e) { console.error('Failed to parse jobs.json', e); process.exit(1); }

  fs.writeFileSync(BACKUP_JSON, raw, 'utf8');
  if (fs.existsSync(CSV_PATH)) fs.copyFileSync(CSV_PATH, BACKUP_CSV);
  console.log('Backups written. Jobs count:', jobs.length);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  const page = await context.newPage();

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`(${i+1}/${jobs.length}) ${job.jobUrl}`);
    try {
      await page.goto(job.jobUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(700);
      const body = await page.textContent('body') || '';

      // job ref
      let m = body.match(/Job\s*(?:ref(?:erence)?|reference)?\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
      if (!m) m = body.match(/(?:Ref|Reference)\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
      if (m && m[1]) {
        job.jobRef = m[1].trim();
        job.jobId = job.jobRef; // replace jobId with ref
      }

      // posted date
      m = body.match(/Posted(?: on)?\s*[:\-]?\s*([\d\w\s\/-]{6,30})/i);
      let posted = null;
      if (m && m[1]) posted = parseDateText(m[1].trim());
      if (!posted) {
        const dm = body.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
        if (dm) posted = parseDateText(dm[1]);
      }
      if (!posted) {
        const dm = body.match(/\b(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i);
        if (dm) posted = parseDateText(dm[1]);
      }
      if (posted) job.postedDate = posted;

      // if description short, try to capture
      if (!job.description || job.description.length < 50) {
        const desc = await page.$('.job-description, .description, .vacancy-description, article, main');
        if (desc) {
          job.description = (await desc.textContent()) || job.description || '';
          job.description = job.description.replace(/\s+/g, ' ').trim();
        }
      }

      // sleep small
      await sleep(300);
    } catch (e) {
      console.error('error fetching details for', job.jobUrl, e.message);
      await sleep(500);
    }
  }

  await browser.close();

  // write back JSON and CSV
  fs.writeFileSync(JSON_PATH, JSON.stringify(jobs, null, 2), 'utf8');
  console.log('Updated jobs.json written');

  // regenerate CSV
  const header = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
  const escapeCSV = (s) => {
    if (s == null) return '';
    s = String(s);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const rows = jobs.map(j => [j.jobId,j.title,j.description,j.jobUrl,j.postedDate,j.jdDeadline,j.company,j.salaryRange,j.employmentType,j.worktype,j.location,j.city,j.state,j.country,j.ats].map(escapeCSV).join(','));
  fs.writeFileSync(CSV_PATH, header + '\n' + rows.join('\n'), 'utf8');
  console.log('Updated jobs.csv written');

  // run normalization and combine script
  try {
    const { execSync } = require('child_process');
    execSync('node "D:\\Internship\\MAIN\\UK SCRAPPER\\normalize-and-verify-all.js"', { stdio: 'inherit', cwd: 'D:\\Internship\\MAIN\\UK SCRAPPER' });
  } catch (e) {
    console.error('Failed to run normalization script', e.message);
  }

  console.log('Done enriching morson details.');
})();
