import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  url: "https://cityofalamogordonm.munisselfservice.com/ess/employmentopportunities/default.aspx",
  company: "City of Alamogordo",
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

interface PartialJob {
  jobId: string;
  title: string;
  jobUrl: string;
  location: string;
}

async function discover(): Promise&lt;PartialJob[]&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(CONFIG.url, { waitUntil: "networkidle" });

  if (await page.$("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_RowsPerPageDropDownListTop")) {
    await Promise.all([
      page.selectOption("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_RowsPerPageDropDownListTop", "50"),
      page.waitForLoadState("networkidle"),
    ]);
    await page.waitForTimeout(2000).catch(() =&gt; {});
  }

  const jobs: PartialJob[] = [];
  const seen = new Set&lt;string&gt;();
  let pageNum = 1;
  const MAX_PAGES = 50;

  while (pageNum &lt;= MAX_PAGES) {
    const pageJobs: PartialJob[] = await page.$$eval("tcw-card table.employmentopportunity", tables =&gt;
      tables.map(table =&gt; {
        const leftCell = table.querySelector("td.aligntop") as HTMLTableDataCellElement | null;
        const titleLink = leftCell ? leftCell.querySelector("a") : null;
        const title = titleLink ? titleLink.textContent?.trim() : null;
        const rawJobUrl = titleLink ? titleLink.href : null;

        let jobId = "";
        let jobUrl = rawJobUrl;

        if (rawJobUrl) {
          try {
            const u = new URL(rawJobUrl);
            const reqParam = u.searchParams.get("req");
            const sreqParam = u.searchParams.get("sreq");
            const postingIdParam = u.searchParams.get("postingId");

            if (reqParam) {
              jobId = `${reqParam}-${sreqParam || "1"}`;
            } else if (postingIdParam) {
              const parts = postingIdParam.split("-");
              jobId = `${parts[0] || ""}-${parts[1] || "1"}`;
            }

            if (jobId &amp;&amp; title) {
              const origin = u.origin;
              const encodedTitle = encodeURIComponent(title);
              jobUrl = `${origin}/ess/EmploymentOpportunities/JobDetail.aspx?req=${jobId.split("-")[0]}&amp;sreq=${jobId.split("-")[1]}&amp;form=GEN&amp;desc=${encodedTitle}`;
            }
          } catch (_) {}
        }

        const location = leftCell ? Array.from(leftCell.querySelectorAll("p")).find(p =&gt;
          p.querySelector("b")?.textContent?.trim().replace(/:$/, "") === "Location"
        )?.textContent?.replace(/^[^:]+:\s*/, "").trim() || "";

        return { jobId, title: title || "", jobUrl: jobUrl || "", location };
      })
    );

    for (const job of pageJobs) {
      if (job.jobId &amp;&amp; !seen.has(job.jobId)) {
        seen.add(job.jobId);
        jobs.push(job);
      }
    }

    const nextButton = await page.$("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_NextButtonTop");
    const disabled = nextButton ? await nextButton.evaluate((btn: HTMLButtonElement) =&gt; btn.disabled) : true;

    if (disabled || pageNum &gt;= MAX_PAGES) break;

    if (nextButton) await nextButton.click();
    await page.waitForFunction(
      (sel, prev) =&gt; {
        const el = document.querySelector(sel);
        return el &amp;&amp; el.innerText?.trim() !== prev;
      },
      "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_pagesCountLabelTop",
      await page.textContent("#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_pagesCountLabelTop") || ""
    ).catch(() =&gt; {});
    await page.waitForLoadState("networkidle");

    pageNum++;
  }

  await browser.close();
  return jobs;
}

