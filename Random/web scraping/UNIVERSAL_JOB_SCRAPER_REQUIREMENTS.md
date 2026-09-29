# Universal Job Scraper Requirements

## 1. Objective

Build a **concise job scraper** in TypeScript.

Each line of code must have significance. No bloat.

---

## 2. Source Code Requirement

**Single TypeScript file only.**

Example: `scraper.ts`

Requirements:
- Minimal code - every line serves a purpose
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

## 4. Target

Careers URL supplied at runtime or via config constant.

Target URL: `will be specified by the user`

---

## 5. Job Schema

Exactly 15 fields:

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
  ats: string; // always "Custom"
}
```

No additional fields. No internal fields in output.

---

## 6. Scraping Strategy

1. Detect job listing source (iframe, static HTML, API)
2. Discover job URLs with IDs
3. Scrape individual detail pages concurrently
4. Extract description from detail page
5. Use only explicit data - no inference
6. Default postedDate to reference date if not found
7.if teh website has pagination, scrape all pages. If not, scrape single page.
8.dont scrape jobs if that job doesnt have description in the detail page. If description is missing, skip that job.

Use Playwright only when necessary for JavaScript-rendered content.

---

## 7. Concurrency

```ts
const CONCURRENCY = 5;
```

Use PQueue for controlled concurrent requests.

---

## 8. Date Handling
check for postedDate in individual job detail page. If missing, use reference date.
Reference date: `2026-08-14`

if posteddate and deadline are missing use mexico rule. If postedDate is missing, use reference date. If deadline is missing, keep null.

If genuine postedDate unavailable, use reference date.
Filter jobs 30 days back from reference date.

only dates must be in the posteddates and jdDeadline fields. No other date formats allowed like "Open Until Filled" or "Immediate Start". If such values are found, keep null in the respective field.

---

## 9. Mexico Rule

If postedDate or deadline is missing apply location filter for Mexico. "Only include jobs with Mexico" indicators in location, city, state, or country fields.

Mexico indicators: "Mexico", "Mexico City", "Monterrey", "MX","New Mexico","NM" and keep the posted date as the reference date.

for every mexico related job keep state as NM
---

## 10. Deduplication

Use jobId. One job per unique ID.

---

## 11. Validation

Required fields: jobId, title, description, jobUrl, postedDate, company, ats

ats must equal "Custom" for every job.

dont include any special characters in the description field. Remove escape sequences (\n, \t) and HTML entities.

---

## 12. Output

**JSON file only.**

No CSV. No Excel.

Filename: `{company}_jobs.json`

Example: `portmeirion_jobs.json`

Errors file: `{company}_errors.json` (only if errors exist)

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
async function discover(url: string): Promise<string[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  const links = await page.$$eval("a[href*='job']", a => a.map(e => e.href));
  await browser.close();
  return [...new Set(links)];
}
```

---

## 15. Final Report

Console output:

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
- No estimated salary check salary range in individual job detail page
- Listing page ≠ description source
- Description must come from individual job detail page
- Description filtering: remove special characters, escape sequences (\n, \t), and HTML entities
- ats always "Custom"

---

## 17. Example Scraper Structure

```ts
import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = { url: "...", company: "...", refDate: "2026-08-14" };

interface Job { ... }

async function discover(): Promise<Partial<Job>[]> { ... }
async function scrape(job: Partial<Job>): Promise<Job> { ... }
async function main() { ... }

main().catch(console.error);
```

---

## 18. Site Patterns

### Pattern A: Table-based Listing with Static Detail Pages
- Listing: HTML table with job links in first column
- Detail: Separate page per job with structured fields
- Detail selectors:
  - Salary: `.field--name-field-salary-range .field__item`
  - Posted date: `.field--name-field-date-range .field__item` (format: "MM/DD/YYYY - MM/DD/YYYY" or "Open Until Filled")
  - Location: `.field--name-field-vacancy-location .field__item`
  - Company: `.field--name-field-court .field__item`
  - Employment type: `.field--name-field-duration .field__item`
  - Description sections: `.field--name-field-position-description`, `.field--name-field-qualifications`, `.field--name-field-employee-benefits`
- External description fetching:
  - Check for Trakstar/hire.com links: `a[href*='trakstar.com'], a[href*='hire.com']`
  - Check for "Job Announcement" links on detail page
  - Check for external court website links: `a[href*='.uscourts.gov']`
  - Fetch description from external pages when main page has no description
- Edge cases:
  - Some jobs have no HTML description (external PDF only) - description field will be empty
  - Jobs may have "Open Until Filled" as deadline
  - Date format variations: "MM/DD/YYYY - MM/DD/YYYY" vs "MM/DD/YYYY - Open Until Filled"
  
### Pattern B: Iframe-based Listing
- Jobs loaded in iframe
- Detail URLs use hash fragment routing
- Example: `/#/job/details/{id}?target=frame`

### Pattern C: Direct API with Pagination
- **Source**: Google Cloud Talent API or similar ATS API
- **Discovery**: Query API with `offset`/`pageSize` pagination
- **Response**: JSON array in `searchResults` field
- **Detail**: All job data in single payload (no separate detail page needed)
- **Filtering**: Custom attributes via query string parameters
- **Address parsing**: `addresses` array or `primary_city`/`primary_state`/`primary_country` fields
- **Date fields**: `open_date` (posted), `close_date` (deadline)
- **Pattern**: `fetchJobs(offset)` → `while (hasMore)` → `offset += pageSize`
- **Deduplication**: `requisitionId` or `id` field as `jobId`
- **Salary extraction**: May need regex extraction from description
- desciption must not contain any limited characters


---

**Result: Minimal TypeScript, JSON output only, every line significant.**
