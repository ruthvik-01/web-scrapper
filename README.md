# UK company job scraper

## Universal UK-only Scraper (All 75 Companies)

The [implementation report](docs/universal-implementation/README.md) covers all 75 companies across 13 platform engines (Comeet, Eploy, Jobtrain, WordPress, Custom ATS, Reed, Haystack, Tribepad, JobAdder, Portobello, Occy, Supabase, JobToday). UK eligibility comes from strict deterministic location checking; foreign/unknown roles and NHS Jobs are excluded.

```powershell
npm ci
npm run build
npm run scrape:universal
npm.cmd run scrape:universal -- --list
npm.cmd run scrape:universal -- --company "Aqua Security"
npm.cmd run scrape:universal -- --platform comeet
```

- `src/filters.ts`: Dedicated UK location/nation validation, 2-calendar-month clamped date windows, salary range verification, and NHS Jobs exclusion.
- `src/common-utils.ts`: Standardized HTML/text normalization, canonical URL resolution, RFC 4180 BOM UTF-8 CSV serialization, and directory management.
- `universal_scraper_production/`: Standalone, self-contained package folder ready to share with team members.

Complete universal datasets are written to `../output/universal-runs/<timestamp>-<runId>/` (or `FIELDWORK_DATA_DIR/output/universal-runs/`), with combined 15-column CSV/JSON, individual company folders and reports. The dashboard's Exports page lists/downloads complete runs. `--out` overrides the output root. Partial/error runs retain diagnostics and block combined exports.

## Local dashboard

```powershell
npm install
npm start
```

Open `http://127.0.0.1:4317`. Keep the terminal running.

The **Fieldwork** dashboard reads `COMPANIE LIST.xlsx` and groups identical careers URLs (currently 100 workbook rows / 98 careers sites). It imports existing company exports without changing them.

### Upload other spreadsheets

Use **Upload data** in the top bar. Supported formats: `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.csv`, and `.tsv`.

1. Choose/drop a file.
2. Choose the worksheet and header row (0 means no header).
3. Map the company name and careers/website URL columns. Names can be derived from the domain if there is no name column.
4. Optionally map company website, public API endpoint, and job-sitemap columns.
5. Review the preview and confirm **Add companies**.

Column names and filenames do not need to match the original workbook. Header aliases, literal hyperlinks, and simple literal-URL HYPERLINK cells are supported. Invalid rows are reported; duplicate normalized careers URLs merge. Existing exports, run history, and taken assignments are preserved.

Use the **Source** filter to view an individual import. Imports persist across restarts. The dashboard can start without the original workbook.

Limits: 10 MB input, 20 worksheets, 10,000 rows / 100 columns per sheet, and bounded expanded/text/cell sizes. Encrypted/password-to-open workbooks are not supported. Formulas and macros are never executed. Only mapped company data is retained after import; temporary original uploads are removed after commit/cancel and cleaned up on restart.

### Extraction settings

Open a company and select **Extraction settings**, or click its method label:

- **Auto:** tries supported APIs, public job sitemaps/static HTML, and browser DOM when needed.
- **API:** built-in public ATS adapters or a public schema.org JobPosting JSON feed with explicit job URLs.
- **Static:** HTML/microdata/JSON-LD and public job sitemaps without browser rendering.
- **DOM:** browser-rendered pages and supported pagination.

Optional settings include a public API endpoint, a job sitemap, page budget, render wait, and custom CSS selectors. Mode controls job-content extraction; location verification may still use an API. Reports include attempted methods and failure reasons. Generated company code preserves the chosen settings.

**No implementation can guarantee scraping every website.** Login walls, CAPTCHAs, access restrictions, encrypted data, and proprietary formats may prevent extraction. Unrecognized formats need selectors or a site-specific adapter; failures are reported rather than disguised as successful empty results.

- Search and filter companies; select up to five per batch.
- Mark companies as taken/available locally.
- Start a confirmed batch, follow progress/logs, or stop the queue after the current company.
- Preview job descriptions and all export fields; inspect location/date notes and exclusions.
- Download each company's CSV, JSON report, and portable TypeScript code ZIP.
- Browse dashboard run history and existing exports.

Dashboard runs are saved under `output/<company>/runs/<run-id>/`; previous files are not overwritten by a failed or interrupted run. Dashboard state, import metadata, and company settings are stored in `output/_tracking/ui-state.json`. Restart after manually changing the original default workbook, or import it through the upload UI.

## Final delivery packaging (permanent convention)