async function scrape(job: PartialJob): Promise&lt;Job | null&gt; {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(job.jobUrl, { waitUntil: "networkidle", timeout: 20000 });

    const data = await page.evaluate(() =&gt; {
      const card = document.querySelector("tcw-card.jobDetailCard") as HTMLElement | null;
      if (!card) return null;

      let description = "";
      const descEl = card.querySelector("p.aligntop") as HTMLElement | null;
      if (descEl) {
        const clone = descEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("br").forEach(br =&gt; br.replaceWith("\n"));
        description = clone.textContent?.trim() || "";
      }

      if (!description || description.length &lt; 100) {
        const cardText = card.innerText || "";
        const lines = cardText.split("\n").map(l =&gt; l.trim()).filter(l =&gt; l);
        const metaStart = lines.findIndex(l =&gt; /^Code\s*:/.test(l));
        const bodyLines = metaStart &gt; 0 ? lines.slice(0, metaStart) : lines;
        const cleaned = bodyLines.filter(l =&gt; l !== "APPLY" &amp;&amp; l !== card.querySelector("h2")?.innerText?.trim());
        description = cleaned.join("\n").trim();
      }

      function labelValue(rawLabel: string): string | null {
        const bEls = Array.from(card.querySelectorAll("b"));
        for (const b of bEls) {
          const bText = b.textContent?.trim() || "";
          if (bText.replace(/\s*:\s*$/, "") === rawLabel) {
            let node: Node | null = b.nextSibling;
            while (node &amp;&amp; node.nodeType !== 3) node = node.nextSibling;
            return node ? node.textContent?.trim() || null : null;
          }
        }
        const paras = Array.from(card.querySelectorAll("p"));
        for (const p of paras) {
          const text = p.innerText || "";
          const lines = text.split("\n");
          for (const line of lines) {
            const match = line.match(/^([^:]+?)\s*:\s*(.+)$/);
            if (match &amp;&amp; match[1].trim() === rawLabel) return match[2].trim();
          }
        }
        return null;
      }

      return {
        description,
        postingStart: labelValue("Posting Start"),
        postingEnd: labelValue("Posting End"),
        type: labelValue("Type"),
        location: labelValue("Location")
      };
    });

    if (!data) return null;

    const rateP = Array.from((await page.$$("p"))).find(p =&gt;
      p.textContent?.includes("MINIMUM HOURLY RATE")
    );
    const rateMatch = rateP ? rateP.textContent?.match(/\$([\d.,]+)/) : null;
    const minHourlyRate = rateMatch ? parseFloat(rateMatch[1].replace(",", "")) : null;

    const worktypeMatch = job.title ? job.title.match(/\(([^)]*(?:PART|FULL)[^)]*)\)/i) : null;

    await browser.close();

    const postedDate = data.postingStart ? parseDate(data.postingStart) : CONFIG.refDate;
    if (!postedDate) return null;

    const refDateObj = new Date(CONFIG.refDate);
    const postedDateObj = new Date(postedDate);
    const diffDays = Math.floor((refDateObj.getTime() - postedDateObj.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays &gt; 30) return null;

    const mexicoIndicators = ["Mexico", "Mexico City", "Monterrey", "MX", "New Mexico", "NM"];
    const isMexico = mexicoIndicators.some(indicator =&gt;
      job.location.includes(indicator) || data.location?.includes(indicator)
    );

    if (isMexico) {
      return {
        jobId: job.jobId,
        title: job.title,
        description: cleanDescription(data.description),
        jobUrl: job.jobUrl,
        postedDate: CONFIG.refDate,
        jdDeadline: data.postingEnd ? parseDate(data.postingEnd) || "" : "",
        company: CONFIG.company,
        salaryRange: minHourlyRate ? `$${minHourlyRate.toFixed(2)}/hr and up` : "",
        employmentType: data.type || "",
        worktype: worktypeMatch ? worktypeMatch[1].toUpperCase() : "",
        location: data.location || job.location,
        city: job.location.split(",")[0]?.trim() || "",
        state: "NM",
        country: "Mexico",
        ats: "Custom"
      };
    }

    if (!data.postingStart) return null;

    return {
      jobId: job.jobId,
      title: job.title,
      description: cleanDescription(data.description),
      jobUrl: job.jobUrl,
      postedDate,
      jdDeadline: data.postingEnd &amp;&amp; isValidDate(data.postingEnd) ? parseDate(data.postingEnd) || "" : "",
      company: CONFIG.company,
      salaryRange: minHourlyRate ? `$${minHourlyRate.toFixed(2)}/hr and up` : "",
      employmentType: data.type || "",
      worktype: worktypeMatch ? worktypeMatch[1].toUpperCase() : "",
      location: data.location || job.location,
      city: job.location.split(",")[0]?.trim() || "",
      state: job.location.split(",")[1]?.trim() || "",
      country: "USA",
      ats: "Custom"
    };
  } catch (error) {
    await browser.close();
    return null;
  }
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function isValidDate(dateStr: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr);
}

function cleanDescription(desc: string): string {
  return desc.replace(/[\n\t]/g, " ").replace(/&amp;[#\w]+;/g, "");
}

async function main() {
  const partialJobs = await discover();
  const queue = new PQueue({ concurrency: 5 });
  const results: (Job | null)[] = [];
  const errors: { jobId: string; error: string }[] = [];

  console.log(`Discovered: ${partialJobs.length}`);

  await Promise.all(
    partialJobs.map(job =&gt;
      queue.add(async () =&gt; {
        try {
          const result = await scrape(job);
          results.push(result);
        } catch (error) {
          errors.push({ jobId: job.jobId, error: String(error) });
          results.push(null);
        }
      })
    )
  );

  const jobs = results.filter(Boolean) as Job[];
  const filename = `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`;

  fs.writeFileSync(filename, JSON.stringify(jobs, null, 2));

  if (errors.length &gt; 0) {
    const errorFilename = `${CONFIG.company.replace(/\s+/g, "_")}_errors.json`;
    fs.writeFileSync(errorFilename, JSON.stringify(errors, null, 2));
  }

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${partialJobs.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${filename}`);
}

main().catch(console.error);