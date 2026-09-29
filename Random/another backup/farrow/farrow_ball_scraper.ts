import { chromium, Browser } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();
const CONFIG = {
  url: "https://careers.farrow-ball.com/job-search",
  company: "Farrow & Ball",
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
  salary: string;
  postedText: string;
  deadlineText: string;
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
      record.name, record.streetAddress, record.addressLocality,
      record.addressRegion, record.addressCountry, record.value, record.text
    ].find(item => plain(item));
    return candidate ? plain(candidate) : "";
  }
  return String(value).trim();
}

function toDate(value: unknown): string | null {
  const text = plain(value).toLowerCase();
  if (!text) return null;

  if (text.includes("today")) return CONFIG.refDate;
  if (text.includes("yesterday")) {
    const d = new Date(CONFIG.refDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const daysAgoMatch = text.match(/(\d+)\s*days?\s*ago/);
  if (daysAgoMatch) {
    const d = new Date(CONFIG.refDate);
    d.setDate(d.getDate() - parseInt(daysAgoMatch[1], 10));
    return d.toISOString().slice(0, 10);
  }

  const dmyMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
    const month = p1 > 12 ? p2 - 1 : (p2 > 12 ? p1 - 1 : p2 - 1);
    const parsed = new Date(year, month, day);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

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

function isMexico(...values: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return MEXICO.some(term => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function locationParts(value: string): { city: string; state: string; country: string } {
  const parts = value.split(",").map(part => part.trim()).filter(Boolean);
  return {
    city: parts[0] || "",
    state: parts[1] || "",
    country: parts[2] || ""
  };
}

function salaryRange(schema: any, fallback: string): string {
  const base = schema?.baseSalary;
  if (!base) return fallback.trim();
  const values = Array.isArray(base.value) ? base.value : [base.value];
  const amounts = values
    .map((item: unknown) => plain(typeof item === "object" && item !== null ? (item as Record<string, unknown>).value ?? item : item))
    .filter(Boolean);
  if (amounts.length) return amounts.join(" - ");
  return plain(base) || fallback.trim();
}

async function discover(browser: Browser): Promise<PartialJob[]> {
  const page = await browser.newPage();
  try {
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);

    const jobs = new Map<string, PartialJob>();

    async function extractJobs(): Promise<PartialJob[]> {
      let allJobs: PartialJob[] = [];
      for (const frame of page.frames()) {
        try {
          const result = await frame.evaluate(`
            (() => {
              const anchors = Array.from(document.querySelectorAll("a[href*='/job/'], a[href*='jobid='], a[href*='vacancy_id=']"));
              const jobs = [];
              
              for (const el of anchors) {
                let container = el;
                let bestContainer = el;
                
                for (let i = 0; i < 10; i++) {
                  const text = container.innerText || "";
                  if (text.length > 150 && text.length < 2000) {
                    bestContainer = container;
                    if (/[£$€]/.test(text) || /posted/i.test(text) || /closing date/i.test(text)) {
                      break;
                    }
                  }
                  if (!container.parentElement) break;
                  container = container.parentElement;
                }
                container = bestContainer;
                
                const text = container.innerText || "";
                const lines = text.split("\\n").map(l => l.trim()).filter(Boolean);
                
                const href = el.getAttribute("href") || "";
                const fullHref = el.href && el.href.startsWith("http") ? el.href : (window.location.origin + href);
                
                const titleEl = el.querySelector('h1, h2, h3, h4, h5, [class*="title" i]') || container.querySelector('h1, h2, h3, h4, h5, [class*="title" i]');
                let title = titleEl ? titleEl.textContent.trim() : "";
                if (!title && lines.length > 0) {
                    let t = lines[0];
                    t = t.split(/(?:Farrow|Ball|We are)/i)[0];
                    t = t.split(/\\s*[-–—]\\s*(?=[A-Z])/)[0];
                    title = t.replace(/\\s+/g, ' ').trim();
                }
                
                const locLine = lines.find(l => 
                  /(United States|United Kingdom|France|Canada|Australia|Germany|Italy|Spain|Mexico|USA|UK|Remote|California|New York|Texas|Florida|London|Paris|Dorset|Wimborne|Berkeley|Brooklyn|Santa Monica|Neuilly|Île-de-France|Northcote|Flatiron)/i.test(l) 
                  && !/Manager|Associate|Assistant|Admin|Coordinator|Development|Conseiller|Showroom|Lead|Service|Business|Procurement/i.test(l)
                  && l.split(/\\s+/).length < 15
                );
                
                let location = "";
                if (locLine) {
                    const locParts = locLine.split(/[£$€]/);
                    location = locParts[0].replace(/,?\\s*N\\/A\\s*$/i, "").replace(/,\\s*[A-Z0-9\\s]{3,8}$/, "").replace(/[\\s,]+$/, "").trim();
                }
                
                const salaryMatch = text.match(/([£$€]\\s*[\\d,.]+(?:\\s*(?:per|\\/|an|to|-|–|up to)\\s*[£$€]?[\\w\\d,.]+)*)/i);
                const salary = (salaryMatch && /\\d/.test(salaryMatch[1])) ? salaryMatch[1].trim() : "";
                
                const postedLine = lines.find(l => /posted/i.test(l)) || "";
                const deadlineLine = lines.find(l => /closing date|deadline/i.test(l)) || "";
                
                const pathMatch = href.match(/\\/job\\/([^\\/?&#]+)/i);
                const queryMatch = href.match(/[?&](?:id|jobid|job_id|vacancy_id|positionid)=([^&#]+)/i);
                const jobId = (pathMatch ? pathMatch[1] : (queryMatch ? queryMatch[1] : fullHref)).trim();
                
                if (jobId && title && fullHref) {
                  jobs.push({ jobId, title, jobUrl: fullHref, location, salary, postedText: postedLine, deadlineText: deadlineLine });
                }
              }
              return jobs;
            })()
          `);
          if (result) allJobs.push(...(result as PartialJob[]));
        } catch (e) { }
      }
      return allJobs;
    }

    let hasMore = true;
    let previousCount = 0;
    let emptyPages = 0;

    while (hasMore) {
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)").catch(() => undefined);
      await page.waitForTimeout(2000);

      const current = await extractJobs();
      let added = 0;
      current.forEach(job => {
        if (!jobs.has(job.jobId)) {
          jobs.set(job.jobId, job);
          added += 1;
        }
      });

      if (added === 0 && jobs.size === previousCount) {
        emptyPages++;
        if (emptyPages > 2) {
          let clicked = false;

          // FIX: Search ALL frames (including iframes) for the pagination button
          for (const frame of page.frames()) {
            try {
              const nextBtn = frame.getByRole('link', { name: /next/i })
                .or(frame.getByRole('button', { name: /next/i }))
                .or(frame.locator('[aria-label*="next" i], [class*="next" i], li.next a, .pagination-next, a:has-text("Next")'))
                .first();

              if (await nextBtn.count() > 0) {
                const isVisible = await nextBtn.isVisible().catch(() => false);
                if (!isVisible) continue;

                const isDisabled = await nextBtn.evaluate(el => {
                  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
                  if (el.classList.contains('disabled') || el.classList.contains('pagination-disabled') || el.classList.contains('inactive')) return true;
                  const parent = el.closest('li');
                  if (parent && (parent.classList.contains('disabled') || parent.classList.contains('inactive'))) return true;
                  return false;
                }).catch(() => true);

                if (!isDisabled) {
                  await nextBtn.click({ timeout: 5000 });
                  clicked = true;
                  break;
                }
              }
            } catch (e) { }
          }

          if (!clicked) {
            hasMore = false;
            break;
          }

          emptyPages = 0;
          await page.waitForTimeout(3000);
        }
      } else {
        emptyPages = 0;
      }

      previousCount = jobs.size;
    }
    return [...jobs.values()];
  } finally {
    await page.close();
  }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
  const page = await browser.newPage();
  try {
    await page.goto(partial.jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const schema = await page.evaluate(`
      (() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of Array.from(scripts)) {
          const text = script.textContent?.trim();
          if (!text) continue;
          try {
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
            const posting = items.find((item) => {
              const type = item?.["@type"];
              return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
            });
            if (posting) return posting;
          } catch (e) {}
        }
        return null;
      })()
    `);

    const domDescription = await page.evaluate(`
      (() => {
        const selectors = [
          '[itemprop="description"]', ".description", "#description", ".job-description",
          ".job-description-content", ".job-details", "main article", "article", "main", '[role="main"]'
        ];
        const elements = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
        const candidates = elements.map(node => node.innerText.trim()).filter(value => value.length > 80);
        return candidates.sort((a, b) => b.length - a.length)[0] || "";
      })()
    `);

    const pageData = await page.evaluate(`
      (() => {
        const text = document.body?.innerText || "";
        const pick = (pattern, maxWords = 15) => {
          const match = text.match(pattern);
          if (!match) return "";
          const val = match[1].trim();
          return val.split(/\\s+/).length <= maxWords ? val : "";
        };
        return {
          posted: pick(/(?:posted date|date posted|posted|publish date|posted on)\\s*:?\\s*([^\\n]+)/i),
          deadline: pick(/(?:closing date|deadline|close date|valid through|expires)\\s*:?\\s*([^\\n]+)/i),
          salary: pick(/(?:salary|compensation|base pay|hourly rate|pay rate)\\s*:?\\s*([^\\n]*\\d+[^\\n]*)/i),
          employment: pick(/(?:employment type|contract type|job type|status)\\s*:?\\s*([^\\n]+)/i),
          worktype: pick(/(?:worktype|work type|location type|working pattern)\\s*:?\\s*([^\\n]+)/i),
          location: pick(/location\\s*:?\\s*([^\\n]+)/i)
        };
      })()
    `);

    const description = cleanDescription(plain(schema?.description) || domDescription);
    if (!description) return null;

    const parsedPosted = toDate(schema?.datePosted) || toDate(pageData.posted) || toDate(partial.postedText);
    const deadlineValue = toDeadline(schema?.validThrough || pageData.deadline || partial.deadlineText);
    const finalSalary = pageData.salary || partial.salary || "";

    const schemaAddress = schema?.jobLocation?.address;
    const addressRecord = schemaAddress && typeof schemaAddress === "object" && schemaAddress !== null && !Array.isArray(schemaAddress) ? (schemaAddress as Record<string, unknown>) : null;

    const schemaLocation = addressRecord ? [plain(addressRecord.streetAddress), plain(addressRecord.addressLocality), plain(addressRecord.addressRegion), plain(addressRecord.addressCountry)].filter(Boolean).join(", ") : plain(schemaAddress);

    const cleanPartialLoc = partial.location && !/Manager|Associate|Assistant|Admin|Farrow|Ball|Business|Procurement|Service|Conseiller|Showroom|Lead/i.test(partial.location) ? partial.location : "";

    const location = cleanPartialLoc || (addressRecord ? plain(addressRecord.streetAddress) || schemaLocation : schemaLocation) || pageData.location;

    const mexico = isMexico(partial.location, location, addressRecord ? plain(addressRecord.addressLocality) : "", addressRecord ? plain(addressRecord.addressRegion) : "", addressRecord ? plain(addressRecord.addressCountry) : "");

    if (!parsedPosted && !deadlineValue && !mexico) return null;

    const postedDate = parsedPosted || CONFIG.refDate;
    if (!inWindow(postedDate)) return null;

    const fallbackLocation = locationParts(cleanPartialLoc || pageData.location || (addressRecord ? "" : schemaLocation));
    const city = (addressRecord ? plain(addressRecord.addressLocality) : "") || fallbackLocation.city;
    let state = (addressRecord ? plain(addressRecord.addressRegion) : "") || fallbackLocation.state;
    let country = addressRecord ? plain(addressRecord.addressCountry) : fallbackLocation.country;

    if (mexico) {
      state = "NM";
      country = "Mexico";
    }

    return {
      jobId: partial.jobId, title: partial.title, description, jobUrl: partial.jobUrl,
      postedDate, jdDeadline: deadlineValue, company: CONFIG.company,
      salaryRange: salaryRange(schema, finalSalary),
      employmentType: plain(schema?.employmentType) || pageData.employment,
      worktype: plain(schema?.jobLocationType).replace(/^https?:\/\/schema\.org\//i, "") || pageData.worktype,
      location, city, state, country, ats: "Custom"
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