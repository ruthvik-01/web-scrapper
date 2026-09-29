import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://arona-home-essentials.hiringthing.com/",
  company: "Arona Home Essentials",
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

async function discover(): Promise&lt;{id: string, title: string, url: string, location: string}[]&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: "networkidle" });

  const jobs = await page.$$eval("h2 a", (links, base) =&gt;
    links.map(link =&gt; {
      const title = link.textContent?.trim() || "";
      const href = link.getAttribute("href") || "";
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      const id = (href.match(/\/job\/(\d+)/)?.[1]) || "";

      let location = "";
      const parent = link.closest("div")?.parentElement;
      if (parent) {
        const textNodes = parent.innerText.split("\n");
        const locMatch = textNodes.find(t =&gt; /^[A-Z][A-Za-z\s]+,\s*[A-Z]{2}$/.test(t.trim()));
        location = locMatch?.trim() || "";
      }

      return { id, title, url: fullUrl, location };
    }), CONFIG.url);

  await browser.close();
  return jobs.filter(j =&gt; j.id &amp;&amp; j.location);
}

async function scrape(jobData: {id: string, title: string, url: string, location: string}): Promise&lt;Job|null&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(jobData.url, { waitUntil: "networkidle" });

    const schema = await page.evaluate(() =&gt; {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          if (data["@type"] === "JobPosting") return data;
        } catch {}
      }
      return null;
    });

    let description = schema?.description || "";
    description = description.replace(/&lt;[^&gt;]+&gt;/g, " ").replace(/\s+/g, " ").trim();
    description = description.replace(/[\n\t\\]/g, " ");

    if (!description) return null;

    const jobId = jobData.id;
    const title = jobData.title;
    const jobUrl = jobData.url;

    let postedDate = schema?.datePosted ? new Date(schema.datePosted).toISOString().split("T")[0] : CONFIG.refDate;
    if (isNaN(new Date(postedDate).getTime())) postedDate = CONFIG.refDate;

    const cutoff = new Date(CONFIG.refDate);
    cutoff.setDate(cutoff.getDate() - 30);
    if (new Date(postedDate) &lt; cutoff) return null;

    const jdDeadline = "";
    const company = CONFIG.company;
    const salaryRange = jobData.location.includes("$") ? jobData.location.match(/\$[\d,]+/)?.[0] || "" : "";
    const employmentType = schema?.employmentType || "";
    const worktype = schema?.jobLocationType?.toLowerCase() || "";

    const locParts = jobData.location.split(",").map(p =&gt; p.trim());
    const city = locParts[0] || "";
    const state = locParts[1] || "";
    let country = "United States";

    const isMexico = ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"].some(term =&gt;
      jobData.location.toLowerCase().includes(term));
    if (isMexico) {
      country = "Mexico";
    }

    const location = jobData.location;
    const ats = "Custom";

    return {
      jobId, title, description, jobUrl, postedDate, jdDeadline, company,
      salaryRange, employmentType, worktype, location, city, state, country, ats
    };

  } catch {
    return null;
  } finally {
    await page.close();
    await browser.close();
  }
}

async function main() {
  const discovered = await discover();
  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${discovered.length}`);

  const queue = new PQueue({ concurrency: CONFIG.concurrency });
  const results = await Promise.all(discovered.map(job =&gt;
    queue.add(() =&gt; scrape(job).catch(() =&gt; null))
  ));

  const jobs = results.filter((j): j is Job =&gt; j !== null);
  const errors = discovered
    .filter(job =&gt; !results.some(result =&gt; result &amp;&amp; result.jobId === job.id))
    .map(job =&gt; ({ jobId: job.id, error: "Failed to scrape" }));

  const filename = `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`.toLowerCase();
  await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));

  if (errors.length &gt; 0) {
    const errorFilename = `${CONFIG.company.replace(/\s+/g, "_")}_errors.json`.toLowerCase();
    await fs.promises.writeFile(errorFilename, JSON.stringify(errors, null, 2));
  }

  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${filename}`);
}

main().catch(console.error);