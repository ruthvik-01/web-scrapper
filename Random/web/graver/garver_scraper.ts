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
    .trim();

const isMexicoLocation = (city: string, state: string): boolean => {
  const loc = `${city} ${state}`.toLowerCase();
  return ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"].some(i => loc.includes(i));
};

async function scrapeJob(listing: JobListing): Promise<Job | null> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(listing.jobUrl, { waitUntil: "networkidle" });

  try {
    const title = await page.$eval("h1", (el) => el.textContent?.trim() || "").catch(() => listing.title);

    const description = await page.evaluate(() => {
      const article = document.querySelector("article");
      if (!article) return "";
      return article.textContent || "";
    });

    const cleanDescription = cleanDesc(description);
    if (!cleanDescription) {
      await browser.close();
      return null;
    }

    const hasRealDate = false;
    const isMexico = isMexicoLocation(listing.city, listing.state);
    if (!hasRealDate && !isMexico) {
      await browser.close();
      return null;
    }

    const locationParts = [listing.city, listing.state].filter(Boolean);
    const location = locationParts.join(", ");

    await browser.close();

    return {
      jobId: listing.jobId,
      title,
      description: cleanDescription,
      jobUrl: listing.jobUrl,
      postedDate: CONFIG.refDate,
      jdDeadline: "",
      company: CONFIG.company,
      salaryRange: "",
      employmentType: "",
      worktype: "",
      location,
      city: listing.city,
      state: listing.state,
      country: "United States",
      ats: "Custom",
    };
  } catch {
    await browser.close();
    return null;
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
      const job = await scrapeJob(l);
      if (job) {
        jobs.push(job);
      } else {
        errors.push({ jobId: l.jobId, error: "Failed to scrape" });
      }
    })
  );

  await Promise.all(tasks);

  fs.writeFileSync("garver_jobs.json", JSON.stringify(jobs, null, 2));
  if (errors.length) {
    fs.writeFileSync("garver_errors.json", JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${listings.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: garver_jobs.json`);
}

main().catch(console.error);