Every completed batch ships a `final.zip` with exactly three top-level entries: `code/` (scraper code organized by company plus the shared `universal_scraper/` framework), `jobs company wise/<company>/` (each company's generated job/output files), and the combined master CSV at the ZIP root. No temporary files, logs, caches, `node_modules`, build artifacts, or test output are packaged. Full rules live in `PROJECT_CONTEXT.md` under **Permanent packaging and organization conventions**; follow them for all future batches.

The app binds to loopback only. Each Windows user keeps a private local workspace. Public careers-site availability and the scraper's documented limitations still apply.

The unused JEV project and obsolete JSON scratch/comparison files have been removed from the app. Historical inputs and runs remain in the ignored local archive `../output/2026-10-06-project-cleanup/archive/`.

TypeScript scraper for company careers URLs. It retains explicit UK locations and known posting dates within the last two calendar months. A missing source posting date stays empty and is disclosed in `report.dateFallbacks`.

## Setup

Requires Node.js 22 or newer.

```powershell
npm install
npx playwright install chromium
```

## Run

```powershell
npm run scrape -- "https://company.example/careers" --company "Company"
```

Repeat with the next company's URL. Each run writes uniquely named CSV, JSON, and diagnostic report files in `output/`. Use `--out` to change the output directory. An installed Chrome or Edge can be used with `--browser chrome` or `--browser msedge`.

For a verified public **job sitemap**, static extraction avoids browser pagination:

```powershell
npm run scrape -- "https://careers.mwhtreatment.com/vacancies/vacancy-search-results.aspx" --company "MWH Treatment" --sitemap "https://careers.mwhtreatment.com/sitemap.xml"
```

Use `npm run scrape -- --help` for all options.

The CLI also supports `--mode auto|api|static|dom` and `--api-url` for public JobPosting JSON feeds.

### Run the five selected companies

```powershell
npm run scrape:five
```

The selected batch is MWH Treatment, Thinking Schools Academy Trust, Walker's Shortbread, Guide Dogs, and Alzheimer's Society.

Each `output/<company>/` folder contains its CSV, reports, README, and a **self-contained `code/` folder**. To rerun just one company, open that company's `code/` folder and run `npm ci` followed by `npm run scrape`. Each copy contains its own entry point, shared implementation, dependency manifest, and lockfile.

## CSV contract

```text
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

- Missing values are empty fields in CSV and empty strings in exported JSON.
- Job exports omit `process` and `reason`; extraction methods and diagnostics remain in the separate report.
- `ats` contains a detected supported platform, or `Custom` when none is verified. Missing source dates are disclosed in `report.dateFallbacks`.
- When no qualifying jobs are returned, the CSV contains only its 15-column header and the JSON export is empty. Company outcomes and diagnostics remain in reports.
- The report distinguishes exclusions, unsupported pages, access failures, and crawl limits. A failed or limited crawl is not evidence that a company has no vacancies.
- CSV is UTF-8 with BOM, quotes embedded commas/newlines correctly, and protects spreadsheet formula-like text.

## Filtering and identity

- The inclusive date window uses the Europe/London calendar. September 15, 2026 means July 15 through September 15, 2026. Month-end subtraction is clamped.
- Posting-date rule: a present posted date is kept as published. Missing posted dates stay empty in the export and are disclosed in `report.dateFallbacks`.
- Present but invalid/ambiguous posting dates and future dates are excluded. Last-modified, Greenhouse `updated_at`, and sitemap `lastmod` are never substituted for publication dates.
- UK country codes/names and explicit constituent nations are recognized. City names alone are not sufficient; London in Canada must not be mistaken for London in the UK. Employer headquarters are not used as job locations.
- Missing city/state, deadline, or work arrangement is not invented. Salary rule: a source salary shown as d.o.e (depending on experience) or an hourly rate (per hour) is moved into the job description and `salaryRange` is left empty. A salary is never invented. The salary field contains only the pay range with the pound sign — £ prefixed to each amount and a hyphen between bounds (e.g. £42500-£45000 or £24785); thousands separators and all other wording are stripped, and a source value with no numeric pay range (d.o.e and hourly rates are moved to the description instead) stays empty.
- Eploy's visible location fields are reconciled with structured addresses and public postcode/place data. Country evidence is required; a same-named result in a UK-only gazetteer is not enough by itself.
- Named sites are preserved as location rows even when their city is unavailable. County facets and travel coverage are not blindly expanded into job locations.
- Every qualifying location gets a separate row. All non-location fields remain identical for that source vacancy.
- Exact duplicate rows are removed. Different job IDs or different non-location details are not collapsed by title.
- Job IDs come from source fields or verified vacancy URL formats. If neither supplies an ID, the field stays empty; no ID is invented.

## Supported extraction paths

1. Public Ashby, Greenhouse, and Lever job-board APIs, with detail-page enrichment when needed.
2. Browser-rendered JSON-LD and HTML microdata, including career links, known ATS links, frames, ordinary pagination controls, and bounded scrolling.
3. Explicit public XML job sitemaps (including sitemap indexes) and static job-page JSON-LD/microdata.
4. CSS selectors supplied through `--selectors` for custom sites.

Workday, SmartRecruiters, Workable, Recruitee, iCIMS, and Taleo hostnames can be recognized, but there are **no dedicated API adapters** for them. Their pages must expose supported data or receive a site-specific adapter.

No scraper supports every website automatically. Logins, CAPTCHAs, unsupported pagination, and proprietary data formats may prevent extraction. The scraper respects robots.txt, paces requests, does not submit applications, and does not bypass access controls.

The default crawl follows discovered next links, API totals/cursors, and sitemap URLs to the source's end. Repeated listings and URL cycles stop the crawl; a 10,000-request emergency ceiling prevents unbounded sources. `--max-pages` is an optional explicit budget. Review `limited`, `pendingUrls`, and `issues` in the report before using an export.

### Custom selectors

Supply a JSON object containing supported CSS selector names:

```json
{
  "jobLinks": "a.job-link",
  "next": "a.next-page",
  "title": "h1",
  "description": ".job-description",
  "postedDate": "time.posted",
  "location": ".job-location",
  "city": ".city",
  "state": ".region",
  "country": ".country"
}
```

`location` selects repeated location containers; city/state/country selectors are evaluated **within each location**, not across the page. Dates can be read from `datetime` or `content` attributes. Optional fields also include `job`, `jobId`, `jobUrl`, `company`, `salaryRange`, `employmentType`, `worktype`, `jdDeadline`, and `loadMore`.

For listings where ordinary site navigation leads outside the intended vacancy set, use `"jobLinksOnly": "a.vacancy"` in place of `jobLinks`. This follows only matching vacancy anchors and normal pagination links. Both the dashboard and CLI accept this selector.

## Original live sample — superseded by the five-company batch

- Input: `COMPANIE LIST.xlsx`, Sheet1 row 2, **MWH Treatment**. Input workbook was not modified.
- Discovery: public `robots.txt` → sitemap index → live-job sitemap → individual job pages.
- Method: **STATIC**. Platform independently identified as **Eploy** from the website.
- 99 advertised URLs; 99 pages read; 99 job records extracted.
- The initial strict-date version retained 31 jobs and excluded 68. The later user-requested run-date fallback replaces that policy; see `output/2026-09-24-main-uk-scrape/archive/legacy-output/data/completed-companies.csv` for current results.
- No HTTP/extraction errors and no crawl-limit truncation.
- Delivered CSV: `output/mwh-treatment/MWH_Treatment_UK_Jobs_2026-09-15.csv`.
- Source/report intermediates: `output/mwh-treatment/scrape-result.json` and `export-rows.json`.

The current corrected delivery has 134 location rows for 127 jobs. See `output/2026-09-24-main-uk-scrape/archive/legacy-output/reports/CORRECTION_REPORT.md`. Visible locations take priority over conflicting generic office addresses, with postcode/place verification where needed. Explicit role-specific hybrid wording is extracted; generic job-dependent benefits are not used to infer worktype.

## Verify

```powershell
npm run check
```

The suite checks maintained app and audit entry points, unit/regression tests, and browser/integration tests against local fixtures. It includes country resolution, named sites, travel coverage, ambiguous UK place names, dynamic missing dates, and blank fields. It does not verify current vacancies on every live company site.

`npm run typecheck:all` additionally checks historical delivery and diagnostic TypeScript scripts. Those preserved scripts have known type errors and are outside the default app gate. `npm run verify:deployment` checks a clean build, production-only install, and compiled CLI listing against the current company catalog.

The dashboard lists dated exports under `output/` and complete single/multi-company runs under `output/universal-runs/`. Runs with incomplete manifests remain unavailable for combined downloads. The [cleanup manifest](docs/project-cleanup-2026-10-06.json) records removed scratch files; [session history](D:/Projects/Sessions/06-10-2026/uk-scrapper-project-cleanup.md) records the runtime repairs.

## API contract references

- Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api
- Greenhouse: https://docs.greenhouse.io/job-board.html
- Lever: https://github.com/lever/postings-api
- JobPosting: https://schema.org/JobPosting
- Browser library: https://playwright.dev/docs/library
