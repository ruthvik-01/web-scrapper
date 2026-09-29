import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();
const CONFIG = {
  url: "https://www.uscourts.gov/careers/search-judiciary-jobs",
  company: "uscourts",
  refDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
};

const CONCURRENCY = 5;

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

const MEXICO_INDICATORS = ["mexico city", "monterrey", "new mexico", "mexico", "mx", "nm"];

const NAV_PATTERNS = [
  /skip to main content/i, /search form/i, /search this site/i, /text size/i,
  /decrease font size/i, /you are here\s*home/i, /site navigation/i, /back to careers/i,
  /window dataLayer/i, /document foundation/i, /var classes byline/i, /var usasearch/i,
  /btn entryform/i, /function pleaseWait/i, /var script document createElement/i,
  /your browser is navigator/i, /mura function/i,
];

const PDF_PATTERNS = [
  /^PDF \d+ \d+/, /endobj/i, /stream x/i, /startxref/i, /xref \d+ \d+ trailer/i,
];

function cleanDescription(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\[n\t]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNavContent(text: string): boolean {
  return NAV_PATTERNS.filter((p) => p.test(text)).length >= 3;
}

function isPdfContent(text: string): boolean {
  return PDF_PATTERNS.some((p) => p.test(text));
}

function isValidDescription(text: string): boolean {
  if (!text || text.length < 200) return false;
  if (isPdfContent(text)) return false;
  if (isNavContent(text)) return false;
  return true;
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const mdy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseDeadline(raw: string): string | null {
  const text = raw.trim();
  if (!text || /open until filled|immediate start/i.test(text)) return null;
  return parseDate(text);
}

function parseDateRange(raw: string): { posted: string | null; deadline: string | null } {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { posted: null, deadline: null };
  const parts = text.split(/[-–—]/).map((p) => p.trim());
  if (parts.length >= 2) {
    return { posted: parseDate(parts[0]), deadline: parseDeadline(parts.slice(1).join(" - ")) };
  }
  return { posted: parseDate(parts[0]), deadline: null };
}

function isInWindow(date: string): boolean {
  const posted = new Date(`${date}T00:00:00Z`).getTime();
  const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
  return posted >= ref - 30 * 86400000 && posted <= ref;
}

function isMexico(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return MEXICO_INDICATORS.some((t) => new RegExp(`\\b${t.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function parseLocation(location: string): { city: string; state: string } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: "", state: "" };
  if (parts.length === 1) return { city: parts[0], state: "" };
  const last = parts[parts.length - 1];
  const stateMatch = last.match(/^([A-Z]{2})$/);
  if (stateMatch) return { city: parts.slice(0, -1).join(", "), state: last };
  return { city: parts[0], state: last };
}

async function discoverPage(page: number): Promise<PartialJob[]> {
  const url = page === 0 ? CONFIG.url : `${CONFIG.url}?page=${page}`;
  const { data } = await axios.get(url, { timeout: 30000 });
  const $ = cheerio.load(data);
  const jobs: PartialJob[] = [];
  $("table tbody tr").each((_, row) => {
    const link = $(row).find("td:first-child a").first();
    const href = link.attr("href") || "";
    const title = link.text().trim();
    if (!href || !title) return;
    const jobId = href.match(/(\d{3,})/)?.[1] || href;
    const location = $(row).find("td").eq(3).text().replace(/\s+/g, " ").trim();
    jobs.push({ jobId, title, jobUrl: new URL(href, CONFIG.url).href, location });
  });
  return jobs;
}

async function discover(): Promise<PartialJob[]> {
  const all: PartialJob[] = [];
  const seen = new Set<string>();
  for (let page = 0; ; page++) {
    const current = await discoverPage(page);
    let added = 0;
    for (const job of current) {
      if (!seen.has(job.jobId)) {
        seen.add(job.jobId);
        all.push(job);
        added++;
      }
    }
    if (!current.length || added === 0) break;
  }
  return all;
}

async function scrape(partial: PartialJob): Promise<Job | null> {
  const { data } = await axios.get(partial.jobUrl, { timeout: 30000 });
  const $ = cheerio.load(data);

  const dateText = $(".field--name-field-date-range .field__item").first().text().trim();
  const dates = parseDateRange(dateText);

  const location = $(".field--name-field-vacancy-location .field__item").first().text().replace(/\s+/g, " ").trim() || partial.location;
  const salaryRange = $(".field--name-field-salary-range .field__item").first().text().replace(/\s+/g, " ").trim();
  const employmentType = $(".field--name-field-duration .field__item").first().text().replace(/\s+/g, " ").trim();

  let description = $(".field--name-field-position-description, .field--name-field-qualifications, .field--name-field-employee-benefits")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(" ");

  if (!isValidDescription(description)) {
    const externalHref = $("a[href*='trakstar.com'], a[href*='hire.com'], a[href*='uscourts.gov']")
      .map((_, el) => $(el).attr("href") || "")
      .get()
      .find((h) => /trakstar|hire.com|job.?announcement/i.test(h));
    if (externalHref) {
      try {
        const res = await axios.get(new URL(externalHref, partial.jobUrl).href, { timeout: 30000 });
        const ext$ = cheerio.load(res.data);
        description = ext$("main, article").first().text().trim() || ext$("body").text().trim();
      } catch { /* skip */ }
    }
  }

  description = cleanDescription(description);
  if (!isValidDescription(description)) return null;

  const mexico = isMexico(location, partial.location);
  if (!dates.posted && !dates.deadline && !mexico) return null;

  const postedDate = dates.posted || CONFIG.refDate;
  const jdDeadline = dates.deadline;

  if (!isInWindow(postedDate)) return null;

  const parsed = parseLocation(location);

  return {
    jobId: partial.jobId,
    title: partial.title.trim(),
    description,
    jobUrl: partial.jobUrl,
    postedDate,
    jdDeadline,
    company: CONFIG.company,
    salaryRange: salaryRange.trim() || "Not specified",
    employmentType: employmentType.trim() || "Permanent",
    worktype: "",
    location: location.trim(),
    city: parsed.city,
    state: mexico ? "NM" : parsed.state,
    country: "USA",
    ats: "Custom",
  };
}

async function main(): Promise<void> {
  const discovered = await discover();
  const queue = new PQueue({ concurrency: CONCURRENCY });
  const errors: { jobId: string; error: string }[] = [];

  const results = await Promise.all(
    discovered.map((partial) =>
      queue.add(async () => {
        try {
          return await scrape(partial);
        } catch (err) {
          errors.push({ jobId: partial.jobId, error: String(err) });
          return null;
        }
      })
    )
  );

  const seen = new Set<string>();
  const jobs = results.filter((job): job is Job => {
    if (!job) return false;
    if (seen.has(job.jobId)) return false;
    seen.add(job.jobId);
    if (job.ats !== "Custom") return false;
    if (![job.jobId, job.title, job.description, job.jobUrl, job.postedDate, job.company].every((f) => f.trim().length > 0)) return false;
    return true;
  });

  const filename = `${CONFIG.company}_jobs.json`;
  await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));

  if (errors.length) {
    await fs.promises.writeFile(`${CONFIG.company}_errors.json`, JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${discovered.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${filename}`);
}

main().catch(console.error);