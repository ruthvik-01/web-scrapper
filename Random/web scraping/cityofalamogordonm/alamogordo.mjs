import { chromium } from "playwright";
import fs from "fs";

/* ================= CONSTANTS ================= */
const BASE_URL =
  "https://cityofalamogordonm.munisselfservice.com/ess/employmentopportunities/default.aspx";
const ATS = "Tyler Technologies - Munis Self Service (ESS)";
const COMPANY = "City of Alamogordo";
const CITY = "Alamogordo";
const STATE = "NM";
const COUNTRY = "USA";

const LOOKBACK_DAYS = 30;
const OUTPUT_FILE = "jobs_last_30_days.json";
const NO_EXPIRATION_SENTINEL = "12/31/9999";
const MAX_PAGES = 50; // hard safety cap so a UI bug can't loop forever
const DETAIL_CONCURRENCY = 3; // parallel detail-page fetches

const SEL = {
  rowsPerPageTop:
    "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_RowsPerPageDropDownListTop",
  nextButtonTop: "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_NextButtonTop",
  pagesCountLabelTop:
    "#ctl00_ctl00_PrimaryPlaceHolder_ContentPlaceHolderMain_pagesCountLabelTop",
};

/* ================= HELPERS ================= */
function parseMDY(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// "1 of 3" -> { current: 1, total: 3 }
function parsePagesLabel(text) {
  if (!text) return null;
  const m = text.trim().match(/^(\d+)\s+of\s+(\d+)$/i);
  if (!m) return null;
  return { current: Number(m[1]), total: Number(m[2]) };
}

async function readPagesLabel(page) {
  try {
    const text = await page.textContent(SEL.pagesCountLabelTop);
    return parsePagesLabel(text);
  } catch (e) {
    return null;
  }
}

/* ================= SCRAPE ONE JOB DETAIL PAGE ================= */
async function scrapeJobDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    return await page.evaluate(() => {
      // Full description: take the whole card innerText, then strip the known
      // header (title + Apply button) and the metadata footer (Code/Type/Location… lines).
      // The description lives between those two blocks.
      const card = document.querySelector("tcw-card.jobDetailCard");
      let fullDescription = null;
      if (card) {
        // Use innerHTML-based approach: the description is the big <p class="aligntop">
        // but the p can contain the ENTIRE text. Try innerText of that p first.
        const descEl = card.querySelector("p.aligntop");
        if (descEl) {
          // Replace <br> with \n so line breaks survive innerText normalisation
          const clone = descEl.cloneNode(true);
          clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
          fullDescription = clone.textContent.trim();
        }
        // If that was empty or very short, fall back to card body text minus header/footer
        if (!fullDescription || fullDescription.length < 100) {
          const cardText = card.innerText || "";
          // Strip leading title line + Apply line
          const lines = cardText.split("\n").map(l => l.trim()).filter(l => l);
          // Find where the metadata block starts (lines like "Code : ...")
          const metaStart = lines.findIndex(l => /^Code\s*:/.test(l));
          const bodyLines = metaStart > 0 ? lines.slice(0, metaStart) : lines;
          // Drop the title (first line) and any "APPLY" button text
          const cleaned = bodyLines.filter(l => l !== "APPLY" && l !== card.querySelector("h2")?.innerText?.trim());
          fullDescription = cleaned.join("\n").trim();
        }
      }

      // Labels on the detail page look like: <b>Posting End :</b> 12/31/9999
      // (note the space before the colon – different from the listing page)
      function labelValue(rawLabel) {
        const card = document.querySelector("tcw-card.jobDetailCard");
        if (!card) return null;
        const bEls = Array.from(card.querySelectorAll("b"));
        for (const b of bEls) {
          const bText = b.textContent.trim();
          // match "Posting End :" or "Posting End:" case-insensitively
          if (bText.replace(/\s*:\s*$/, "") === rawLabel) {
            // The value is the next text node after the <b>
            let node = b.nextSibling;
            while (node && node.nodeType !== 3 /* TEXT_NODE */) {
              node = node.nextSibling;
            }
            return node ? node.textContent.trim() : null;
          }
        }
        // Fallback: scan <p> text for "Label : value" pattern
        const paras = Array.from(card.querySelectorAll("p"));
        for (const p of paras) {
          const text = p.innerText || "";
          const lines = text.split("\n");
          for (const line of lines) {
            const match = line.match(/^([^:]+?)\s*:\s*(.+)$/);
            if (match && match[1].trim() === rawLabel) return match[2].trim();
          }
        }
        return null;
      }

      return {
        fullDescription,
        postingStartRaw: labelValue("Posting Start"),
        postingEndRaw: labelValue("Posting End"),
      };
    });
  } catch (e) {
    console.warn(`  [Detail] Failed to fetch ${url}: ${e.message}`);
    return { fullDescription: null, postingStartRaw: null, postingEndRaw: null };
  }
}

