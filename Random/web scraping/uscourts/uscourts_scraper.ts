import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://www.uscourts.gov/careers/search-judiciary-jobs",
  company: "US Courts",
  refDate: "2026-08-14",
  concurrency: 5
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

const parseDateRange = (range: string): { posted?: string; deadline?: string } => {
  const match = range.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(.+)/);
  if (!match) return {};
  const toIso = (d: string) => {
    const [mm, dd, yyyy] = d.split("/");
    return `${yyyy}-${mm}-${dd}`;
  };
  const deadline = match[2].includes("/") ? toIso(match[2]) : match[2];
  return { posted: toIso(match[1]), deadline };
};

const isOlderThan30Days = (dateStr: string, ref: string): boolean => {
  const d = new Date(dateStr);
  const refDate = new Date(ref);
  const diff = (refDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff > 30;
};

const isMexicoLocation = (location: string): boolean => {
  const indicators = ["mexico", "monterrey", "mexico city", "mx", "new mexico", "nm"];
  const loc = location.toLowerCase();
  return indicators.some(ind => loc.includes(ind));
};

async function discoverPage(pageNum: number): Promise<Partial<Job>[]> {
  const url = pageNum === 0 ? CONFIG.url : `${CONFIG.url}?page=${pageNum}`;
  const { data } = await axios.get(url, { timeout: 30000 });
  const $ = cheerio.load(data);
  const jobs: Partial<Job>[] = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;
    const link = cells.eq(0).find("a");
    const href = link.attr("href") || "";
    const idMatch = href.match(/(\d+)/);
    if (!idMatch) return;

    jobs.push({
      jobId: idMatch[1],
      title: link.text().trim(),
      jobUrl: href.startsWith("http") ? href : `https://www.uscourts.gov${href}`
    });
  });

  return jobs;
}

async function discover(): Promise<Partial<Job>[]> {
  const all: Partial<Job>[] = [];
  for (let page = 0; ; page++) {
    const jobs = await discoverPage(page);
    if (!jobs.length) break;
    all.push(...jobs);
    if (jobs.length < 25) break;
  }

  const seen = new Set<string>();
  return all.filter(j => {
    if (seen.has(j.jobId!)) return false;
    seen.add(j.jobId!);
    return true;
  });
}

async function scrape(partial: Partial<Job>): Promise<Job | null> {
  const { data } = await axios.get(partial.jobUrl!, { timeout: 30000 });
  const $ = cheerio.load(data);

  const sections: string[] = [];
  $(".field--name-field-position-description, .field--name-field-qualifications, .field--name-field-employee-benefits, .field--name-field-miscellaneous, .field--name-field-application-info").each((_, el) => {
    sections.push($(el).text().trim());
  });

  let description = sections.join("\n\n");
  description = description.replace(/[\n\t]/g, ' ').replace(/&nbsp;/g, ' ').trim();

  if (!description) return null;

  const dateText = $(".field--name-field-date-range .field__item").text().trim();
  const dates = parseDateRange(dateText);
  const salaryText = $(".field--name-field-salary-range .field__item").text().trim();
  const locationText = $(".field--name-field-vacancy-location .field__item").text().trim();
  const [city = "", state = ""] = locationText.split(",").map(s => s.trim());
  const companyText = $(".field--name-field-court .field__item").text().trim();
  const employmentType = $(".field--name-field-duration .field__item").text().trim();

  const fullLocation = `${city}, ${state}`.replace(/^, |, $/g, "");
  const mexico = isMexicoLocation(fullLocation);

  if (dates.posted && isOlderThan30Days(dates.posted, CONFIG.refDate)) return null;

  if (!dates.posted && mexico) {
    dates.posted = CONFIG.refDate;
  }

  if (!dates.posted) return null;

  const finalState = mexico && state !== "NM" ? "NM" : state;
  const country = finalState === "MX" ? "Mexico" : (finalState ? "United States" : "");

  return {
    jobId: partial.jobId!,
    title: partial.title!,
    description,
    jobUrl: partial.jobUrl!,
    postedDate: dates.posted,
    jdDeadline: dates.deadline && dates.deadline.includes("-") ? "" : dates.deadline,
    company: companyText || CONFIG.company,
    salaryRange: salaryText,
    employmentType,
    worktype: "",
    location: fullLocation,
    city,
    state: finalState,
    country,
    ats: "Custom"
  };
}

async function main() {
  console.log("Discovering jobs...");
  const discovered = await discover();
  console.log(`Discovered: ${discovered.length}`);

  const queue = new PQueue({ concurrency: CONFIG.concurrency });
  const jobs: Job[] = [];
  const errors: { jobId: string; error: string }[] = [];

  const tasks = discovered.map(partial =>
    queue.add(async () => {
      try {
        const job = await scrape(partial);
        if (job) jobs.push(job);
      } catch (e) {
        errors.push({ jobId: partial.jobId!, error: String(e) });
      }
    })
  );

  await Promise.all(tasks);

  fs.writeFileSync(`${CONFIG.company.replace(/\s+/g, '_').toLowerCase()}_jobs.json`, JSON.stringify(jobs, null, 2));
  if (errors.length) {
    fs.writeFileSync(`${CONFIG.company.replace(/\s+/g, '_').toLowerCase()}_errors.json`, JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${discovered.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${CONFIG.company.replace(/\s+/g, '_').toLowerCase()}_jobs.json`);
}

main().catch(console.error);