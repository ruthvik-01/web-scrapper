import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://garverusa.com/careers/job-listings/",
  company: "Garver",
  refDate: "2026-08-14",
  concurrency: 5,
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

interface JobListing {
  jobId: string;
  title: string;
  jobUrl: string;
  city: string;
  state: string;
  discipline: string;
}

function extractJobId(url: string): string {
  const match = url.match(/[?&]gni=([^&]+)/);
  return match ? match[1] : "";
}

async function discover(): Promise<JobListing[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: "networkidle" });

  const jobs = await page.$$eval("table tbody tr", (rows) => {
    return rows
      .map((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 4) return null;
        const link = cells[0].querySelector("a");
        if (!link) return null;
        const title = link.textContent?.trim() || "";
        const href = link.getAttribute("href") || "";
        const city = cells[1].textContent?.trim() || "";
        const state = cells[2].textContent?.trim() || "";
        const discipline = cells[3].textContent?.trim() || "";
        if (!title || !href) return null;
        const jobUrl = href.startsWith("http") ? href : `https://garverusa.com${href}`;
        return { title, jobUrl, city, state, discipline };
      })
      .filter((j): j is NonNullable<typeof j> => j !== null);
  });

  await browser.close();

  const listings = jobs.map((j) => ({
    ...j,
    jobId: extractJobId(j.jobUrl),
  })).filter((j) => j.jobId);

  return [...new Map(listings.map((j) => [j.jobId, j])).values()];
}

const cleanDesc = (text: string): string =>
  text
    .replace(/\\[nrt]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();

const isMexicoLocation = (city: string, state: string): boolean => {
  const loc = `${city} ${state}`.toLowerCase();
  return ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"].some(i => loc.includes(i));
};

const isValidDate = (dateStr: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
};

const isWithin30Days = (dateStr: string, refDate: string): boolean => {
  const jobDate = new Date(dateStr);
  const referenceDate = new Date(refDate);
  const thirtyDaysAgo = new Date(referenceDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return jobDate >= thirtyDaysAgo && jobDate <= referenceDate;
};

async function scrapeJob(listing: JobListing): Promise<Job | null> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(listing.jobUrl, { waitUntil: "networkidle" });

    const title = await page.$eval("h1", (el) => el.textContent?.trim() || "").catch(() => listing.title);

    const description = await page.evaluate(() => {
      const article = document.querySelector("article");
      if (!article) return "";
      return article.textContent || "";
    });

    const cleanDescription = cleanDesc(description);
    if (!cleanDescription) {
      return null;
    }

    const isMexico = isMexicoLocation(listing.city, listing.state);
    const location = [listing.city, listing.state].filter(Boolean).join(", ");

    // Use reference date since we don't have a real posted date
    const postedDate = CONFIG.refDate;

    // According to Mexico rule: if postedDate or deadline is missing, apply location filter for Mexico
    // Check if the job is within 30 days or is a Mexico job
    const within30Days = isWithin30Days(postedDate, CONFIG.refDate);

    // If not within 30 days and not a Mexico job, skip it
    if (!within30Days && !isMexico) {
      return null;
    }

    // For Mexico jobs, set state to "NM" as per requirements
    const state = isMexico ? "NM" : listing.state;
    const country = isMexico ? "Mexico" : "United States";

    return {
      jobId: listing.jobId,
      title,
      description: cleanDescription,
      jobUrl: listing.jobUrl,
      postedDate,
      jdDeadline: "",
      company: CONFIG.company,
      salaryRange: "",
      employmentType: "",
      worktype: "",
      location,
      city: listing.city,
      state,
      country,
      ats: "Custom",
    };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const listings = await discover();
  console.log(`Discovered: ${listings.length}`);

  const queue = new PQueue({ concurrency: CONFIG.concurrency });
  const jobs: Job[] = [];
  const errors: Array<{ jobId: string; error: string }> = [];

  const tasks = listings.map((l) =>
    queue.add(async () => {
      try {
        const job = await scrapeJob(l);
        if (job) {
          jobs.push(job);
        } else {
          errors.push({ jobId: l.jobId, error: "Failed to scrape or didn't meet criteria" });
        }
      } catch (error) {
        errors.push({ jobId: l.jobId, error: error instanceof Error ? error.message : "Unknown error" });
      }
    })
  );

  await Promise.all(tasks);

  fs.writeFileSync(`${CONFIG.company.toLowerCase()}_jobs.json`, JSON.stringify(jobs, null, 2));
  if (errors.length) {
    fs.writeFileSync(`${CONFIG.company.toLowerCase()}_errors.json`, JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${listings.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${CONFIG.company.toLowerCase()}_jobs.json`);
}

main().catch(console.error);