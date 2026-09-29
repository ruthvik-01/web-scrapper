import { chromium, Browser } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();

const CONFIG = {
  url: "https://www.garverusa.com/careers/job-listings",
  company: "Garver",
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
}

interface ErrorRecord {
  jobId: string;
  error: string;
}

interface PageData {
  posted: string;
  deadline: string;
  salary: string;
  employment: string;
  worktype: string;
  location: string;
  subhead: string;
}

function cleanDescription(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/Apply Now.*$/i, "")
    .replace(/Get In Touch.*$/i, "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const mapped = [];
    for (let i = 0; i < value.length; i++) {
      const p = plain(value[i]);
      if (p) mapped.push(p);
    }
    return mapped.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.name,
      record.streetAddress,
      record.addressLocality,
      record.addressRegion,
      record.addressCountry,
      record.value,
      record.text
    ];
    for (let i = 0; i < candidates.length; i++) {
      const p = plain(candidates[i]);
      if (p) return p;
    }
    return "";
  }
  return String(value).trim();
}

function toDate(value: unknown): string | null {
  const text = plain(value);
  if (!text) return null;

  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toDeadline(value: unknown): string | null {
  const text = plain(value);
  if (!text || /open until filled|immediate start/i.test(text)) return null;
  return toDate(text);
}

function inWindow(postedDate: string): boolean {
  const posted = new Date(`${postedDate}T00:00:00Z`).getTime();
  const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
  return posted >= ref - 30 * 86400000 && posted <= ref;
}

function isNMState(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return /\bnew\s+mexico\b|\bnm\b/.test(text);
}

function isMxCountry(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase().replace(/new\s+mexico/g, "").replace(/\bnm\b/g, "");
  return /\bmexico\b|\bmx\b|\bmexico\s+city\b|\bmonterrey\b/.test(text);
}

function locationParts(value: string): { city: string; state: string } {
  const parts = [];
  const rawParts = value.split(",");
  for (let i = 0; i < rawParts.length; i++) {
    const trimmed = rawParts[i].trim();
    if (trimmed) parts.push(trimmed);
  }
  return { city: parts[0] || "", state: parts[1] || "" };
}

function salaryRange(schema: any, fallback: string): string {
  const base = schema?.baseSalary;
  if (!base) return fallback.trim();

  const values = Array.isArray(base.value) ? base.value : [base.value];
  const amounts = [];
  for (let i = 0; i < values.length; i++) {
    const item = values[i];
    const val = plain(
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).amount ?? item
        : item
    );
    if (val) amounts.push(val);
  }

  if (amounts.length) return amounts.join(" - ");

  const min = plain(base.minValue ?? base.minSalary);
  const max = plain(base.maxValue ?? base.maxSalary);
  if (min || max) return [min, max].filter(Boolean).join(" - ");

  return plain(base) || fallback.trim();
}

function parseJobAnchors(anchors: Element[]): PartialJob[] {
  const results = [];
  for (let i = 0; i < anchors.length; i++) {
    const link = anchors[i] as HTMLAnchorElement;
    const title =
      link.textContent?.trim() ||
      link.getAttribute("aria-label")?.trim() ||
      link.getAttribute("title")?.trim() ||
      "";

    const href = link.href;
    if (!title || !href) continue;
    if (!/\/careers\/jobdescription\//i.test(href)) continue;
    if (/open mobile|close window|apply|view all|share|print|get in touch|menu/i.test(title)) continue;

    let jobId = "";
    let location = "";

    try {
      const url = new URL(href);
      jobId = url.searchParams.get("gni") || "";

      const row = link.closest("tr");
      if (row) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length >= 3) {
          const city = (cells[1] as HTMLElement).innerText?.trim() || "";
          const stateTxt = (cells[2] as HTMLElement).innerText?.trim() || "";
          const parts = [];
          if (city) parts.push(city);
          if (stateTxt) parts.push(stateTxt);
          location = parts.join(", ");
        }
      }

      if (!location) {
        const clean = [];
        const rawSegs = url.pathname.split("/");
        for (let j = 0; j < rawSegs.length; j++) if (rawSegs[j]) clean.push(rawSegs[j]);
        let idx = -1;
        for (let j = 0; j < clean.length; j++) if (/jobdescription/i.test(clean[j])) idx = j;
        if (idx !== -1 && clean.length >= idx + 4) {
          const st = decodeURIComponent(clean[idx + 2]);
          const ct = decodeURIComponent(clean[idx + 3]);
          const parts = [];
          if (ct && !/^remote$/i.test(ct)) parts.push(ct);
          if (st && !/^none$/i.test(st)) parts.push(st);
          location = parts.join(", ");
        }
      }

      if (!jobId) jobId = `${url.pathname}${url.search}`.replace(/\/+$/, "") || href;
    } catch (e) {
      jobId = jobId || href;
    }

    if (jobId && title) results.push({ jobId, title, jobUrl: href, location });
  }
  return results;
}

