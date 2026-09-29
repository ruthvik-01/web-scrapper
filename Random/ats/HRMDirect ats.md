# HCMDIRECT Job Scraper Requirements (Merged Spec)

## 1. Objective

Build a **concise, multi-company job scraper** in TypeScript for the **HCMDIRECT ATS**, combining the general scraping/schema/validation rules of the Universal Job Scraper spec with the batch parallel-processing flow defined for HCMDIRECT.

Each line of code must have significance. No bloat.

---

## 2. Source Code Requirement

**Single TypeScript file only.**

Example: `scraper.ts`

Requirements:
- Minimal code — every line serves a purpose
- No unused imports
- No unused functions
- No placeholder comments
- No decorative separators
- No verbose logging
- Single-responsibility functions only

---

## 3. Technology

Required packages:
```
playwright
p-queue
```

Optional:
```
cheerio
axios
```

Use `fs` from Node.js for output.

---

## 4. Input & Target

- Input: a **company list file** (JSON/CSV) with one entry per company, each containing at minimum `{ company, careerUrl }`.
- Each company's Career URL is the Jobs List page for that company on HCMDIRECT.
- No single "target URL" constant — the scraper is driven entirely by the input file, batch-processing every company in it.

---

## 5. Job Schema

Exactly 15 fields — identical for every company:

```ts
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
  ats: string; // always "HRMDirect"
}
```

No additional fields. No internal fields in output.

---

## 6. Scraping Strategy & Flow

**Flow:**
`Input File → 5 Companies in Parallel → Career/Jobs Page → Infinite Scroll → Collect Job URLs (API / Dynamic / DOM) → 10 Jobs in Parallel → Extract Details → Store batch of 10 → Next 10 → Continue → Complete`

### Stage 1 — Collect Job URLs (5 companies in parallel)
1. Read the company list from the input file.
2. Process **5 companies concurrently** (PQueue, concurrency = 5).
3. For each company, open its Career URL / Jobs List page.
4. Handle **infinite scroll** — keep scrolling/loading until no new jobs appear.
5. Detect the job URL source per company using, in order of preference:
   - **API** (network calls returning job JSON)
   - **Dynamic** (JS-rendered DOM requiring Playwright)
   - **DOM** (static HTML)
6. Collect every individual Job URL with its ID.
7. Deduplicate and store the unique job URL list per company.

### Stage 2 — Scrape Job Details (10 jobs in parallel)
1. Once a company's job URLs are collected, process its job URLs **10 at a time** (PQueue, concurrency = 10).
2. Open 10 individual job detail pages concurrently.
3. Extract all 15 schema fields from each detail page — never from the listing page.
4. Use only explicit data — no inference.
5. Save the completed batch of 10 jobs to the output as soon as it's done, then continue to the next batch of 10.
6. Repeat until all job URLs for that company are scraped.
7. Skip a job entirely if its detail page has no description.

### Stage 3 — Continue Until Complete
- Repeat Stage 1 → Stage 2 for every company in the input file.
- Avoid duplicate job URLs and duplicate job records (per company, keyed by `jobId`).
- Do not stop until all companies and all their jobs are completed.

Use Playwright only when necessary for JavaScript-rendered content; prefer direct API calls when discoverable.

---

## 7. Concurrency

```ts
const COMPANY_CONCURRENCY = 5;  // companies processed in parallel during URL discovery
const JOB_CONCURRENCY = 10;     // job detail pages processed in parallel per batch
```

Two separate PQueue instances — one gating company-level discovery, one gating job-detail scraping.

---

## 8. Date Handling

- Check for `postedDate` on the individual job detail page. If missing, use the reference date.
- Reference date: `2026-08-14`
- If `postedDate` and `deadline` are both missing, apply the **Mexico Rule** (Section 9).
- If genuine `postedDate` is unavailable, use the reference date.
- Filter jobs to those posted within 30 days back from the reference date.
- Only real dates are allowed in `postedDate` and `jdDeadline`. No values like "Open Until Filled" or "Immediate Start" — if such text is found, store `null` in that field instead.

---

## 9. Mexico Rule

If `postedDate` or `deadline` is missing, apply a location filter for Mexico:

- Only include jobs whose `location`, `city`, `state`, or `country` field contains a Mexico indicator: `"Mexico"`, `"Mexico City"`, `"Monterrey"`, `"MX"`, `"New Mexico"`, `"NM"`.
- For every Mexico-matched job, set `postedDate` to the reference date.
- For every Mexico-matched job, set `state` to `"NM"`.

---

## 10. Deduplication

Use `jobId`. One job per unique ID, enforced both within a company's batch and across the full company run.

---

## 11. Validation

Required fields: `jobId`, `title`, `description`, `jobUrl`, `postedDate`, `company`, `ats`.

