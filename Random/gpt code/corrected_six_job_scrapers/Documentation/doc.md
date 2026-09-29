# Job Scraper Code Logic Documentation

## Purpose

This document explains the logic of each uploaded TypeScript job scraper in simple technical terms.

The scrapers follow a common pipeline:

1. Configure the target career website.
2. Open the website with Playwright.
3. Discover job postings and collect lightweight job information.
4. Open each job-detail page.
5. Extract description, dates, salary, employment type, location, and other fields.
6. Normalize and validate the data.
7. Keep jobs inside the configured date/location rules.
8. Limit concurrent detail-page scraping with `PQueue`.
9. Remove duplicate or incomplete records.
10. Save successful jobs and scraping errors as JSON.

> The explanations below describe the code as implemented in the uploaded files. They do not assume behavior that is not present in the source code.

---

# 1. `alamogordo_scraper.ts`

## Target

- Company: City of Alamogordo
- ATS: Tyler Technologies - Munis Self Service (ESS)
- Reference date: `2026-08-14`
- Detail-page concurrency: `3`

The configuration and output schema are defined at the beginning of the file. fileciteturn1file0L13-L40

## Imports

### `chromium, Browser` from Playwright
Used to launch a Chromium browser and create browser pages for scraping.

### `fs`
Used to write the final jobs JSON and error JSON files.

### `PQueue`
Used to control how many job-detail pages are scraped at the same time.

## Data Interfaces

### `Job`
Represents the final normalized job record.

It contains fields such as:

- `jobId`
- `title`
- `description`
- `jobUrl`
- `postedDate`
- `jdDeadline`
- `salaryRange`
- `employmentType`
- `location`
- `city`
- `state`
- `country`
- `ats`

### `PartialJob`
Represents information collected during job discovery.

It contains enough information to open and process the detailed job page later.

### `ErrorRecord`
Stores a job ID and the error that occurred while processing that job.

## Selectors

`SEL` stores the Munis-specific CSS selectors for:

- Rows-per-page control
- Next-page button
- Page-count label

Keeping these selectors in one object makes the scraper easier to maintain.

## `cleanDescription(value)`

**Purpose:** Normalize job-description text.

### Logic

1. Removes HTML tags.
2. Removes HTML entities.
3. Removes control characters.
4. Applies Unicode normalization.
5. Removes characters outside letters, numbers, and whitespace.
6. Converts repeated whitespace into one space.
7. Trims leading and trailing whitespace.

**Technical terms:** regex replacement, Unicode normalization, string sanitization, whitespace normalization.

## `parseMDY(str)`

**Purpose:** Convert an `MM/DD/YYYY` date into `YYYY-MM-DD`.

### Logic

1. Rejects empty input.
2. Uses a regular expression to validate the date shape.
3. Extracts month, day, and year.
4. Creates a UTC `Date`.
5. Returns an ISO date string.
6. Returns `null` when parsing fails.

**Technical terms:** regex parsing, UTC date construction, ISO-8601 formatting.

## `inWindow(postedDate)`

**Purpose:** Apply the 30-day posting-date filter.

The function compares the job date with `CONFIG.refDate` and accepts dates from 30 days before the reference date through the reference date itself. fileciteturn1file0L78-L91

**Technical terms:** timestamp comparison, date-range filtering.

## `discover(browser)`

**Purpose:** Discover job postings from the Munis job-list page.

### Main flow

1. Creates a new Playwright page.
2. Opens the configured career URL.
3. Changes the page size to 50 rows when the rows-per-page selector exists.
4. Scrapes the current page.
5. Extracts job IDs from `req`, `sreq`, or `postingId`.
6. Builds a normalized Munis detail URL.
7. Extracts title, description, minimum hourly rate, type, location, and posting dates.
8. Detects part-time/full-time text from the title.
9. Deduplicates jobs using request identifiers.
10. Moves through pagination until the last page or the 50-page safety limit.
11. Closes the page in `finally`.

### `scrapeCurrentPageJobs`

This nested function performs DOM extraction from the current list page.

It uses `page.$$eval()` so extraction happens inside the browser DOM.

The implementation deliberately uses standard loops in browser-evaluated code to avoid bundler-generated `__name` problems. fileciteturn1file0L112-L214

### Pagination and retry logic

The scraper retries extraction up to three times when Playwright reports:

`Execution context was destroyed`

It waits for the page to stabilize before retrying.

It then checks:

- whether the Next button is disabled,
- whether the page counter says the scraper is on the last page,
- whether `MAX_PAGES` has been reached.

The page counter is also used to wait until pagination actually changes. fileciteturn1file0L216-L292

## `scrape(browser, partial)`

**Purpose:** Scrape one detailed Munis job page.

### Logic

1. Opens a new page.
2. Navigates to the job URL.
3. Finds the job-detail card.
4. Extracts the full description.
5. Converts `<br>` elements to line breaks before reading text.
6. Uses card text as a fallback when the main description is too short.
7. Extracts posting start and posting end dates.
8. Cleans the description.
9. Rejects descriptions shorter than 50 characters.
10. Converts the posting date.
11. Applies the 30-day date filter.
12. Builds the final `Job` object.
13. Converts the minimum hourly rate into a salary string.
14. Closes the page.

The detailed extraction and final object construction are implemented in the latter part of the file. fileciteturn1file0L296-L424

## `main()`

