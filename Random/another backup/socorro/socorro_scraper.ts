import { chromium, Browser } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();
const CONFIG = {
  url: "https://socorro.tedk12.com/hire/index.aspx",
  company: "Socorro Consolidated School District",
  refDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  concurrency: 5
};

interface Job {
  jobId: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate: string;
  jdDeadline: string | null;
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

interface PartialJob {
  jobId: string;
  title: string;
  jobUrl: string;
  location: string;
  postedText: string;
  employmentType: string;
}

interface ErrorRecord {
  jobId: string;
  error: string;
}

const MEXICO_COUNTRY = ["mexico city", "monterrey", "mx"];
const MEXICO_NM = ["new mexico", "nm"];

function cleanDescription(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join(", ");
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidate = [
      record.name, record.streetAddress, record.addressLocality,
      record.addressRegion, record.addressCountry, record.value, record.text
    ].find(item => plain(item));
    return candidate ? plain(candidate) : "";
  }
  return String(value).trim();
}

function toDate(value: unknown): string | null {
  const text = plain(value);
  if (!text) return null;
  const mdy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function inWindow(postedDate: string): boolean {
  const posted = new Date(`${postedDate}T00:00:00Z`).getTime();
  const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
  return posted >= ref - 30 * 86400000 && posted <= ref;
}

// FIX: Separate Mexico country detection from New Mexico state detection
function isMexicoCountry(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return MEXICO_COUNTRY.some(term => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function isNewMexico(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return MEXICO_NM.some(term => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

// Mexico rule filter: include if ANY Mexico/NM indicator present
function hasMexicoIndicator(...values: string[]): boolean {
  return isMexicoCountry(...values) || isNewMexico(...values);
}

async function discover(browser: Browser): Promise<PartialJob[]> {
  const page = await browser.newPage();
  try {
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(`
      (() => {
        const rows = Array.from(document.querySelectorAll('tr[id^="JobList_"]'));
        const jobs = [];
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 4) continue;
          const link = cells[0].querySelector('a[href]');
          if (!link) continue;
          const href = link.getAttribute('href') || '';
          const title = (link.textContent || '').trim().replace(/^\\*+\\s*/, '');
          const postedDate = cells[1].textContent?.trim() || '';
          const employmentType = cells[2].textContent?.trim() || '';
          const location = cells[3].textContent?.trim() || '';
          let fullUrl = href;
          try { fullUrl = new URL(href, window.location.href).href; } catch(e) { continue; }
          const idMatch = fullUrl.match(/jobid=(\\d+)/i);
          const jobId = idMatch ? idMatch[1] : '';
          if (jobId && title) {
            jobs.push({ jobId, title, jobUrl: fullUrl, location, postedText: postedDate, employmentType });
          }
        }
        return jobs;
      })()
    `);
    return (result || []) as PartialJob[];
  } finally {
    await page.close();
  }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
  const page = await browser.newPage();
  try {
    await page.goto(partial.jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const pageData = await page.evaluate(`
      (() => {
        const loc = document.querySelector('#lblLocationName')?.textContent?.trim() || '';
        const sal = document.querySelector('#lblSalary')?.textContent?.trim() || '';
        const shift = document.querySelector('#lblShiftType')?.textContent?.trim() || '';
        return { location: loc, salary: sal, employment: shift };
      })()
    `);

    let description = "";
    const descFrame = page.frames().find(f => f.url().includes('ViewJob_Description.aspx'));
    if (descFrame) {
      description = await descFrame.evaluate(`document.body?.innerText || ''`);
    } else {
      const iframeSrc = await page.evaluate(`
        (() => {
          const iframe = document.querySelector('iframe[src*="ViewJob_Description"]') || document.querySelector('#ifJobDescriptoin');
          return iframe ? iframe.src : '';
        })()
      `);
      if (iframeSrc) {
        const framePage = await browser.newPage();
        try {
          await framePage.goto(iframeSrc, { waitUntil: "domcontentloaded", timeout: 30000 });
          description = await framePage.evaluate(`document.body?.innerText || ''`);
        } finally {
          await framePage.close();
        }
      }
    }

    description = cleanDescription(description);
    if (!description || description.length < 100) return null;

    const parsedPosted = toDate(partial.postedText);
    const deadlineValue = null;

    const location = pageData.location || partial.location || "Socorro, NM";
    const city = location.split(",")[0].trim();
    let state = "NM";
    let country = "USA";

    // FIX: Only set country to "Mexico" for actual Mexico country indicators
    const mexicoCountry = isMexicoCountry(location, city, state, country, partial.location);
    const newMexico = isNewMexico(location, city, state, country, partial.location);

    if (mexicoCountry) {
      state = "NM";
      country = "Mexico";
    } else if (newMexico) {
      state = "NM";
      country = "USA";
    }

    // Mexico rule: if both dates missing, only include jobs with Mexico/NM indicators
    if (!parsedPosted && !deadlineValue && !hasMexicoIndicator(location, city, state, country, partial.location)) return null;

    const postedDate = parsedPosted || CONFIG.refDate;
    if (!inWindow(postedDate)) return null;

    return {
      jobId: partial.jobId,
      title: partial.title,
      description,
      jobUrl: partial.jobUrl,
      postedDate,
      jdDeadline: deadlineValue,
      company: CONFIG.company,
      salaryRange: pageData.salary || "Per Year",
      employmentType: pageData.employment || partial.employmentType || "Full-Time",
      worktype: "",
      location,
      city,
      state,
      country,
      ats: "Custom"
    };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const discovered = await discover(browser);
    const queue = new PQueue({ concurrency: CONFIG.concurrency });
    const errors: ErrorRecord[] = [];

    const results = await Promise.all(
      discovered.map(partial =>
        queue.add(async () => {
          try { return await scrape(browser, partial); }
          catch (error) { errors.push({ jobId: partial.jobId, error: String(error) }); return null; }
        })
      )
    );

    const seen = new Set<string>();
    const jobs = results.filter((job): job is Job => {
      if (!job) return false;
      if (seen.has(job.jobId)) return false;
      seen.add(job.jobId);
      if (job.ats !== "Custom") return false;
      return [job.jobId, job.title, job.description, job.jobUrl, job.postedDate, job.company].every(field => field.trim().length > 0);
    });

    const filename = `${CONFIG.company.replace(/[\s&]+/g, "_")}_jobs.json`;
    await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));
    if (errors.length) await fs.promises.writeFile(`${CONFIG.company.replace(/[\s&]+/g, "_")}_errors.json`, JSON.stringify(errors, null, 2));

    console.log(`Company: ${CONFIG.company}`);
    console.log(`Discovered: ${discovered.length}`);
    console.log(`Scraped: ${jobs.length}`);
    console.log(`JSON: ${filename}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => console.error(String(error)));