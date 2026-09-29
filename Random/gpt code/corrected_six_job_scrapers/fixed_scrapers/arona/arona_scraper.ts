import { chromium, Browser } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();

const CONFIG = {
  url: "https://arona-home-essentials.hiringthing.com/",
  company: "Arona Home Essentials",
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

const MEXICO = ["mexico city", "monterrey", "new mexico", "mexico", "mx", "nm"];

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
      record.name,
      record.streetAddress,
      record.addressLocality,
      record.addressRegion,
      record.addressCountry,
      record.value,
      record.text
    ].find(item => plain(item));
    return candidate ? plain(candidate) : "";
  }
  return String(value).trim();
}

function toDate(value: unknown): string | null {
  const text = plain(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toDeadline(value: unknown): string | null {
  const text = plain(value);
  if (!text || /open until filled|immediate start/i.test(text)) return null;
  return toDate(text);
}

function isMexico(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return MEXICO.some(term => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function inWindow(postedDate: string): boolean {
  const posted = new Date(`${postedDate}T00:00:00Z`).getTime();
  const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
  return posted >= ref - 30 * 86400000 && posted <= ref;
}

function locationParts(value: string): { city: string; state: string } {
  const parts = value.split(",").map(part => part.trim()).filter(Boolean);
  return { city: parts[0] || "", state: parts[1] || "" };
}

function salaryRange(schema: any, fallback: string): string {
  const base = schema?.baseSalary;
  if (!base) return fallback.trim();

  const values = Array.isArray(base.value) ? base.value : [base.value];
  const amounts = values
    .map((item: unknown) =>
      plain(
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).amount ?? item
          : item
      )
    )
    .filter(Boolean);

  if (amounts.length) return amounts.join(" - ");

  const min = plain(base.minValue ?? base.minSalary);
  const max = plain(base.maxValue ?? base.maxSalary);
  if (min || max) return [min, max].filter(Boolean).join(" - ");

  return plain(base) || fallback.trim();
}

async function discover(browser: Browser): Promise<PartialJob[]> {
  const page = await browser.newPage();
  const seenPages = new Set<string>();
  const jobs = new Map<string, PartialJob>();
  let currentUrl: string | null = CONFIG.url;

  try {
    while (currentUrl && !seenPages.has(currentUrl)) {
      seenPages.add(currentUrl);
      await page.goto(currentUrl, { waitUntil: "networkidle" });

      // FIX: Replaced .map() and .filter() callbacks with a standard for-loop 
      // to prevent the bundler from injecting __name into the callbacks.
      const pageJobs = await page.$$eval(
        'a[href*="/job/"], a[href*="/jobs/"], a[href*="job_id"], a[href*="jobId"]',
        (anchors: Element[]) => {
          const results = [];
          for (const anchor of anchors) {
            const link = anchor as HTMLAnchorElement;
            const match =
              link.href.match(/\/job\/(?:details\/)?([^/?#]+)/i) ||
              link.href.match(/\/jobs\/(?:details\/)?([^/?#]+)/i) ||
              link.href.match(/[?&]job[_]?id=([^&#]+)/i);

            const title =
              link.textContent?.trim() ||
              link.getAttribute("aria-label")?.trim() ||
              link.getAttribute("title")?.trim() ||
              "";

            const container = link.closest("article, li, div, section");
            const rawText = (container as HTMLElement)?.innerText || container?.textContent || "";
            const lines = rawText.split("\n");
            const cleanLines = [];
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) cleanLines.push(trimmed);
            }

            let location = "";
            for (const line of cleanLines) {
              if (/^[^,]+,\s*[A-Z]{2}$/.test(line) || /mexico|monterrey|new mexico|\bmx\b|\bnm\b/i.test(line)) {
                location = line;
                break;
              }
            }

            const jobId = match?.[1] ? decodeURIComponent(match[1]) : "";
            if (jobId && title && link.href) {
              results.push({
                jobId,
                title,
                jobUrl: link.href,
                location
              });
            }
          }
          return results;
        }
      );

      pageJobs.forEach(job => {
        if (!jobs.has(job.jobId)) jobs.set(job.jobId, job);
      });

      // FIX: Replaced .find() callback with a standard for-loop.
      currentUrl = await page.evaluate(() => {
        const selectors = [
          'a[rel="next"]',
          "li.next a",
          ".pagination-next a",
          ".pagination__next a",
          "a.next",
          'a[aria-label="Next"]'
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el instanceof HTMLAnchorElement && el.href) return el.href;
        }

        const links = Array.from(document.querySelectorAll("a"));
        for (const a of links) {
          if (a instanceof HTMLAnchorElement) {
            const text = a.textContent || "";
            const aria = a.getAttribute("aria-label") || "";
            if (/^\s*(next|siguiente)\s*$/i.test(text) || /^\s*(next|siguiente)\s*$/i.test(aria)) {
              return a.href;
            }
          }
        }

        return null;
      });

      if (currentUrl && seenPages.has(currentUrl)) currentUrl = null;
    }

    return [...jobs.values()];
  } finally {
    await page.close();
  }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
  const page = await browser.newPage();

  try {
    await page.goto(partial.jobUrl, { waitUntil: "networkidle" });

    // FIX: Replaced .find() callback with a standard for-loop.
    const schema = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of Array.from(scripts)) {
        const text = script.textContent?.trim();
        if (!text) continue;

        try {
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
          let posting = null;
          for (const item of items) {
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
    });

    const domDescription = await page.evaluate(() => {
      const selectors = [
        '[itemprop="description"]',
        ".description",
        "#description",
        ".job-description",
        ".job-description-content",
        ".job-details",
        "main article",
        "article",
        "main",
        '[role="main"]'
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text;
      }

      return document.body?.textContent?.trim() || "";
    });

    // FIX: Removed `const pick = ...` entirely.
    // Inlining the regex matches prevents the bundler from injecting __name for the `pick` variable.
    const pageData = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        posted: text.match(/(?:posted date|date posted|posted|publish date)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
        deadline: text.match(/(?:closing date|deadline|close date|valid through)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
        salary: text.match(/salary\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
        employment: text.match(/(?:employment type|job type)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
        worktype: text.match(/(?:worktype|work type|location type)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
        location: text.match(/location\s*:?\s*([^\n]+)/i)?.[1]?.trim() || ""
      };
    });

    const description = cleanDescription(plain(schema?.description) || domDescription);
    if (!description) return null;

    const posted = toDate(schema?.datePosted) || toDate(pageData.posted);
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
      (addressRecord ? plain(addressRecord.streetAddress) || schemaLocation : schemaLocation) ||
      partial.location ||
      pageData.location;

    const mexico = isMexico(
      partial.location,
      location,
      addressRecord ? plain(addressRecord.addressLocality) : "",
      addressRecord ? plain(addressRecord.addressRegion) : "",
      addressRecord ? plain(addressRecord.addressCountry) : ""
    );

    if ((!posted || !deadlineValue) && !mexico) return null;

    const postedDate = mexico && (!posted || !deadlineValue) ? CONFIG.refDate : posted || CONFIG.refDate;
    if (!inWindow(postedDate)) return null;

    const fallbackLocation = locationParts(partial.location || pageData.location || (addressRecord ? "" : schemaLocation));
    const city = (addressRecord ? plain(addressRecord.addressLocality) : "") || fallbackLocation.city;
    let state = (addressRecord ? plain(addressRecord.addressRegion) : "") || fallbackLocation.state;
    let country = addressRecord ? plain(addressRecord.addressCountry) : "";

    if (mexico) {
      state = "NM";
      country = "Mexico";
    }

    return {
      jobId: partial.jobId,
      title: plain(partial.title),
      description,
      jobUrl: partial.jobUrl,
      postedDate,
      jdDeadline: deadlineValue,
      company: CONFIG.company,
      salaryRange: salaryRange(schema, pageData.salary),
      employmentType: plain(schema?.employmentType) || pageData.employment,
      worktype: plain(schema?.jobLocationType).replace(/^https?:\/\/schema\.org\//i, "") || pageData.worktype,
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

    const rawResults = await Promise.all(
      discovered.map(partial =>
        queue.add(async () => {
          try {
            return await scrape(browser, partial);
          } catch (error) {
            errors.push({ jobId: partial.jobId, error: String(error) });
            return null;
          }
        })
      )
    );

    const results: (Job | null)[] = rawResults.map(job => job ?? null);

    const seen = new Set<string>();
    const jobs = results.filter(
      (job): job is Job => {
        if (!job) return false;
        if (seen.has(job.jobId)) return false;
        seen.add(job.jobId);
        if (job.ats !== "Custom") return false;
        return [job.jobId, job.title, job.description, job.jobUrl, job.postedDate, job.company].every(
          field => field.trim().length > 0
        );
      }
    );

    const filename = `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`;

    await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));

    if (errors.length) {
      await fs.promises.writeFile(`${CONFIG.company.replace(/\s+/g, "_")}_errors.json`, JSON.stringify(errors, null, 2));
    }

    console.log(`Company: ${CONFIG.company}`);
    console.log(`Discovered: ${discovered.length}`);
    console.log(`Scraped: ${jobs.length}`);
    console.log(`JSON: ${filename}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => console.error(String(error)));