import { chromium, Browser } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const today = new Date();
const CONFIG = {
  url: "https://cityofalamogordonm.munisselfservice.com/ess/employmentopportunities/default.aspx",
  company: "City of Alamogordo",
  refDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  concurrency: 3,
  city: "Alamogordo",
  state: "NM",
  country: "USA"
};

const ATS = "Tyler Technologies - Munis Self Service (ESS)";

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
  reqId: string;
  sreqId: string;
  title: string;
  jobUrl: string;
  description: string;
  postingStartRaw: string;
  postingEndRaw: string;
  minHourlyRate: number | null;
  employmentType: string;
  worktype: string;
  location: string;
}

interface ErrorRecord {
  jobId: string;
  error: string;
}

const SEL = {
  rowsPerPageTop: "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_RowsPerPageDropDownListTop",
  nextButtonTop: "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_NextButtonTop",
  pagesCountLabelTop: "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_pagesCountLabelTop",
};

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

function parseMDY(str: string | null): string | null {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function inWindow(postedDate: string): boolean {
  const posted = new Date(`${postedDate}T00:00:00Z`).getTime();
  const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
  return posted >= ref - 30 * 86400000 && posted <= ref;
}

async function discover(browser: Browser): Promise<PartialJob[]> {
  const page = await browser.newPage();

  try {
    console.log(`[Opening] ${CONFIG.url}`);
    await page.goto(CONFIG.url, { waitUntil: "networkidle", timeout: 60000 });

    if (await page.$(SEL.rowsPerPageTop)) {
      console.log("[Setting] Rows per page -> 50");
      await page.selectOption(SEL.rowsPerPageTop, "50").catch(() => { });
      await page.waitForLoadState("networkidle").catch(() => { });
      await page.waitForTimeout(3000);
    }

    const allJobs: PartialJob[] = [];
    const seenJobIds = new Set<string>();
    let pageNum = 1;

    async function scrapeCurrentPageJobs(): Promise<PartialJob[]> {
      await page.waitForSelector("tcw-card table.employmentopportunity", { state: "attached", timeout: 15000 }).catch(() => { });

      // FIX: Replaced .map() with a standard for-loop to prevent __name injection
      return page.$$eval("tcw-card table.employmentopportunity", (tables) => {
        const results = [];
        for (let i = 0; i < tables.length; i++) {
          const table = tables[i];
          const leftCell = table.querySelector("td.aligntop");
          const titleLink = leftCell ? leftCell.querySelector("a") : null;
          const title = titleLink ? titleLink.textContent?.trim() || "" : "";
          const rawJobUrl = titleLink ? (titleLink as HTMLAnchorElement).href : "";

          let reqId = "";
          let sreqId = "";
          let jobUrl = rawJobUrl;

          if (rawJobUrl) {
            try {
              const u = new URL(rawJobUrl);
              const reqParam = u.searchParams.get("req");
              const sreqParam = u.searchParams.get("sreq");
              const postingIdParam = u.searchParams.get("postingId");

              if (reqParam) {
                reqId = reqParam;
                sreqId = sreqParam || "1";
              } else if (postingIdParam) {
                const parts = postingIdParam.split("-");
                reqId = parts[0];
                sreqId = parts[1] || "1";
              }

              if (reqId && sreqId && title) {
                const origin = u.origin || "https://cityofalamogordonm.munisselfservice.com";
                const encodedTitle = encodeURIComponent(title);
                jobUrl = `${origin}/ess/EmploymentOpportunities/JobDetail.aspx?req=${reqId}&sreq=${sreqId}&form=GEN&desc=${encodedTitle}`;
              }
            } catch (e) { /* ignore */ }
          }

          let rateMatch = null;
          if (leftCell) {
            const ps = leftCell.querySelectorAll("p");
            for (let j = 0; j < ps.length; j++) {
              const p = ps[j];
              if (p.textContent && p.textContent.includes("MINIMUM HOURLY RATE")) {
                const m = p.textContent.match(/\$([\d.,]+)/);
                if (m) rateMatch = m;
                break;
              }
            }
          }

          const cells = table.querySelectorAll("td.aligntop");
          const descCell = cells.length > 1 ? cells[1] : null;
          const descP = descCell ? descCell.querySelector("p") : null;
          const description = descP ? descP.textContent?.replace(/\s+/g, " ").trim() || "" : "";

          let postingType = "";
          let location = "";
          let postingStartRaw = "";
          let postingEndRaw = "";

          if (leftCell) {
            const ps = leftCell.querySelectorAll("p");
            for (let j = 0; j < ps.length; j++) {
              const p = ps[j];
              const b = p.querySelector("b");
              if (b && b.textContent) {
                const bText = b.textContent.trim().replace(/:$/, "");
                const pText = p.textContent?.replace(b.textContent, "").trim() || "";
                if (bText === "Type") postingType = pText;
                else if (bText === "Location") location = pText;
                else if (bText === "Posting Start") postingStartRaw = pText;
                else if (bText === "Posting End") postingEndRaw = pText;
              }
            }
          }

          let worktype = "";
          if (title) {
            const m = title.match(/\(([^)]*(?:PART|FULL)[^)]*)\)/i);
            if (m) worktype = m[1].toUpperCase();
          }

          results.push({
            reqId,
            sreqId,
            title,
            jobUrl,
            description,
            postingStartRaw,
            postingEndRaw,
            minHourlyRate: rateMatch ? parseFloat(rateMatch[1].replace(",", "")) : null,
            employmentType: postingType,
            worktype,
            location,
          });
        }
        return results;
      });
    }

    while (true) {
      console.log(`[Page ${pageNum}] Scraping...`);

      let jobsOnPage: PartialJob[] = [];
      let retries = 0;

      while (retries < 3) {
        try {
          jobsOnPage = await scrapeCurrentPageJobs();
          break;
        } catch (e: any) {
          if (e.message && e.message.includes("Execution context was destroyed")) {
            console.warn(`  -> Context destroyed, waiting for page to stabilize... (Attempt ${retries + 1})`);
            await page.waitForLoadState("load").catch(() => { });
            await page.waitForLoadState("networkidle").catch(() => { });
            await page.waitForTimeout(2000);
            retries++;
          } else {
            throw e;
          }
        }
      }

      let newCount = 0;
      for (const j of jobsOnPage) {
        const key = j.reqId && j.sreqId ? `${j.reqId}-${j.sreqId}` : j.jobUrl;
        if (key && seenJobIds.has(key)) continue;
        if (key) seenJobIds.add(key);
        allJobs.push(j);
        newCount++;
      }
      console.log(`  -> ${jobsOnPage.length} rows on page (${newCount} new)`);

      const nextButton = await page.$(SEL.nextButtonTop);
      // FIX: Passed as a string to prevent any bundler injection
      const nextDisabled = nextButton
        ? await nextButton.evaluate("btn => btn.disabled").catch(() => true)
        : true;

      let atLastPage = true;
      try {
        const labelText = await page.textContent(SEL.pagesCountLabelTop);
        const m = labelText?.trim().match(/^(\d+)\s+of\s+(\d+)$/i);
        if (m && Number(m[1]) < Number(m[2])) {
          atLastPage = false;
        }
      } catch (e) { }

      if (nextDisabled || atLastPage) {
        break;
      }

      console.log("  -> Clicking Next page...");
      const beforeLabel = await page.textContent(SEL.pagesCountLabelTop).catch(() => null);

      await nextButton!.click().catch(() => { });

      // FIX: Passed as a string to prevent any bundler injection
      await page.waitForFunction(
        "({ sel, prevText }) => { const el = document.querySelector(sel); return el && el.textContent?.trim() !== prevText; }",
        { sel: SEL.pagesCountLabelTop, prevText: beforeLabel },
        { timeout: 15000 }
      ).catch(() => {
        console.warn("  -> Page label did not change within timeout; continuing anyway.");
      });

      await page.waitForLoadState("networkidle").catch(() => { });
      await page.waitForTimeout(2000);

      pageNum++;
    }

    return allJobs;
  } finally {
    await page.close();
  }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
  const page = await browser.newPage();

  try {
    if (!partial.jobUrl) return null;
    await page.goto(partial.jobUrl, { waitUntil: "networkidle", timeout: 20000 });

    // FIX: Replaced .map, .filter, .querySelectorAll(...).forEach with standard for-loops
    const detail = await page.evaluate(() => {
      const card = document.querySelector("tcw-card.jobDetailCard");
      let fullDescription = "";
      if (card) {
        const descEl = card.querySelector("p.aligntop");
        if (descEl) {
          const clone = descEl.cloneNode(true) as HTMLElement;
          const brs = clone.querySelectorAll("br");
          for (let i = 0; i < brs.length; i++) {
            brs[i].replaceWith("\n");
          }
          fullDescription = clone.textContent?.trim() || "";
        }
        if (!fullDescription || fullDescription.length < 100) {
          const cardText = (card as HTMLElement).innerText || "";
          const rawLines = cardText.split("\n");
          const lines = [];
          for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i].trim();
            if (l) lines.push(l);
          }
          let metaStart = lines.length;
          for (let i = 0; i < lines.length; i++) {
            if (/^Code\s*:/.test(lines[i])) {
              metaStart = i;
              break;
            }
          }
          const bodyLines = lines.slice(0, metaStart);
          const h2 = card.querySelector("h2");
          const h2Text = h2 ? h2.textContent?.trim() : "";
          const cleaned = [];
          for (let i = 0; i < bodyLines.length; i++) {
            if (bodyLines[i] !== "APPLY" && bodyLines[i] !== h2Text) {
              cleaned.push(bodyLines[i]);
            }
          }
          fullDescription = cleaned.join("\n").trim();
        }
      }

      let postingStartRaw = "";
      let postingEndRaw = "";

      if (card) {
        const bEls = card.querySelectorAll("b");
        for (let i = 0; i < bEls.length; i++) {
          const b = bEls[i];
          const bText = b.textContent?.trim() || "";
          const label = bText.replace(/\s*:\s*$/, "");
          if (label === "Posting Start" || label === "Posting End") {
            let node = b.nextSibling;
            while (node && node.nodeType !== 3) {
              node = node.nextSibling;
            }
            const val = node ? node.textContent?.trim() || "" : "";
            if (label === "Posting Start") postingStartRaw = val;
            else if (label === "Posting End") postingEndRaw = val;
          }
        }

        if (!postingStartRaw || !postingEndRaw) {
          const paras = card.querySelectorAll("p");
          for (let i = 0; i < paras.length; i++) {
            const p = paras[i];
            const text = p.textContent || "";
            const lns = text.split("\n");
            for (let j = 0; j < lns.length; j++) {
              const line = lns[j];
              const match = line.match(/^([^:]+?)\s*:\s*(.+)$/);
              if (match) {
                const lbl = match[1].trim();
                const val = match[2].trim();
                if (lbl === "Posting Start" && !postingStartRaw) postingStartRaw = val;
                else if (lbl === "Posting End" && !postingEndRaw) postingEndRaw = val;
              }
            }
          }
        }
      }

      return {
        fullDescription,
        postingStartRaw,
        postingEndRaw,
      };
    });

    const description = cleanDescription(detail.fullDescription || partial.description);
    if (!description || description.length < 50) return null;

    const postedDate = parseMDY(detail.postingStartRaw || partial.postingStartRaw) || CONFIG.refDate;
    const jdDeadlineRaw = detail.postingEndRaw || partial.postingEndRaw || null;
    const jdDeadline = parseMDY(jdDeadlineRaw) || jdDeadlineRaw;

    if (postedDate !== CONFIG.refDate && !inWindow(postedDate)) return null;

    return {
      jobId: partial.reqId && partial.sreqId ? `${partial.reqId}-${partial.sreqId}` : partial.reqId,
      title: partial.title,
      description,
      jobUrl: partial.jobUrl,
      postedDate,
      jdDeadline: jdDeadline === "12/31/9999" ? null : jdDeadline,
      company: CONFIG.company,
      salaryRange: partial.minHourlyRate != null ? `$${partial.minHourlyRate.toFixed(2)}/hr and up` : "",
      employmentType: partial.employmentType || "",
      worktype: partial.worktype || "",
      location: partial.location || "",
      city: CONFIG.city,
      state: CONFIG.state,
      country: CONFIG.country,
      ats: ATS
    };

  } catch (e) {
    throw e;
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
          try {
            return await scrape(browser, partial);
          } catch (error) {
            errors.push({ jobId: `${partial.reqId}-${partial.sreqId}`, error: String(error) });
            return null;
          }
        })
      )
    );

    const seen = new Set<string>();
    const jobs = results.filter(
      (job): job is Job =>
        Boolean(job) &&
        !seen.has(job!.jobId) &&
        Boolean(seen.add(job!.jobId)) &&
        job!.ats === ATS &&
        [job!.jobId, job!.title, job!.description, job!.jobUrl, job!.postedDate, job!.company].every(
          field => field.trim().length > 0
        )
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