function parseSchemaScripts(): any {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const text = script.textContent?.trim();
    if (!text) continue;

    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
      let posting = null;
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        const type = item?.["@type"];
        if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
          posting = item;
          break;
        }
      }
      if (posting) return posting;
    } catch { }
  }
  return null;
}

function parseDomDescription(): string {
  const selectors = [
    '[itemprop="description"]',
    ".description",
    "#description",
    ".job-description",
    ".job-description-content",
    ".job-details",
    ".content",
    "main article",
    "article",
    "main",
    '[role="main"]'
  ];

  let longest = "";
  for (let i = 0; i < selectors.length; i++) {
    const elements = document.querySelectorAll(selectors[i]);
    for (let j = 0; j < elements.length; j++) {
      const text = (elements[j] as HTMLElement).innerText.trim();
      if (text.length > 80 && text.length > longest.length) longest = text;
    }
  }
  return longest;
}

function parsePageData(): PageData {
  const text = document.body?.innerText || "";

  const postedMatch = text.match(/(?:^|\n)\s*(?:posted|posting date|date posted)\s*:\s*([^\n]+)/i);
  const deadlineMatch = text.match(/(?:^|\n)\s*(?:closing date|deadline|closing|valid through)\s*:\s*([^\n]+)/i);
  const salaryMatch = text.match(/(?:^|\n)\s*(?:salary|compensation|pay rate|hourly rate)\s*:\s*([^\n]+)/i);
  const employmentMatch = text.match(/(?:^|\n)\s*(?:employment type|job type|type)\s*:\s*([^\n]+)/i);
  const worktypeMatch = text.match(/(?:^|\n)\s*(?:worktype|work type|location type)\s*:\s*([^\n]+)/i);
  const locationMatch = text.match(/(?:^|\n)\s*(?:location|office)\s*:\s*([^\n]+)/i);

  const h2 = document.querySelector("h2");
  const subhead = h2 ? h2.textContent?.trim() || "" : "";

  return {
    posted: postedMatch ? postedMatch[1].trim() : "",
    deadline: deadlineMatch ? deadlineMatch[1].trim() : "",
    salary: salaryMatch ? salaryMatch[1].trim() : "",
    employment: employmentMatch ? employmentMatch[1].trim() : "",
    worktype: worktypeMatch ? worktypeMatch[1].trim() : "",
    location: locationMatch ? locationMatch[1].trim() : "",
    subhead
  };
}