**Purpose:** Orchestrate the complete scraper.

### Logic

1. Launches Chromium in headless mode.
2. Calls `discover()`.
3. Creates `PQueue` with concurrency `3`.
4. Queues every discovered job for `scrape()`.
5. Stores individual job errors without stopping the entire run.
6. Removes duplicate job IDs.
7. Verifies the ATS and required fields.
8. Writes `<Company>_jobs.json`.
9. Writes an error JSON file when errors exist.
10. Closes the browser.

**Technical terms:** orchestration, bounded concurrency, Promise aggregation, deduplication, persistence.

---

# 2. `farrow_ball_scraper.ts`

## Target

- Company: Farrow & Ball
- Career URL: `https://careers.farrow-ball.com/job-search`
- Reference date: `2026-08-14`
- Concurrency: `5`

The configuration and output structures are defined at the start of the file. fileciteturn1file1L489-L527

## `cleanDescription(value)`

Sanitizes description text by removing HTML, entities, control characters, unwanted Unicode characters, and repeated whitespace.

## `plain(value)`

**Purpose:** Convert different data types into a usable string.

### Handles

- `null` / `undefined`
- strings
- arrays
- objects
- primitive values

For objects it checks common schema/address properties such as:

- `name`
- `streetAddress`
- `addressLocality`
- `addressRegion`
- `addressCountry`
- `value`
- `text`

**Technical term:** defensive type normalization.

## `toDate(value)`

**Purpose:** Convert many date formats into `YYYY-MM-DD`.

### Supported logic

- `today`
- `yesterday`
- `N days ago`
- numeric dates using `/`, `-`, or `.`
- JavaScript-recognizable date strings

This is more flexible than the Alamogordo date parser. fileciteturn1file1L556-L587

## `toDeadline(value)`

Converts a deadline into a normalized date.

Special values such as:

- `open until filled`
- `immediate start`

are treated as no deadline and return `null`.

## `inWindow(postedDate)`

Accepts jobs posted from 30 days before `CONFIG.refDate` through the reference date.

## `isMexico(...)`

Checks multiple location-related strings for Mexico/New Mexico indicators.

This function is used by the scraper's special location/date inclusion logic.

## `locationParts(value)`

Splits a comma-separated location into:

- city
- state
- country

## `salaryRange(schema, fallback)`

**Purpose:** Extract salary from Schema.org `baseSalary`.

### Logic

1. Reads `schema.baseSalary`.
2. Supports a single salary value or an array.
3. Converts values through `plain()`.
4. Joins multiple values with `" - "`.
5. Falls back to the page salary when schema salary is unavailable.

## `discover(browser)`

**Purpose:** Discover Farrow & Ball job links.

### Main logic

1. Opens the job-search page.
2. Waits for the page to render.
3. Iterates through all Playwright frames, including iframes.
4. Searches for links containing job-related URL patterns.
5. Finds a suitable parent container around each job link.
6. Extracts title, location, salary, posted text, and deadline text.
7. Extracts the job ID from the URL.
8. Stores jobs in a `Map` to prevent duplicates.
9. Scrolls to the bottom.
10. Detects pagination when no new jobs are appearing.
11. Searches all frames for a Next control.
12. Checks visibility and disabled state before clicking.
13. Continues until no usable Next control exists.

The frame-aware extraction and pagination strategy are implemented in `discover()`. fileciteturn1file1L626-L779

## `scrape(browser, partial)`

**Purpose:** Build a complete job record from one detail page.

### Data sources

The scraper uses three extraction layers:

1. **JSON-LD / Schema.org**
2. **DOM description**
3. **Page text regexes**

### JSON-LD extraction

It searches:

`script[type="application/ld+json"]`

Then:

1. Parses JSON.
2. Handles arrays and `@graph`.
3. Finds an object whose `@type` is `JobPosting`.
4. Uses that structured data when available.

### DOM description fallback

It checks several selectors, including:

- `[itemprop="description"]`
- `.description`
- `.job-description`
- `main`
- `article`

The first usable description is returned.

### Page metadata extraction

Regexes extract:

- posted date
- deadline
- salary
- employment type
- work type
- location

### Validation

The scraper:

- cleans the description,
- parses dates,
- extracts schema location,
- checks the Mexico/New Mexico rule,
- applies the 30-day date window,
- derives city/state/country,
- builds the final job object.

This detail-page logic is implemented in the middle section of the file. fileciteturn1file1L781-L883

## `main()`

Orchestrates the run:

1. Launch browser.
2. Discover jobs.
3. Create a queue with concurrency `5`.
4. Scrape jobs concurrently.
5. Capture individual errors.
6. Deduplicate by job ID.
7. Require ATS `"Custom"`.
8. Require important fields.
9. Write jobs JSON.
10. Write errors JSON when needed.
11. Close browser.

---

# 3. `arona_scraper.ts`

## Target

- Company: Arona Home Essentials
- Platform URL: `https://arona-home-essentials.hiringthing.com/`
- Reference date: `2026-08-14`
- Concurrency: `5`

The configuration and normalized job interfaces are defined at the top. fileciteturn1file2L937-L972

## `cleanDescription(value)`

Normalizes raw job-description text by removing HTML, entities, control characters, unsupported characters, and duplicate whitespace.

## `plain(value)`

Converts unknown values into strings.

It is especially useful for Schema.org objects because a field can be a string, array, or nested object.