- `ats` must equal `"HRMDirect"` for every job.
- No special characters in the `description` field. Remove escape sequences (`\n`, `\t`) and HTML entities.

---

## 12. Output

**JSON file only.** No CSV. No Excel.

- One output file per company: `{company}_jobs.json`
  - Example: `portmeirion_jobs.json`
- Errors file per company (only if errors exist): `{company}_errors.json`
- Job batches are written/appended as each group of 10 completes, so partial progress is preserved if the run is interrupted.

---

## 13. Code Style

- One line = one purpose
- Arrow functions where concise
- Early returns
- No try-catch blocks unless error handling needed
- Template literals for strings
- Destructuring for objects
- Filter/Map/Reduce in single chains
- No intermediate variables without reuse

---

## 14. Example Function Pattern

```ts
async function discoverJobUrls(company: string, url: string): Promise<string[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await autoScroll(page);
  const links = await page.$$eval("a[href*='job']", a => a.map(e => e.href));
  await browser.close();
  return [...new Set(links)];
}
```

---

## 15. Final Report

Console output, printed once per company after it completes:

```
Company: {name}
Discovered: {count}
Scraped: {count}
JSON: {filename}
```

---

## 16. Quality Rules

- No fabricated data
- No invented dates
- No estimated salary — check the salary range on the individual job detail page
- Listing page ≠ description source
- Description must come from the individual job detail page
- Description filtering: remove special characters, escape sequences (`\n`, `\t`), and HTML entities
- `ats` always `"HRMDirect"`

---

## 17. Example Scraper Structure

```ts
import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

interface Company { company: string; careerUrl: string }
interface Job { jobId: string; title: string; description: string; jobUrl: string;
  postedDate: string; jdDeadline: string; company: string; salaryRange: string;
  employmentType: string; worktype: string; location: string; city: string;
  state: string; country: string; ats: string }

const REF_DATE = "2026-08-14";
const COMPANY_CONCURRENCY = 5;
const JOB_CONCURRENCY = 10;

async function discoverJobUrls(company: string, url: string): Promise<string[]> { /* ... */ return [] }
async function scrapeJob(company: string, jobUrl: string): Promise<Job | null> { /* ... */ return null }
async function processCompany(c: Company): Promise<void> { /* discover -> batch scrape in 10s -> write JSON */ }

async function main() {
  const companies: Company[] = JSON.parse(fs.readFileSync("companies.json", "utf-8"));
  const queue = new PQueue({ concurrency: COMPANY_CONCURRENCY });
  await Promise.all(companies.map(c => queue.add(() => processCompany(c))));
}

main().catch(console.error);
```

---

## 18. Site Pattern — HCMDIRECT (Pattern D)

- **Listing**: Career/Jobs List page with **infinite scroll** — job entries load progressively as the page scrolls; keep scrolling until no new entries appear.
- **Discovery**: detect job URLs via, in priority order:
  1. **API** — intercept/replay the underlying network request returning job JSON
  2. **Dynamic** — Playwright-rendered DOM if no API is discoverable
  3. **DOM** — static HTML parsing as a last resort
- **Detail pages**: one URL per job, opened individually; all 15 schema fields extracted here, never from the listing page.
- **Batching**: job URLs for a company are grouped into batches of 10 for concurrent detail scraping.
- **Multi-company**: the same pattern is applied independently to each of the 5 companies being processed in parallel.

Other reference patterns (for non-HCMDIRECT sources, kept for compatibility):

### Pattern A: Table-based Listing with Static Detail Pages
- Listing: HTML table with job links in first column
- Detail selectors: `.field--name-field-salary-range .field__item`, `.field--name-field-date-range .field__item`, `.field--name-field-vacancy-location .field__item`, `.field--name-field-court .field__item`, `.field--name-field-duration .field__item`
- Description sections: `.field--name-field-position-description`, `.field--name-field-qualifications`, `.field--name-field-employee-benefits`
- External description fetching via Trakstar/hire.com links, "Job Announcement" links, or `.uscourts.gov` links
- Edge cases: PDF-only descriptions (leave description empty → job skipped per Section 6), "Open Until Filled" deadlines (store `null`)

### Pattern B: Iframe-based Listing
- Jobs loaded in iframe; detail URLs use hash fragment routing, e.g. `/#/job/details/{id}?target=frame`

### Pattern C: Direct API with Pagination
- Source: Google Cloud Talent API or similar ATS API
- Discovery: `offset`/`pageSize` pagination, results in `searchResults`
- Detail: full job data in single payload
- Date fields: `open_date` (posted), `close_date` (deadline)
- Dedup key: `requisitionId` or `id`
- Salary: may need regex extraction from description

---

**Result: Minimal TypeScript, JSON output per company, 5 companies in parallel for discovery, 10 jobs in parallel for detail scraping, every line significant.**