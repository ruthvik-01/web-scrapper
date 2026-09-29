import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://my.sisd.net/public_apps/jobs",
  company: "Socorro Consolidated School District",
  refDate: "2026-08-14"
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

async function discover(): Promise<Partial<Job>[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: "networkidle" });

  const jobLinks = await page.evaluate(() => {
    const links: Partial<Job>[] = [];
    const anchors = document.querySelectorAll("a[onclick*='openApplicationUrl']");

    anchors.forEach(anchor => {
      const onclick = anchor.getAttribute("onclick");
      if (!onclick) return;

      const urlMatch = onclick.match(/'([^']+)'\s*,\s*'([^']+)'/);
      if (!urlMatch) return;

      const jobUrl = urlMatch[2];
      const title = anchor.textContent?.trim() || "";
      const row = anchor.closest("tr");
      if (!row) return;

      const rowHtml = row.innerHTML;
      const codeMatch = rowHtml.match(/Code:\s*(\d+)\s*-\s*(\d+)/);
      const jobId = codeMatch ? `${codeMatch[1]}_${codeMatch[2]}` : "";

      const salaryMatch = rowHtml.match(/Salary:\s*([$\d.,\s-]+)/);
      const salaryRange = salaryMatch ? salaryMatch[1].trim() : "";

      const datePattern = /([A-Z][a-z]+ \d{1,2},? \d{4})/g;
      const dates = rowHtml.match(datePattern) || [];
      const postedDate = dates[0] || "";
      const jdDeadline = dates[1] || "";

      let pdfUrl = "";
      const pdfAnchor = row.querySelector("a[href*='Job_Descriptions'], a[href$='.pdf']");
      if (pdfAnchor) {
        pdfUrl = pdfAnchor.getAttribute("href") || "";
        if (pdfUrl.startsWith("..")) {
          pdfUrl = "https://www2.sisd.net" + pdfUrl.substring(2);
        }
      }

      if (jobId && title) {
        links.push({
          jobId,
          title,
          jobUrl,
          postedDate,
          jdDeadline,
          salaryRange,
          description: pdfUrl
        });
      }
    });

    return links;
  });

  await browser.close();
  return jobLinks;
}

async function scrape(job: Partial<Job>): Promise<Job | null> {
  if (!job.description || !job.description.startsWith("http")) return null;

  try {
    const response = await fetch(job.description);
    const buffer = await response.arrayBuffer();
    const pdfjs = await import("pdf-parse");
    const pdfData = await pdfjs.default(Buffer.from(buffer));

    let description = pdfData.text.replace(/\s+/g, " ").trim();
    if (!description || description.length < 100) return null;

    // Check for Mexico indicators in various location fields
    const isMexico = ["Mexico", "Mexico City", "Monterrey", "MX", "New Mexico", "NM"]
      .some(loc => job.location?.includes(loc) || job.city?.includes(loc) ||
        job.state?.includes(loc) || job.country?.includes(loc));

    // Mexico rule: if Mexico location but no date, use reference date
    if (isMexico && (!job.postedDate || !job.jdDeadline)) {
      return {
        jobId: job.jobId || "",
        title: job.title || "",
        description,
        jobUrl: job.jobUrl || "",
        postedDate: CONFIG.refDate,
        jdDeadline: job.jdDeadline || "",
        company: CONFIG.company,
        salaryRange: job.salaryRange || "",
        employmentType: "Contract",
        worktype: "",
        location: "El Paso, TX, United States",
        city: "El Paso",
        state: "TX",
        country: "United States",
        ats: "Custom"
      };
    }

    // For non-Mexico jobs or Mexico jobs with dates, validate normally
    let postedDate = job.postedDate || CONFIG.refDate;
    let jdDeadline = job.jdDeadline || "";

    // Parse posted date properly
    if (postedDate && postedDate.includes(" ")) {
      const [month, day, year] = postedDate.replace(",", "").split(" ");
      const months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const monthNum = months.indexOf(month) + 1;
      if (monthNum > 0 && day && year) {
        postedDate = `${year}-${monthNum.toString().padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    // 30-day filter
    const [year, month, day] = postedDate.split("-");
    const date = new Date(`${month}/${day}/${year}`);
    const refDate = new Date(CONFIG.refDate);
    const thirtyDaysAgo = new Date(refDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (date < thirtyDaysAgo) return null;

    return {
      jobId: job.jobId || "",
      title: job.title || "",
      description,
      jobUrl: job.jobUrl || "",
      postedDate,
      jdDeadline: jdDeadline.includes("Open Until Filled") ? "" : jdDeadline,
      company: CONFIG.company,
      salaryRange: job.salaryRange || "",
      employmentType: "Contract",
      worktype: "",
      location: "El Paso, TX, United States",
      city: "El Paso",
      state: "TX",
      country: "United States",
      ats: "Custom"
    };
  } catch {
    return null;
  }
}

async function main() {
  const partialJobs = await discover();
  const queue = new PQueue({ concurrency: 5 });
  const results: (Job | null)[] = [];
  const errors: { jobId: string; error: string }[] = [];

  const jobPromises = partialJobs.map(job =>
    queue.add(async () => {
      try {
        const result = await scrape(job);
        results.push(result);
      } catch (error) {
        errors.push({ jobId: job.jobId || '', error: String(error) });
        results.push(null);
      }
    })
  );

  await Promise.all(jobPromises);
  const jobs = results.filter(Boolean) as Job[];

  const duplicates = new Set();
  const deduped = jobs.filter(job => {
    if (duplicates.has(job.jobId)) return false;
    duplicates.add(job.jobId);
    return true;
  });

  fs.writeFileSync(
    `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`,
    JSON.stringify(deduped, null, 2)
  );

  if (errors.length > 0) {
    fs.writeFileSync(
      `${CONFIG.company.replace(/\s+/g, "_")}_errors.json`,
      JSON.stringify(errors, null, 2)
    );
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${partialJobs.length}`);
  console.log(`Scraped: ${deduped.length}`);
  console.log(`JSON: ${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`);
}

main().catch(console.error);