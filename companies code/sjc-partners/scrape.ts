import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, Browser } from "playwright";

export interface CompanyJob {
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

const COMPANY_LABEL = "SJC Partners";
const COMPANY_SLUG = "sjc-partners";
const SOURCE_URL = "https://sjcpartners.com/jobs/";

// Cutoff date: 25-07-2026
const CUTOFF_DATE = new Date(2026, 6, 25);

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // D/M/YYYY or DD/MM/YYYY (JobAdder format)
  const shortFormat = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (shortFormat) {
    return new Date(parseInt(shortFormat[3]), parseInt(shortFormat[2]) - 1, parseInt(shortFormat[1]));
  }
  
  // DD-MM-YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
  }
  
  return null;
}

function extractEmploymentType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('permanent')) return 'Permanent';
  if (lower.includes('contract')) return 'Contract';
  if (lower.includes('temporary') || lower.includes('temp')) return 'Temporary';
  if (lower.includes('full-time') || lower.includes('full time')) return 'Full-time';
  if (lower.includes('part-time') || lower.includes('part time')) return 'Part-time';
  return '';
}

function extractSalary(text: string): string {
  const patterns = [
    /£[\d,]+(?:\.\d+)?(?:\s*-\s*£[\d,]+)?/gi,
    /\$[\d,]+(?:\.\d+)?(?:\s*-\s*\$[\d,]+)?/gi
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return '';
}

interface RawJob {
  title: string;
  summary: string;
  meta: string[];
}

async function scrapeSJCPartners(): Promise<CompanyJob[]> {
  let browser: Browser | null = null;
  const jobs: CompanyJob[] = [];
  
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    console.log(`Navigating to ${SOURCE_URL}...`);
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
    
    let pageNum = 1;
    let maxPages = 20;
    
    while (pageNum <= maxPages) {
      console.log(`Scraping page ${pageNum}...`);
      await page.waitForTimeout(2000);
      
      // Extract jobs using JobAdder structure
      const pageJobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll('.ja-job-list .job');
        return Array.from(jobElements).map((job): { title: string; summary: string; meta: string[] } => {
          const titleElem = job.querySelector('.title a');
          const summaryElem = job.querySelector('.summary');
          const metaParts = Array.from(job.querySelectorAll('.meta p')).map(p => p.textContent?.trim() || '');
          return {
            title: titleElem?.textContent?.trim() || '',
            summary: summaryElem?.textContent?.trim() || '',
            meta: metaParts
          };
        });
      });
      
      console.log(`  Found ${pageJobs.length} jobs`);
      
      // Process each job
      for (const rawJob of pageJobs) {
        const title = rawJob.title;
        const summary = rawJob.summary;
        const meta = rawJob.meta || [];
        
        // meta[0] = date, meta[1] = reference
        const dateStr = meta[0] || '';
        const reference = meta[1] || '';
        
        // Parse posted date
        const postedDate = parseDate(dateStr);
        const formattedDate = postedDate ? formatDate(postedDate) : '';
        
        // Check cutoff date
        if (postedDate && postedDate > CUTOFF_DATE) {
          console.log(`  Skipping ${title} - posted after cutoff`);
          continue;
        }
        
        // Generate job ID from reference or title
        const jobId = reference || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
        
        // Job URL - JobAdder uses # links, construct proper URL
        const jobUrl = `${SOURCE_URL}?job=${encodeURIComponent(reference || jobId)}`;
        
        const job: CompanyJob = {
          jobId,
          title,
          description: summary,
          jobUrl,
          postedDate: formattedDate,
          jdDeadline: '',
          company: COMPANY_LABEL,
          salaryRange: extractSalary(summary),
          employmentType: extractEmploymentType(summary),
          worktype: '',
          location: '',
          city: '',
          state: '',
          country: 'United Kingdom',
          ats: 'JobAdder'
        };
        
        jobs.push(job);
        console.log(`  Added: ${jobId} | ${title}`);
      }
      
      // Try to click next page
      let nextBtn = await page.$('.ja-pager .next:not(.disabled)');
      if (!nextBtn) {
        nextBtn = await page.$('.next:not(.disabled)');
      }
      if (!nextBtn) {
        nextBtn = await page.$('a.next');
      }
      
      if (nextBtn && await nextBtn.isVisible()) {
        await nextBtn.click();
        pageNum++;
        await page.waitForTimeout(3000);
      } else {
        console.log('No more pages');
        break;
      }
    }
    
    await browser.close();
    return jobs;
    
  } catch (error) {
    console.error("Scraper error:", error);
    if (browser) await browser.close();
    return jobs;
  }
}

function jobsToCSV(jobs: CompanyJob[]): string {
  const header = "jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats";
  if (jobs.length === 0) return header;
  
  const rows = jobs.map(job => {
    const esc = (v: string) => {
      if (!v) return "";
      const escaped = v.replace(/\n/g, " ").replace(/\r/g, "").replace(/"/g, '""');
      return escaped.includes(",") || escaped.includes('"') ? `"${escaped}"` : escaped;
    };
    return [esc(job.jobId), esc(job.title), esc(job.description), esc(job.jobUrl),
            esc(job.postedDate), esc(job.jdDeadline), esc(job.company), esc(job.salaryRange),
            esc(job.employmentType), esc(job.worktype), esc(job.location), esc(job.city),
            esc(job.state), esc(job.country), esc(job.ats)].join(",");
  });
  return [header, ...rows].join("\n");
}

async function main() {
  const outputDir = resolve("D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise", COMPANY_SLUG);
  
  console.log(`Scraping ${COMPANY_LABEL}...`);
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Output: ${outputDir}`);
  
  const jobs = await scrapeSJCPartners();
  
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "jobs.csv"), jobsToCSV(jobs), "utf8");
  await writeFile(resolve(outputDir, "jobs.json"), JSON.stringify(jobs, null, 2), "utf8");
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Company: ${COMPANY_LABEL}`);
  console.log(`Jobs found: ${jobs.length}`);
  console.log(`Output directory: ${outputDir}`);
  
  if (jobs.length > 0) {
    console.log(`\nFirst 3 jobs:`);
    jobs.slice(0, 3).forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.jobId} | ${job.title} | ${job.location || 'N/A'}`);
    });
  }
  
  console.log(`\nFiles created:`);
  console.log(`  - ${resolve(outputDir, "jobs.json")}`);
  console.log(`  - ${resolve(outputDir, "jobs.csv")}`);
}

main().catch(console.error);