/* ================= SCRAPE ONE LISTING PAGE OF CARDS ================= */
async function scrapeCurrentPageJobs(page) {
  return page.$$eval("tcw-card table.employmentopportunity", (tables) => {
    function labelValue(container, label) {
      const ps = Array.from(container.querySelectorAll("p"));
      for (const p of ps) {
        const b = p.querySelector("b");
        if (b && b.textContent.trim().replace(/:$/, "") === label) {
          return p.textContent.replace(b.textContent, "").trim();
        }
      }
      return null;
    }

    return tables.map((table) => {
      const leftCell = table.querySelector("td.aligntop");
      const titleLink = leftCell ? leftCell.querySelector("a") : null;
      const title = titleLink ? titleLink.textContent.trim() : null;
      const rawJobUrl = titleLink ? titleLink.href : null;

      let reqId = null,
        sreqId = null;
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
        } catch (e) {
          /* ignore */
        }
      }

      const rateP = leftCell
        ? Array.from(leftCell.querySelectorAll("p")).find((p) =>
          p.textContent.includes("MINIMUM HOURLY RATE")
        )
        : null;
      const rateMatch = rateP ? rateP.textContent.match(/\$([\d.,]+)/) : null;

      const cells = table.querySelectorAll("td.aligntop");
      const descCell = cells.length > 1 ? cells[1] : null;
      const descP = descCell ? descCell.querySelector("p") : null;
      const description = descP ? descP.textContent.replace(/\s+/g, " ").trim() : null;

      const postingType = leftCell ? labelValue(leftCell, "Type") : null;
      const worktypeMatch = title ? title.match(/\(([^)]*(?:PART|FULL)[^)]*)\)/i) : null;

      return {
        reqId,
        sreqId,
        title,
        jobUrl,
        description,
        postingStartRaw: leftCell ? labelValue(leftCell, "Posting Start") : null,
        postingEndRaw: leftCell ? labelValue(leftCell, "Posting End") : null,
        minHourlyRate: rateMatch ? parseFloat(rateMatch[1].replace(",", "")) : null,
        employmentType: postingType,
        worktype: worktypeMatch ? worktypeMatch[1].toUpperCase() : null,
        location: leftCell ? labelValue(leftCell, "Location") : null,
      };
    });
  });
}

