import { chromium } from 'playwright';
import * as fs from 'fs';
import PQueue from 'p-queue';

const CONFIG = {
  url: 'https://careers.farrow-ball.com/job-search?what=&where=USA&iso=us&lat=38.7945952&lng=-106.5348379&radius=30&custom=130-_131-#vacancies-section-filters',
  company: 'Farrow',
  refDate: '2026-08-14'
};

interface Job {
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

const cleanText = (text: string): string => text?.replace(/\s+/g, ' ')?.trim() || '';

const cleanDescription = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[\n\t\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseDate = (input: string): string | null => {
  if (!input) return null;

  // Handle YYYY-MM-DD format
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Handle MM/DD/YYYY format
  const usMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;

  return null;
};

const isValidDate = (dateStr: string, refDate: string): boolean => {
  const jobDate = new Date(dateStr);
  const ref = new Date(refDate);
  const thirtyDaysAgo = new Date(ref);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return jobDate >= thirtyDaysAgo && jobDate <= ref;
};

async function discover(): Promise<Partial<Job>[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: 'networkidle' });

  // Load all jobs by scrolling
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  const jobsFromApi = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('careersSiteVacancies')) {
        const match = text.match(/careersSiteVacancies\s*:\s*(\[.*?\])\s*[,}]/s);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch {}
        }
      }
    }
    return null;
  });

  await browser.close();

  if (jobsFromApi?.length) {
    return jobsFromApi.map((job: any) => ({
      jobId: String(job.jobPostId),
      title: job.jobTitle,
      jobUrl: `https://careers.farrow-ball.com/job/${job.jobPostId}`,
      postedDate: parseDate(job.dateCreated) || CONFIG.refDate,
      jdDeadline: parseDate(job.expiryDate) || "",
      location: job.address,
      country: job.country
    }));
  }

  return [];
}

async function scrape(job: Partial<Job>): Promise<Job | null> {
  if (!job.jobId || !job.jobUrl) return null;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(job.jobUrl, { waitUntil: 'networkidle' });

  const description = await page.locator('.vacancy-body,.vacancy-description').first().textContent();
  if (!description) {
    await browser.close();
    return null;
  }

  await browser.close();

  const locParts = job.location?.split(',')?.map(p => p.trim()) || [];
  const city = locParts[0] || '';
  const state = locParts[1] || '';
  const country = job.country || 'United States';

  const postedDate = job.postedDate || CONFIG.refDate;
  const jdDeadline = job.jdDeadline || '';

  // Mexico rule enforcement
  const isMexicoJob = ['Mexico', 'Mexico City', 'Monterrey', 'MX', 'New Mexico', 'NM'].some(term =>
    job.location?.includes(term) || city?.includes(term) || state?.includes(term) || country?.includes(term)
  );

  if (isMexicoJob) {
    return {
      jobId: job.jobId,
      title: cleanText(job.title),
      description: cleanDescription(description),
      jobUrl: job.jobUrl,
      postedDate: CONFIG.refDate,
      jdDeadline: jdDeadline,
      company: CONFIG.company,
      salaryRange: '',
      employmentType: '',
      worktype: '',
      location: job.location || '',
      city: city,
      state: 'NM',
      country: country.includes('Mexico') ? 'Mexico' : 'United States',
      ats: 'Custom'
    };
  }

  // Non-Mexico jobs: validate date range
  if (!isValidDate(postedDate, CONFIG.refDate)) return null;

  return {
    jobId: job.jobId,
    title: cleanText(job.title),
    description: cleanDescription(description),
    jobUrl: job.jobUrl,
    postedDate: postedDate,
    jdDeadline: jdDeadline,
    company: CONFIG.company,
    salaryRange: '',
    employmentType: '',
    worktype: '',
    location: job.location || '',
    city: city,
    state: state,
    country: country,
    ats: 'Custom'
  };
}

async function main() {
  console.log(`Company: ${CONFIG.company}`);
  const jobs = await discover();
  console.log(`Discovered: ${jobs.length}`);

  const queue = new PQueue({ concurrency: 5 });
  const results: (Job | null)[] = [];
  const errors: { jobId: string; error: string }[] = [];

  await Promise.all(
    jobs.map(job =>
      queue.add(async () => {
        try {
          const result = await scrape(job);
          results.push(result);
        } catch (error) {
          errors.push({ jobId: job.jobId || '', error: String(error) });
          results.push(null);
        }
      })
    )
  );

  const validJobs = results.filter(Boolean) as Job[];
  console.log(`Scraped: ${validJobs.length}`);

  const outputFile = `${CONFIG.company.toLowerCase()}_jobs.json`;
  fs.writeFileSync(outputFile, JSON.stringify(validJobs, null, 2));

  if (errors.length) {
    fs.writeFileSync(`${CONFIG.company.toLowerCase()}_errors.json`, JSON.stringify(errors, null, 2));
  }

  console.log(`JSON: ${outputFile}`);
}

main().catch(console.error);