## `toDate(value)`

Uses the generic JavaScript date parser and returns an ISO date.

## `toDeadline(value)`

Returns `null` for phrases such as `open until filled` and `immediate start`; otherwise it calls `toDate()`.

## `isMexico(...)`

Searches all supplied values for configured Mexico/New Mexico indicators.

## `inWindow(postedDate)`

Checks whether the posting date is inside the 30-day reference window.

## `locationParts(value)`

Splits a location string into city and state.

## `salaryRange(schema, fallback)`

Reads salary from Schema.org.

It supports:

- scalar `value`
- array `value`
- `minValue`
- `maxValue`
- `minSalary`
- `maxSalary`

If schema salary is unavailable, it returns the fallback page salary.

## `discover(browser)`

**Purpose:** Find every job listing on HiringThing.

### Logic

1. Opens a new page.
2. Starts with the configured URL.
3. Maintains `seenPages` to prevent pagination loops.
4. Navigates to the current page.
5. Finds job links using multiple URL patterns.
6. Extracts job ID from the URL.
7. Extracts title from link text or accessibility attributes.
8. Looks at the surrounding container for location text.
9. Stores unique jobs in a `Map`.
10. Searches for a Next link using multiple selectors.
11. Also supports `"next"` and `"siguiente"` text.
12. Stops when no next page exists or a page repeats.

The page-loop and link extraction are shown in the uploaded source. fileciteturn1file2L1059-L1161

## `scrape(browser, partial)`

### Phase 1: JSON-LD

Searches for `JobPosting` JSON-LD data.

### Phase 2: DOM description

Checks common description selectors and falls back to the page body text.

### Phase 3: Page metadata

Extracts posted date, deadline, salary, employment type, work type, and location using regexes.

### Phase 4: Location

Prefers Schema.org address data and falls back to discovered/page location.

### Phase 5: Filtering

A job is rejected when:

- description is missing,
- neither posting date nor deadline is available,
- Mexico-related special inclusion conditions are not satisfied,
- posting date is outside the 30-day window.

### Phase 6: Output

Builds the normalized `Job` record with ATS `"Custom"`.

The detail-page extraction and filtering logic appear in the uploaded source. fileciteturn1file2L1163-L1303

## `main()`

1. Launches Chromium.
2. Discovers jobs.
3. Creates `PQueue` with concurrency `5`.
4. Scrapes jobs.
5. Converts failed tasks to `null` while storing errors.
6. Deduplicates.
7. Validates required fields.
8. Writes jobs JSON.
9. Writes errors JSON if needed.
10. Closes Chromium.

---

# 4. `garver_scraper.ts`

## Target

- Company: Garver
- Career URL: `https://www.garverusa.com/careers/job-listings`
- Reference date: `2026-08-14`
- Concurrency: `5`

The scraper's configuration and output types are defined at the beginning. fileciteturn1file3L1372-L1407

## `cleanDescription(value)`

Sanitizes description text.

In addition to standard cleanup, it removes everything beginning with:

- `Apply Now`
- `Get In Touch`

This prevents page-navigation/footer content from entering the job description.

## `plain(value)`

Converts strings, arrays, objects, and primitive values to normalized text.

## `toDate(value)`

Supports:

- explicit `MM/DD/YYYY`
- other dates accepted by JavaScript's `Date` parser.

## `toDeadline(value)`

Converts a deadline to a normalized date unless it contains an open-ended phrase such as `open until filled`.

## `inWindow(postedDate)`

Checks the 30-day posting window.

## `isNMState(...)`

**Purpose:** Detect New Mexico as a U.S. state.

Recognizes:

- `New Mexico`
- `NM`

## `isMxCountry(...)`

**Purpose:** Detect actual Mexico.

It first removes `New Mexico` and `NM`, then searches for Mexico-specific indicators.

This separation is important because the strings `Mexico` and `New Mexico` can otherwise cause incorrect country classification. fileciteturn1file3L1464-L1478

## `locationParts(value)`

Splits location into city and state.

## `salaryRange(schema, fallback)`

Extracts Schema.org salary information and falls back to page text when necessary.

## `discover(browser)`

### Logic

1. Opens the Garver careers page.
2. Uses `domcontentloaded` first.
3. Waits for network idle when possible.
4. Scans all links.
5. Keeps links matching `/careers/jobdescription/`.
6. Removes navigation/action links such as Apply, Share, Print, and Menu.
7. Extracts the `gni` query parameter as job ID.
8. Extracts location from table cells.
9. If table location is unavailable, derives location from URL path segments.
10. Uses URL path/query as a fallback job ID.
11. Deduplicates jobs with a `Map`.
12. Handles Next, Load More, and Show More controls.

The discovery implementation is shown in the uploaded file. fileciteturn1file3L1505-L1617

## `scrape(browser, partial)`

### Data extraction layers

The scraper combines:

1. Schema.org JSON-LD
2. DOM description
3. Regex-based page metadata
4. Discovered location
5. Schema.org address

### Description

It checks multiple selectors and chooses the longest useful description above the minimum length.

### Metadata

Anchored regular expressions look for fields such as:

- Posted
- Closing Date
- Salary
- Employment Type
- Work Type
- Location

Anchoring the expressions to the beginning of a line reduces accidental matches inside normal job-description paragraphs.

### Location rules

The scraper separately checks:

- New Mexico state
- Mexico country

Then assigns:

