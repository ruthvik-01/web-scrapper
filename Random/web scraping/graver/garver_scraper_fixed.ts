import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://garverusa.com/careers/job-listings/",
  company: "Garver",
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

function extractJobId(url: string): string {
  const match = url.match(/[?&]gni=([^&]+)/);
  return match ? match[1] : "";
}

async function discover(): Promise&lt;{ jobId: string; title: string; jobUrl: string; city: string; state: string }[]&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: "networkidle" });

  const jobs = await page.$$eval("table tbody tr", (rows) =&gt; {
    return rows
      .map((row) =&gt; {
        const cells = row.querySelectorAll("td");
        if (cells.length &lt; 4) return null;
        const link = cells[0].querySelector("a");
        if (!link) return null;
        const title = link.textContent?.trim() || "";
        const href = link.getAttribute("href") || "";
        const city = cells[1].textContent?.trim() || "";
        const state = cells[2].textContent?.trim() || "";
        if (!title || !href) return null;
        const jobUrl = href.startsWith("http") ? href : `https://garverusa.com${href}`;
        return { title, jobUrl, city, state };
      })
      .filter((j): j is NonNullable&lt;typeof j&gt; =&gt; j !== null);
  });

  await browser.close();

  return jobs.map((j) =&gt; ({
    ...j,
    jobId: extractJobId(j.jobUrl),
  })).filter((j) =&gt; j.jobId);
}

const cleanDesc = (text: string): string =&gt;
  text
    .replace(/[\\\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isMexicoLocation = (city: string, state: string): boolean =&gt; {
  const loc = `${city} ${state}`.toLowerCase();
  return ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"].some(i =&gt; loc.includes(i));
};

async function scrapeJob(listing: { jobId: string; title: string; jobUrl: string; city: string; state: string }): Promise&lt;Job | null&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(listing.jobUrl, { waitUntil: "networkidle" });

  try {
    const title = await page.$eval("h1", (el) =&gt; el.textContent?.trim() || "").catch(() =&gt; listing.title);

    const description = await page.evaluate(() =&gt; {
      const article = document.querySelector("article");
      if (!article) return "";
      return article.textContent || "";
    });

    const cleanDescription = cleanDesc(description);
    if (!cleanDescription) {
      await browser.close();
      return null;
    }

    const isMexico = isMexicoLocation(listing.city, listing.state);
    const locationParts = [listing.city, listing.state].filter(Boolean);
    const location = locationParts.join(", ");

    if (isMexico) {
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
        state: "NM",
        country: "Mexico",
        ats: "Custom",
      };
    }

    const jobDateText = await page.evaluate(() =&gt; {
      const dateElements = Array.from(document.querySelectorAll("*")).filter(el =&gt;
        el.textContent?.includes("Posted") || el.textContent?.includes("Date") || el.textContent?.includes("Published")
      );
      for (const el of dateElements) {
        const text = el.textContent || "";
        const match = text.match(/(?:Posted|Date|Published).*?(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
        if (match) return match[1];
      }
      return "";
    });

    let postedDate = CONFIG.refDate;
    if (jobDateText) {
      if (jobDateText.includes("/")) {
        const [mm, dd, yyyy] = jobDateText.split("/");
        postedDate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      } else {
        postedDate = jobDateText;
      }

      const jobDate = new Date(postedDate);
      const refDate = new Date(CONFIG.refDate);
      const diffTime = Math.abs(refDate.getTime() - jobDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays &gt; 30) {
        await browser.close();
        return null;
      }
    }

    await browser.close();

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
  const errors: Array&lt;{ jobId: string; error: string }&gt; = [];

  const tasks = listings.map((l) =&gt;
    queue.add(async () =&gt; {
      try {
        const job = await scrapeJob(l);
        if (job) {
          jobs.push(job);
        } else {
          errors.push({ jobId: l.jobId, error: "Failed to scrape" });
        }
      } catch (error) {
        errors.push({ jobId: l.jobId, error: String(error) });
      }
    })
  );

  await Promise.all(tasks);

  const filename = `${CONFIG.company.toLowerCase()}_jobs.json`;
  fs.writeFileSync(filename, JSON.stringify(jobs, null, 2));
  if (errors.length) {
    fs.writeFileSync(`${CONFIG.company.toLowerCase()}_errors.json`, JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${listings.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${filename}`);
}

main().catch(console.error);