async function discover(browser: Browser): Promise<PartialJob[]> {
  const page = await browser.newPage();
  console.log(`[Discover] Opening ${CONFIG.url}...`);

  try {
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(function () { });

    const jobs = new Map<string, PartialJob>();

    async function extractJobs(): Promise<PartialJob[]> {
      return page.$$eval("a[href]", parseJobAnchors);
    }

    let pageNum = 1;
    for (; ;) {
      console.log(`[Discover] Scraping page ${pageNum}...`);
      await page.evaluate(function () { window.scrollTo(0, document.body.scrollHeight); }).catch(function () { return undefined; });

      const current = await extractJobs();
      let added = 0;

      for (let i = 0; i < current.length; i++) {
        const job = current[i];
        if (!jobs.has(job.jobId)) {
          jobs.set(job.jobId, job);
          added += 1;
        }
      }

      console.log(`[Discover] Found ${current.length} jobs, ${added} new.`);

      const next = page
        .locator(
          'a[rel="next"], li.next a, .pagination-next a, a.next, a:has-text("Next"), button:has-text("Next"), a:has-text("Load More"), button:has-text("Load More"), a:has-text("Show More"), button:has-text("Show More")'
        )
        .first();

      const nextCount = await next.count();
      const isVisible = nextCount > 0 ? await next.isVisible().catch(function () { return false; }) : false;

      if (!nextCount || !isVisible || added === 0) break;

      const clicked = await next.click({ timeout: 5000 }).then(function () { return true; }).catch(function () { return false; });
      if (!clicked) break;

      await page.waitForLoadState("networkidle").catch(function () { return undefined; });
      pageNum++;
    }

    console.log(`[Discover] Finished. Discovered ${jobs.size} unique jobs.`);

    const finalJobs = [];
    jobs.forEach(function (job) {
      finalJobs.push(job);
    });

    return finalJobs;
  } finally {
    await page.close();
  }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
  const page = await browser.newPage();

  try {
    console.log(`[Scrape] Processing: ${partial.title} | ${partial.location || "no location"}`);

    await page.goto(partial.jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1000);

    const schema = await page.evaluate(parseSchemaScripts);
    const domDescription = await page.evaluate(parseDomDescription);
    const pageData = await page.evaluate(parsePageData);

    const description = cleanDescription(plain(schema?.description) || domDescription);
    if (!description) return null;

    const parsedPosted = toDate(schema?.datePosted) || toDate(pageData.posted);
    const deadlineValue = toDeadline(schema?.validThrough || pageData.deadline);

    const schemaAddress = schema?.jobLocation?.address;
    const addressRecord =
      schemaAddress && typeof schemaAddress === "object" && schemaAddress !== null && !Array.isArray(schemaAddress)
        ? (schemaAddress as Record<string, unknown>)
        : null;

    const schemaLocation = addressRecord
      ? [
        plain(addressRecord.streetAddress),
        plain(addressRecord.addressLocality),
        plain(addressRecord.addressRegion),
        plain(addressRecord.addressCountry)
      ]
        .filter(Boolean)
        .join(", ")
      : plain(schemaAddress);

    const location =
      partial.location ||
      (addressRecord ? plain(addressRecord.streetAddress) || schemaLocation : schemaLocation) ||
      pageData.location ||
      pageData.subhead;

    const checkNM = isNMState(partial.location, location, partial.jobUrl, pageData.subhead);
    const checkMX = isMxCountry(partial.location, location, partial.jobUrl, pageData.subhead);
    const targetLocation = checkNM || checkMX;

    if ((!parsedPosted || !deadlineValue) && !targetLocation) return null;

    const postedDate = targetLocation && (!parsedPosted || !deadlineValue)
      ? CONFIG.refDate
      : parsedPosted || CONFIG.refDate;

    if (!inWindow(postedDate)) return null;

    const fallbackLocation = locationParts(location);

    const city = (addressRecord ? plain(addressRecord.addressLocality) : "") || fallbackLocation.city;
    let state = (addressRecord ? plain(addressRecord.addressRegion) : "") || fallbackLocation.state;
    let country = addressRecord ? plain(addressRecord.addressCountry) : "";

    if (checkNM) {
      state = "NM";
      country = "USA";
    } else if (checkMX) {
      country = "Mexico";
    }

    let worktype = plain(schema?.jobLocationType).replace(/^https?:\/\/schema\.org\//i, "") || pageData.worktype;
    if (!worktype && /remote/i.test(`${location} ${partial.location}`)) worktype = "Remote";

    return {
      jobId: partial.jobId,
      title: partial.title,
      description,
      jobUrl: partial.jobUrl,
      postedDate,
      jdDeadline: deadlineValue,
      company: CONFIG.company,
      salaryRange: salaryRange(schema, pageData.salary),
      employmentType: plain(schema?.employmentType) || pageData.employment,
      worktype,
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

    console.log(`[Main] Starting to scrape ${discovered.length} jobs with concurrency ${CONFIG.concurrency}...`);

    const results = await Promise.all(
      discovered.map(function (partial) {
        return queue.add(async function () {
          try {
            return await scrape(browser, partial);
          } catch (error) {
            errors.push({ jobId: partial.jobId, error: String(error) });
            return null;
          }
        });
      })
    );

    const seen = new Set<string>();

    const jobs = results.filter(function (job): job is Job {
      if (!job) return false;
      if (seen.has(job.jobId)) return false;
      seen.add(job.jobId);
      if (job.ats !== "Custom") return false;

      const fields = [job.jobId, job.title, job.description, job.jobUrl, job.postedDate, job.company];
      for (let i = 0; i < fields.length; i++) {
        if (!fields[i] || fields[i].trim().length === 0) return false;
      }
      return true;
    });

    const filename = `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`;

    await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));

    if (errors.length) {
      await fs.promises.writeFile(`${CONFIG.company.replace(/\s+/g, "_")}_errors.json`, JSON.stringify(errors, null, 2));
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Company: ${CONFIG.company}`);
    console.log(`Discovered: ${discovered.length}`);
    console.log(`Scraped: ${jobs.length}`);
    console.log(`JSON: ${filename}`);
  } finally {
    await browser.close();
  }
}

main().catch(function (error) { console.error(String(error)); });