- `NM + USA` for New Mexico
- `Mexico` for actual Mexico

It also uses remote detection when the location contains `remote`.

The detail-page filtering and final object construction are implemented in the source. fileciteturn1file3L1619-L1783

## `main()`

Controls the complete pipeline:

1. Launch browser.
2. Discover jobs.
3. Create bounded-concurrency queue.
4. Scrape each job.
5. Record individual failures.
6. Deduplicate.
7. Validate mandatory fields.
8. Write jobs JSON.
9. Write errors JSON.
10. Print summary.
11. Close browser.

---

# 5. `socorro_scraper.ts`

## Target

- Company: Socorro Consolidated School District
- Platform: TEDK12
- Reference date: `2026-08-14`
- Concurrency: `5`

The configuration and data interfaces are defined at the top of the file. fileciteturn1file4L1854-L1891

## `cleanDescription(value)`

Removes HTML tags, HTML entities, control characters, unsupported characters, and repeated whitespace.

## `plain(value)`

Safely converts unknown values into strings.

## `toDate(value)`

Supports an explicit `MM/DD/YYYY` pattern and then falls back to JavaScript date parsing.

## `inWindow(postedDate)`

Accepts posting dates inside the configured 30-day window.

## `isMexicoCountry(...)`

Checks for actual Mexico indicators such as:

- Mexico City
- Monterrey
- MX

## `isNewMexico(...)`

Checks for New Mexico indicators:

- New Mexico
- NM

## `hasMexicoIndicator(...)`

Combines the two detection functions with logical OR.

A job is considered to have a relevant Mexico/New Mexico location indicator when either function returns `true`.

## `discover(browser)`

**Purpose:** Read job rows directly from the TEDK12 table.

### Logic

1. Opens the job-list page.
2. Waits for DOM content.
3. Finds rows whose IDs start with `JobList_`.
4. Requires at least four table cells.
5. Finds the job link in the first cell.
6. Extracts:
   - title
   - posted date
   - employment type
   - location
7. Converts relative job URLs to absolute URLs.
8. Extracts `jobid` from the URL.
9. Returns the discovered `PartialJob[]`.

The row-based extraction is implemented directly against the TEDK12 DOM. fileciteturn1file4L1951-L1986

## `scrape(browser, partial)`

### Metadata extraction

Reads:

- `#lblLocationName`
- `#lblSalary`
- `#lblShiftType`

### Description extraction

TEDK12 can place the description inside a separate frame.

The scraper first checks existing Playwright frames for `ViewJob_Description.aspx`.

If that fails, it searches the page for the description iframe and opens its source in a temporary browser page.

This is an important iframe-handling strategy.

### Validation

The description is cleaned and must be at least 100 characters.

### Date logic

The posting date comes from the discovered list-page date.

The current implementation sets:

`deadlineValue = null`

so this scraper does not extract a deadline from the detail page.

### Location logic

The scraper defaults to:

`Socorro, NM`

when neither detail-page nor discovered location is available.

It separately detects actual Mexico and New Mexico, then assigns the country accordingly.

### Special inclusion rule

When both posting date and deadline are missing, the scraper only keeps the job if a Mexico/New Mexico indicator exists.

Finally, it applies the 30-day date filter and constructs the normalized `Job`.

The iframe extraction, filtering, and output logic are visible in the source. fileciteturn1file4L1988-L2059

## `main()`

The main function follows the same standard orchestration pattern:

1. Launch Chromium.
2. Discover jobs.
3. Create a `PQueue`.
4. Scrape jobs concurrently.
5. Capture errors.
6. Filter/deduplicate results.
7. Write JSON output.
8. Write error output when necessary.
9. Close the browser.

---

# 6. Common Architecture Across the Five Scrapers

Although each website requires different selectors and extraction rules, the architecture is broadly the same.

```text
CONFIG
  ↓
Launch Chromium
  ↓
discover()
  ↓
PartialJob[]
  ↓
PQueue
  ↓
scrape() for each job
  ↓
Normalize data
  ↓
Date / location / description validation
  ↓
Deduplicate + required-field validation
  ↓
jobs.json
       +
errors.json
```

## Why `discover()` and `scrape()` are separate

This is a two-stage scraping architecture.

### Stage 1 — Discovery

Collect only enough information to identify each job:

```text
jobId
title
jobUrl
location
```

### Stage 2 — Detail scraping

Open each job URL and collect the complete record:

```text
description
postedDate
deadline
salary
employmentType
worktype
location
city
state
country
ats
```

This separation avoids repeatedly loading the listing page for every job.

---

# 7. Important Technical Concepts Used

## Playwright

Playwright controls a real browser.

The scrapers use it for:

- navigation
- DOM access
- JavaScript-rendered content
- frames/iframes
- pagination
- selectors
- page evaluation

## `page.evaluate()`

Runs JavaScript inside the browser page.

This is useful when the required data exists in the browser's DOM rather than in the Node.js process.

## `page.$$eval()`

Runs a function against all elements matching a selector.

Typical use:

```text
find all job links
→ iterate through them
→ extract structured values
```

## JSON-LD / Schema.org

Several scrapers search:

```text
script[type="application/ld+json"]
```

and look for:

```text
@type = JobPosting
```

This is useful because job data can be available in structured form even when the visible DOM is complicated.

## DOM fallback

When structured data is missing, the scrapers use CSS selectors and visible page text.