/* ================= PAGINATION LOOP ================= */
async function collectAllJobs() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log(`[ATS] ${ATS}`);
  console.log(`[Opening] ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  // Reduce round trips: ask for 50 rows/page. Pagination below still runs
  // regardless of how many pages that leaves -- 1 or many.
  if (await page.$(SEL.rowsPerPageTop)) {
    console.log("[Setting] Rows per page -> 50");
    await Promise.all([
      page.selectOption(SEL.rowsPerPageTop, "50"),
      page.waitForLoadState("networkidle"),
    ]);
    await page.waitForTimeout(2000).catch(() => {});
  }

  const allJobs = [];
  const seenJobIds = new Set();
  let pageInfo = await readPagesLabel(page);
  let pageNum = 1;

  while (true) {
    console.log(
      `[Page ${pageInfo ? pageInfo.current : pageNum}${pageInfo ? " of " + pageInfo.total : ""}] Scraping...`
    );

    const jobsOnPage = await scrapeCurrentPageJobs(page);
    let newCount = 0;
    for (const j of jobsOnPage) {
      const key = j.reqId && j.sreqId ? `${j.reqId}-${j.sreqId}` : j.jobUrl;
      if (key && seenJobIds.has(key)) continue; // guard against a stuck/duplicate page
      if (key) seenJobIds.add(key);
      allJobs.push(j);
      newCount++;
    }
    console.log(`  -> ${jobsOnPage.length} rows on page (${newCount} new)`);

    pageInfo = await readPagesLabel(page);
    const nextButton = await page.$(SEL.nextButtonTop);
    const nextDisabled = nextButton
      ? await nextButton.evaluate((btn) => btn.disabled)
      : true;

    const atLastPage = pageInfo ? pageInfo.current >= pageInfo.total : true;
    if (nextDisabled || atLastPage || pageNum >= MAX_PAGES) {
      if (pageNum >= MAX_PAGES) {
        console.warn(`[Warning] Hit MAX_PAGES safety cap (${MAX_PAGES}); stopping.`);
      }
      break;
    }

    console.log("  -> Clicking Next page...");
    const beforeLabel = pageInfo ? `${pageInfo.current} of ${pageInfo.total}` : null;

    await nextButton.click();

    // UpdatePanel partial postback: wait for the "X of Y" label to actually
    // change (not just networkidle, which can fire before the DOM patch lands).
    await page
      .waitForFunction(
        (sel, prevText) => {
          const el = document.querySelector(sel);
          return el && el.innerText.trim() !== prevText;
        },
        SEL.pagesCountLabelTop,
        beforeLabel,
        { timeout: 15000 }
      )
      .catch(() => {
        console.warn("  -> Page label did not change within timeout; continuing anyway.");
      });
    await page.waitForLoadState("networkidle");

    pageNum++;
  }

  console.log(`[Done] Collected ${allJobs.length} unique job postings across ${pageNum} page(s)`);

  // ---- Enrich each job with full description + corrected dates from detail pages ----
  console.log(`[Detail] Fetching detail pages (concurrency=${DETAIL_CONCURRENCY})...`);
  const detailPage = await browser.newPage();

  for (let i = 0; i < allJobs.length; i += DETAIL_CONCURRENCY) {
    const batch = allJobs.slice(i, i + DETAIL_CONCURRENCY);
    // Sequential within each batch to avoid overloading the server
    for (const job of batch) {
      if (!job.jobUrl) continue;
      console.log(`  [Detail ${i + batch.indexOf(job) + 1}/${allJobs.length}] ${job.title}`);
      const detail = await scrapeJobDetail(detailPage, job.jobUrl);
      if (detail.fullDescription) job.fullDescription = detail.fullDescription;
      if (detail.postingStartRaw) job.postingStartRaw = detail.postingStartRaw;
      if (detail.postingEndRaw) job.postingEndRaw = detail.postingEndRaw;
    }
  }

  await detailPage.close();
  await browser.close();
  return allJobs;
}

/* ================= SHAPE TO TARGET SCHEMA + FILTER ================= */
function toSchemaRecord(job) {
  let postedDateObj = parseMDY(job.postingStartRaw);
  const postedDateDefaulted = !postedDateObj;
  if (!postedDateObj) postedDateObj = todayUTC();

  const jdDeadline = job.postingEndRaw || null;

  return {
    jobId: job.reqId && job.sreqId ? `${job.reqId}-${job.sreqId}` : job.reqId ?? null,
    title: job.title,
    description: job.fullDescription ?? job.description,
    jobUrl: job.jobUrl,
    postedDate: toISODate(postedDateObj),
    jdDeadline,
    company: COMPANY,
    salaryRange: job.minHourlyRate != null ? `$${job.minHourlyRate.toFixed(2)}/hr and up` : null,
    employmentType: job.employmentType,
    worktype: job.worktype,
    location: job.location,
    city: CITY,
    state: STATE,
    country: COUNTRY,
    ats: ATS,
    _postedDateObj: postedDateObj,
    _postedDateDefaulted: postedDateDefaulted,
  };
}

function filterLastNDays(records, nDays) {
  const today = todayUTC();
  return records.filter((r) => {
    const age = daysBetween(today, r._postedDateObj);
    return age >= 0 && age <= nDays;
  });
}

function stripInternal(record) {
  const { _postedDateObj, _postedDateDefaulted, ...rest } = record;
  return rest;
}


/* ================= MAIN ================= */
(async () => {
  try {
    const rawJobs = await collectAllJobs();
    const allRecords = rawJobs.map(toSchemaRecord);
    const recentRecords = filterLastNDays(allRecords, LOOKBACK_DAYS);

    console.log(
      `[Filtered] ${recentRecords.length} of ${allRecords.length} jobs posted within the last ${LOOKBACK_DAYS} days`
    );
    for (const r of recentRecords) {
      console.log(
        `  - ${r.title} | postedDate=${r.postedDate}${r._postedDateDefaulted ? " (defaulted to today)" : ""}`
      );
    }

    const finalJobs = recentRecords.map(stripInternal);

    // Thorough validation of every generated jobUrl
    for (const job of finalJobs) {
      if (!job.jobUrl) {
        console.warn(`[Validation Error] Missing jobUrl for jobId: ${job.jobId}`);
        continue;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(job.jobUrl);
      } catch (err) {
        console.warn(`[Validation Error] Malformed URL for jobId ${job.jobId}: ${job.jobUrl}`);
        continue;
      }

      // 1. Path is /ess/EmploymentOpportunities/JobDetail.aspx
      if (parsedUrl.pathname !== "/ess/EmploymentOpportunities/JobDetail.aspx") {
        console.warn(`[Validation Error] Path mismatch for jobId ${job.jobId}: ${parsedUrl.pathname}`);
      }

      // 2 & 3. req and sreq match jobId
      const [expectedReq, expectedSreq] = (job.jobId || "").split("-");
      const reqInUrl = parsedUrl.searchParams.get("req");
      const sreqInUrl = parsedUrl.searchParams.get("sreq");

      if (reqInUrl !== expectedReq) {
        console.warn(`[Validation Error] req mismatch for jobId ${job.jobId}: expected ${expectedReq}, got ${reqInUrl}`);
      }
      if (sreqInUrl !== expectedSreq) {
        console.warn(`[Validation Error] sreq mismatch for jobId ${job.jobId}: expected ${expectedSreq}, got ${sreqInUrl}`);
      }

      // 4. desc, after URL decoding, exactly matches job title
      const decodedDesc = decodeURIComponent(parsedUrl.searchParams.get("desc") || "");
      if (decodedDesc !== job.title) {
        console.warn(`[Validation Error] Decoded desc mismatch for jobId ${job.jobId}: "${decodedDesc}" !== "${job.title}"`);
      }

      // 5. No default.aspx
      if (job.jobUrl.includes("default.aspx")) {
        console.warn(`[Validation Error] default.aspx found in jobUrl for jobId ${job.jobId}`);
      }

      // 6. Check full title encoding (including & -> %26)
      const expectedDesc = encodeURIComponent(job.title);
      const rawDescMatch = job.jobUrl.match(/[?&]desc=([^&]*)/);
      const rawDescInUrl = rawDescMatch ? rawDescMatch[1] : "";
      if (rawDescInUrl !== expectedDesc) {
        console.warn(`[Validation Error] Encoding mismatch for jobId ${job.jobId}: expected "${expectedDesc}", got "${rawDescInUrl}"`);
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalJobs, null, 2));
    console.log(`[Saved] ${OUTPUT_FILE} (${finalJobs.length} records)`);

    console.log("[CSV Export] Skipped — JSON only");
  } catch (err) {
    console.error("[Failed]", err);
    process.exitCode = 1;
  }
})();