This creates a fallback hierarchy:

```text
Structured data
    ↓
Specific DOM selectors
    ↓
Generic DOM/page text
```

## Regex

Regular expressions are used for:

- dates
- job IDs
- salary
- metadata labels
- location indicators
- URL patterns

## `Map` and `Set`

### `Map`

Used to store unique jobs by job ID.

### `Set`

Used to detect duplicate IDs or already-visited pages.

This prevents duplicate output and pagination loops.

## `PQueue`

`PQueue` limits simultaneous detail-page scraping.

For example:

```text
concurrency = 5
```

means at most five queued `scrape()` operations execute simultaneously.

This protects the target website and prevents excessive browser resource usage.

## `Promise.all()`

Waits for all queued scrape promises to finish before continuing to validation and file output.

## `try/finally`

The scrapers consistently use `finally` to close Playwright pages and the browser even when an exception occurs.

This is important for preventing leaked browser resources.

---

# 8. Error Handling Strategy

The scrapers generally use two levels of error handling.

## Job-level errors

A single failed job is recorded in an `ErrorRecord` rather than stopping the entire company scrape.

Conceptually:

```text
Job A → success
Job B → error → record error
Job C → success
```

The successful jobs can still be written to JSON.

## Resource cleanup

`finally` blocks close:

- individual pages
- temporary iframe pages
- the browser

This ensures cleanup even when scraping fails.

---

# 9. Output Validation

Before writing jobs to the final JSON file, the scrapers generally check:

- job exists
- job ID is present
- title is present
- description is present
- URL is present
- posted date is present
- company is present
- ATS matches the expected value
- job ID is not duplicated

This creates a final quality gate between scraping and persistence.

---

# 10. Key Difference Between the Scrapers

| File | Website/Platform | Main Discovery Strategy | Main Detail Strategy |
|---|---|---|---|
| `alamogordo_scraper.ts` | Munis Self Service | Table cards + pagination | Munis job-detail card |
| `farrow_ball_scraper.ts` | Farrow & Ball | Job links across frames + pagination | JSON-LD + DOM + regex |
| `arona_scraper.ts` | HiringThing | Job URL patterns + Next links | JSON-LD + DOM + regex |
| `garver_scraper.ts` | Garver careers | Job-description URLs + pagination | JSON-LD + DOM + regex |
| `socorro_scraper.ts` | TEDK12 | Job-list table rows | Page metadata + iframe description |

---

# 11. Simple Mental Model

Think of every scraper as four functions even when the actual code contains more helpers:

### 1. FIND

Find job URLs.

### 2. OPEN

Open each job page.

### 3. EXTRACT

Extract job information.

### 4. FILTER

Keep only valid jobs and save them.

```text
Website
  ↓
Find jobs
  ↓
Open job
  ↓
Extract fields
  ↓
Clean fields
  ↓
Check date/location
  ↓
Remove duplicates
  ↓
Save JSON
```

This is the core logic shared by all five TypeScript files.

---

# Job Scraper Code Logic Documentation

## Purpose

This document explains the logic of the uploaded TypeScript job scrapers in simple language with the relevant technical terms.

It also identifies the **scraping type used by each company**:

- **Static HTML / HTTP scraping** — requests HTML directly without launching a browser.
- **Dynamic browser/DOM scraping** — uses Playwright/Chromium to execute JavaScript and interact with the rendered DOM.
- **API-based scraping** — directly calls a structured API endpoint such as REST/GraphQL rather than scraping HTML.

> Important: “static” and “dynamic” describe how the data is obtained. A site can technically be dynamic in the browser while a scraper still uses a simpler HTTP request if the required HTML is already present in the server response.

---

# 1. Scraping Method Summary

| Company / File | Main Technology | Scraping Type | API-Based? | Main Reason |
|---|---|---|---|---|
| City of Alamogordo | Playwright | **Dynamic / DOM** | No | Uses Chromium, DOM selectors, pagination, rendered page content |
| Farrow & Ball | Playwright | **Dynamic / DOM** | No | Uses browser frames, DOM extraction, JSON-LD, pagination |
| Arona Home Essentials | Playwright | **Dynamic / DOM** | No | Uses Chromium, rendered DOM, job links and pagination |
| Garver | Playwright | **Dynamic / DOM** | No | Uses Chromium, DOM selectors, rendered content and pagination |
| Socorro Consolidated School District | Playwright | **Dynamic / DOM** | No | Uses Chromium, DOM and iframe content |
| US Courts | Axios + Cheerio | **Static HTML / HTTP** | No | Downloads HTML directly and parses it without a browser |

## Key distinction

The **US Courts scraper is different from the other five**.

The US Courts scraper imports `axios` and `cheerio`, and its discovery/detail functions request HTML directly with `axios.get()` and parse it with Cheerio. fileciteturn2file0L1-L12

The other five scrapers use Playwright/Chromium, so they are browser-based DOM scrapers.

---

# 2. `alamogordo_scraper.ts`

## Scraping type

**Dynamic browser / DOM scraping**

### Why?

The scraper launches Chromium through Playwright and uses browser-page operations such as:

- `page.goto()`
- `page.evaluate()`
- DOM selectors
- pagination controls
- rendered page content

It therefore behaves as a browser automation scraper rather than a direct HTTP HTML scraper.

## Main flow

```text
Munis career page
      ↓
Launch Chromium
      ↓
Discover job rows/cards
      ↓
Extract job IDs + URLs
      ↓
Navigate through pagination
      ↓
Open individual job pages
      ↓
Extract description + metadata
      ↓
Normalize dates/location/salary
      ↓
Apply 30-day filter
      ↓
Deduplicate
      ↓
Write JSON
```

## Important functions

### `cleanDescription()`

Cleans raw HTML/text.

**Technical terms:** regex sanitization, Unicode normalization, whitespace normalization.

### `parseMDY()`

Converts `MM/DD/YYYY` into `YYYY-MM-DD`.

**Technical terms:** regex parsing, date normalization, ISO-8601.

### `inWindow()`

Checks whether a job was posted within the configured 30-day window.

**Technical terms:** timestamp comparison, date-range filtering.

### `discover()`

Finds jobs from the Munis listing page.

It extracts IDs, URLs, titles, locations, salary information and dates, handles pagination, and removes duplicates.

### `scrape()`

Opens an individual job page and extracts the complete job record.

### `main()`

Controls the entire pipeline, uses bounded concurrency, validates records, and writes JSON.

---

# 3. `farrow_ball_scraper.ts`

## Scraping type

**Dynamic browser / DOM scraping**

It uses Playwright and Chromium and additionally searches through browser frames/iframes.

## Main flow

```text
Farrow & Ball job-search page
      ↓
Launch browser
      ↓
Inspect page + frames
      ↓
Find job links
      ↓
Extract partial jobs
      ↓
Handle pagination
      ↓
Open each job page
      ↓
Read JSON-LD JobPosting
      ↓
Fallback to DOM/page text
      ↓
Normalize data
      ↓
Apply date/location rules
      ↓
Save JSON
```

## Important functions

### `cleanDescription()`

Removes HTML and unwanted characters.

### `plain()`

Converts strings, arrays and objects into usable text.

Useful for structured JSON-LD fields.

### `toDate()`

Normalizes different date formats into `YYYY-MM-DD`.

It also understands relative expressions such as `today`, `yesterday`, and `N days ago`.

### `toDeadline()`

Normalizes closing dates and treats open-ended phrases as no deadline.

### `isMexico()`

Checks location strings for configured Mexico/New Mexico indicators.

### `salaryRange()`

Extracts salary from Schema.org `baseSalary`, with a page-text fallback.

### `discover()`

Searches job links across all page frames, deduplicates jobs using a `Map`, scrolls the page, and handles Next pagination.

### `scrape()`

Uses three extraction layers:

```text
JSON-LD
   ↓
DOM selectors
   ↓
Page-text regex
```

This makes the scraper more resilient when one source is missing.

### `main()`

Runs discovery, queues detail scraping with concurrency `5`, validates results, and saves JSON.

---

# 4. `arona_scraper.ts`

## Scraping type

**Dynamic browser / DOM scraping**

The scraper uses Playwright's Chromium browser and extracts data from the rendered page DOM.

## Main flow

```text
HiringThing
    ↓
Chromium
    ↓
Find job links
    ↓
Extract job ID/title/location
    ↓
Follow Next pages
    ↓
Open job detail
    ↓
Read JSON-LD
    ↓
Fallback to DOM
    ↓
Extract page metadata
    ↓
Filter dates/location
    ↓
Output JSON
```

## Important functions

### `cleanDescription()`

Sanitizes job descriptions.

### `plain()`

Converts unknown JSON/DOM values into strings.

### `toDate()`

Normalizes dates.

### `toDeadline()`

Handles deadline text and open-ended postings.

### `isMexico()`

Detects configured Mexico/New Mexico indicators.

### `inWindow()`

Applies the 30-day posting window.

### `locationParts()`

Splits location text into city/state.

### `salaryRange()`

Extracts salary from Schema.org and supports multiple schema salary formats.

### `discover()`

Uses job URL patterns to identify HiringThing postings.

It also tracks visited pages with a `Set` to prevent pagination loops.

### `scrape()`

Extracts:

- description
- posted date
- deadline
- salary
- employment type
- work type
- location
- address

It prefers Schema.org data and falls back to DOM/page text.

### `main()`

Runs the scraper with concurrency `5`, catches individual errors, removes duplicate jobs and writes JSON.

---

# 5. `garver_scraper.ts`

## Scraping type

**Dynamic browser / DOM scraping**

## Main flow

```text
Garver careers
    ↓
Chromium
    ↓
Find /careers/jobdescription/ links
    ↓
Extract gni/job ID
    ↓
Extract location
    ↓
Handle Next / Load More / Show More
    ↓
Open job page
    ↓
JSON-LD + DOM + regex
    ↓
Location classification
    ↓
Date filtering
    ↓
Save JSON
```

## Important functions

### `cleanDescription()`

Cleans HTML and also removes content after phrases such as `Apply Now` and `Get In Touch`.

### `plain()`

Normalizes unknown values into strings.

### `toDate()`

Handles explicit US dates and normal JavaScript date strings.

### `toDeadline()`

Converts closing-date information.

### `isNMState()`

Detects **New Mexico as a US state**.

Recognizes:

- `New Mexico`
- `NM`

### `isMxCountry()`

Detects **Mexico as a country** while deliberately removing `New Mexico` and `NM` before testing.

This prevents the important classification error:

```text
New Mexico ≠ Mexico
```

### `salaryRange()`

Reads salary information from Schema.org.

### `discover()`

Finds Garver job-description URLs, extracts IDs and locations, deduplicates jobs, and handles pagination/load-more controls.

### `scrape()`

Uses:

1. JSON-LD
2. DOM selectors
3. regex-based page metadata
4. discovered location
5. Schema.org address

It also identifies remote jobs when the location contains `remote`.

### `main()`

Runs discovery and concurrent detail scraping, validates results, writes JSON and closes the browser.

---

# 6. `socorro_scraper.ts`

## Scraping type

**Dynamic browser / DOM + iframe scraping**

This scraper uses Playwright because the job description can be inside a separate iframe.

## Main flow

```text
TEDK12 job list
      ↓
Chromium
      ↓
Read JobList table rows
      ↓
Extract job IDs + URLs
      ↓
Open detail page
      ↓
Read location/salary/shift
      ↓
Find description iframe
      ↓
Extract iframe content
      ↓
Clean description
      ↓
Apply date/location rules
      ↓
Save JSON
```

## Important functions

### `cleanDescription()`

Normalizes raw description text.

### `plain()`

Safely converts different data types into strings.

### `toDate()`

Normalizes date strings.

### `inWindow()`

Applies the 30-day date filter.

### `isMexicoCountry()`

Detects actual Mexico indicators.

### `isNewMexico()`

Detects New Mexico indicators.

### `hasMexicoIndicator()`

Returns true when either Mexico or New Mexico indicators are present.

### `discover()`

Reads TEDK12 table rows directly.

It extracts:

- title
- posted date
- employment type
- location
- job URL
- job ID

### `scrape()`

Reads detail-page fields and then searches for the description iframe.

If the frame already exists, it reads it directly.

Otherwise, it finds the iframe URL, opens it in a temporary page, extracts the body text, and closes the temporary page.

This is why this scraper is particularly dependent on browser/DOM behavior.

### `main()`

Runs discovery, queues jobs with concurrency `5`, captures errors, validates results and writes JSON.

---

# 7. `uscourts_scraper.ts`

## Scraping type

# **Static HTML / HTTP scraping**

This is the major difference from the Playwright scrapers.

The file imports:

```text
axios
cheerio
fs
PQueue
```

and does **not** import Playwright or Chromium. fileciteturn2file0L1-L12

Therefore the scraper directly downloads HTML and parses it.

## Is it API-based?

**No.**

It uses HTTP requests through Axios, but that does not automatically make it API scraping.

The scraper requests normal website pages:

```text
https://www.uscourts.gov/careers/search-judiciary-jobs
```

and parses their HTML.

So the correct classification is:

> **HTTP-based static HTML scraping using Axios + Cheerio**

not:

> API scraping.

## Main flow

```text
US Courts career page
       ↓
Axios GET request
       ↓
HTML response
       ↓
Cheerio parses HTML
       ↓
Read table rows
       ↓
Extract job URLs
       ↓
Request each job page
       ↓
Extract fields with CSS selectors
       ↓
Validate description
       ↓
Optional external job-page fallback
       ↓
Normalize dates/location
       ↓
30-day filter
       ↓
PQueue concurrency = 5
       ↓
Deduplicate
       ↓
Save JSON
```

## `cleanDescription(raw)`

Cleans the downloaded HTML/text.

It removes:

- HTML tags
- HTML entities
- control characters
- unsupported characters
- repeated whitespace

**Technical terms:** HTML sanitization, regex replacement, text normalization.

The implementation is shown in the source. fileciteturn2file0L53-L61

## `isNavContent(text)`

Checks whether extracted text looks like website navigation instead of a job description.

It considers the text navigation content when at least three configured navigation patterns match.

**Technical term:** heuristic validation.

## `isPdfContent(text)`

Checks whether the extracted text looks like PDF/object data.

It searches for patterns such as:

- `endobj`
- `stream`
- `xref`
- `trailer`

## `isValidDescription(text)`

Rejects descriptions when:

- empty
- shorter than 200 characters
- detected as PDF content
- detected as navigation content

This is a content-quality filter. fileciteturn2file0L63-L73

## `parseDate(raw)`

Converts a date string into `YYYY-MM-DD`.

It first checks the explicit:

```text
MM/DD/YYYY
```

format and then falls back to JavaScript's `Date` parser.

## `parseDeadline(raw)`

Parses a closing date.

It returns `null` for:

- `open until filled`
- `immediate start`

## `parseDateRange(raw)`

Handles a combined date range.

For example conceptually:

```text
08/01/2026 - 08/20/2026
```

becomes:

```text
posted   = 2026-08-01
deadline = 2026-08-20
```

## `isInWindow(date)`

Checks whether the posting date falls within 30 days before `CONFIG.refDate`.

## `isMexico(...values)`

Checks supplied location values for configured Mexico/New Mexico indicators.

## `parseLocation(location)`

Splits a location string into:

```text
city
state
```

It has special handling for two-letter US state abbreviations.

## `discoverPage(page)`

**Purpose:** Discover jobs on one US Courts listing page.

### Logic

1. Builds the URL.
2. Sends an Axios GET request.
3. Loads the HTML into Cheerio.
4. Finds:

```text
table tbody tr
```

5. Gets the first-column job link.
6. Extracts title.
7. Extracts job ID from the URL.
8. Extracts location from the fourth table cell.
9. Converts relative URLs into absolute URLs.
10. Returns `PartialJob[]`.

This is pure server-response HTML parsing; no browser is required. fileciteturn2file0L122-L136

## `discover()`

Loops through pages:

```text
page 0
page 1
page 2
...
```

It maintains a `Set` of seen job IDs.

The loop stops when:

- the current page has no jobs, or
- no new job IDs were added.

This prevents unnecessary requests and duplicate jobs. fileciteturn2file0L139-L154

## `scrape(partial)`

Requests one job-detail URL with Axios.

Then Cheerio extracts:

- date range
- location
- salary
- employment type
- description

The primary description is assembled from:

- position description
- qualifications
- employee benefits

The code then validates the description.

## External description fallback

If the description is invalid, the scraper searches for links pointing to:

- `trakstar.com`
- `hire.com`
- `uscourts.gov`

It can then request the external page and extract text from:

```text
main
article
body
```

This is a **fallback HTTP scrape**, not an API call. fileciteturn2file0L168-L188

## Date/location filtering

The scraper rejects jobs when there is:

- no posting date,
- no deadline,
- and no configured Mexico indicator.

Then it applies the 30-day posting window.

## Final job construction

The output contains:

- job ID
- title
- cleaned description
- URL
- posted date
- deadline
- company
- salary
- employment type
- work type
- location
- city
- state
- country
- ATS

The source sets `worktype` to an empty string and `ats` to `"Custom"`. fileciteturn2file0L201-L216

## `main()`

The orchestration function:

1. Discovers jobs.
2. Creates `PQueue({ concurrency: 5 })`.
3. Scrapes detail pages concurrently.
4. Stores individual errors.
5. Deduplicates job IDs.
6. Checks required fields.
7. Writes `<company>_jobs.json`.
8. Writes `<company>_errors.json` when needed.
9. Prints the summary.

The queue, validation and file-output logic are shown in the source. fileciteturn2file0L220-L261

---

# 8. Dynamic vs Static vs API-Based

## Static HTML scraping

### Basic idea

```text
HTTP request
   ↓
HTML response
   ↓
HTML parser
   ↓
Extract data
```

Typical tools:

- Axios
- Fetch
- Cheerio

### Used by

**US Courts**

```text
Axios → HTML → Cheerio → data
```

This is efficient because it does not need a browser.

---

## Dynamic / browser scraping

### Basic idea

```text
Launch browser
   ↓
Load page
   ↓
JavaScript executes
   ↓
DOM is rendered
   ↓
Interact/extract
```

Typical tool:

- Playwright

### Used by

- City of Alamogordo
- Farrow & Ball
- Arona Home Essentials
- Garver
- Socorro Consolidated School District

These scrapers need browser behavior such as DOM rendering, pagination controls, frames, or iframe access.

---

## API-based scraping

### Basic idea

```text
HTTP request
   ↓
API endpoint
   ↓
JSON response
   ↓
Parse JSON
```

Example:

```text
GET /api/jobs
```

or:

```text
POST /graphql
```

The current six uploaded scrapers **do not appear to use a dedicated job API endpoint**.

They either:

- scrape rendered browser DOM with Playwright, or
- download HTML directly with Axios/Cheerio.

So the classification is:

| Scraper | Type |
|---|---|
| Alamogordo | Dynamic / DOM |
| Farrow & Ball | Dynamic / DOM |
| Arona Home Essentials | Dynamic / DOM |
| Garver | Dynamic / DOM |
| Socorro | Dynamic / DOM + iframe |
| US Courts | Static HTML / HTTP |

---

# 9. One Important Technical Distinction

## `Axios` does NOT automatically mean API scraping

This is a common beginner mistake.

For US Courts:

```ts
axios.get("https://www.uscourts.gov/careers/search-judiciary-jobs")
```

is an HTTP request, but the response is a **webpage HTML document**.

Then:

```ts
cheerio.load(data)
```

parses that HTML.

Therefore:

```text
Axios + HTML page + Cheerio
        =
Static HTML scraping
```

Whereas:

```text
Axios/Fetch + /api/jobs + JSON
        =
API-based scraping
```

---

# 10. Overall Architecture

Across all six companies, the high-level architecture is:

```text
                  JOB WEBSITE
                       │
          ┌────────────┴────────────┐
          │                         │
     Browser route              HTTP route
          │                         │
      Playwright              Axios + Cheerio
          │                         │
     Rendered DOM                HTML
          │                         │
          └────────────┬────────────┘
                       │
                 Job discovery
                       │
                 PartialJob[]
                       │
                 Detail scraping
                       │
                Data extraction
                       │
              Cleaning / normalization
                       │
             Date + location filtering
                       │
                 Deduplication
                       │
               Required-field check
                       │
                 JSON persistence
```

---

# 11. Simple Mental Model

For learning purposes, remember:

### Static

**"Give me the HTML."**

```text
Axios → HTML → Cheerio
```

### Dynamic

**"Open the website like a user."**

```text
Playwright → Browser → DOM
```

### API

**"Give me the structured data."**

```text
HTTP → API → JSON
```

### Your current scrapers

```text
Alamogordo       → Dynamic
Farrow & Ball    → Dynamic
Arona            → Dynamic
Garver           → Dynamic
Socorro          → Dynamic + iframe
US Courts        → Static HTML
```

None of the six files currently use a dedicated job-listing API based on the uploaded source code.
