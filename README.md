# Fieldwork - UK job scraper

TypeScript/Node.js app for collecting jobs from company careers sites. It includes a local dashboard, a URL-based scraper, and a universal CLI with 75 registered company configurations across 13 platform engines.

Jobs require confirmed UK location evidence. NHS Jobs sources are excluded. A configured company or supported platform does not guarantee a successful or complete scrape of its live website.

## Install

Requires Node.js 22 or newer and npm. The examples use Windows PowerShell. Use `npm.cmd` and `npx.cmd` so CLI flags are forwarded reliably; on macOS/Linux, use `npm` and `npx`. Run from the repository root:

```powershell
git clone https://github.com/ruthvik-01/web-scrapper.git
cd web-scrapper
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run build
```

The repository contains the app files directly at its root. There is no additional `web_scrapper_project/` or standalone production-package folder to enter.

## Start the dashboard

```powershell
npm.cmd start
```

Open <http://127.0.0.1:4317>. Keep the terminal running; use Ctrl+C to stop it. The server binds to localhost.

A fresh clone does not include company spreadsheets, imported company data, or previous runs. Use **Upload data** to import a spreadsheet or CSV, map its company-name and careers-URL columns, and add companies. The universal CLI catalog is separate from the dashboard's imported company list.

The dashboard supports:

- Uploading `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.csv`, and `.tsv` files.
- Searching companies and selecting up to five for a batch.
- Choosing Auto, API, Static, or DOM extraction, with optional selectors, API URLs, and sitemaps.
- Following progress, viewing job previews and reports, and downloading available exports.
- Viewing saved run history and complete universal CLI deliveries.

An optional `COMPANIE LIST.xlsx` in the data folder provides the default company list. Its row count depends on your file. Upload limits are 10 MB, 20 worksheets, 10,000 rows, and 100 columns per sheet. Formulas and macros are not executed.

## Scrape registered companies

Build first if you have changed the TypeScript source:

```powershell
npm.cmd run build
npm.cmd run scrape:universal -- --list
npm.cmd run scrape:universal -- --help
npm.cmd run scrape:universal -- --company "Aqua Security"
npm.cmd run scrape:universal -- --platform comeet
```

`--company` accepts a registered name or slug and can be repeated. Running `npm.cmd run scrape:universal` without a selection attempts the whole catalog. Use `--out`, `--concurrency`, and the timeout/page-budget options shown by `--help` to control a run.

The supported registry platforms are Comeet, Eploy, Jobtrain, WordPress, Custom, Reed, Haystack, Tribepad, JobAdder, Portobello, Occy, Supabase, and JobToday. Configuration lives in [config/companies.json](config/companies.json); held-source information is in [config/companies-held.json](config/companies-held.json).

## Scrape a careers URL

For a careers URL outside the registered catalog:

```powershell
npm.cmd run scrape -- "https://company.example/careers" --company "Company" --out ./output/manual
npm.cmd run scrape -- --help
```

Replace the example URL with the actual careers page. The URL scraper supports `--mode auto|api|static|dom`, `--api-url`, `--sitemap`, and custom CSS selectors through `--selectors`. Unsupported sites may require an adapter or selectors. Browser-based extraction requires the Chromium installation from setup; installed Chrome or Edge can also be selected with `--browser chrome` or `--browser msedge`.

## Data and outputs

By default, the dashboard uses the parent directory of the app as its data folder. The universal CLI uses `../output/universal-runs/` when launched from the repository root. To give both a shared data folder, set `FIELDWORK_DATA_DIR` before launching them:

```powershell
$env:FIELDWORK_DATA_DIR = Join-Path $PWD 'data'
npm.cmd start
```

Set the same environment variable in any other terminal running the universal CLI. This creates dashboard state and run outputs under `data/output/`. The URL scraper uses its own `--out` option and otherwise writes to the app's `output/` folder.

| Output | Location relative to the data folder |
|---|---|
| Dashboard company runs | `output/<company>/runs/<run-id>/` |
| Dashboard state and imports | `output/_tracking/` |
| Universal runs | `output/universal-runs/<dated-run-id>/` |

Universal runs contain a manifest, summary, failure diagnostics, and per-company reports and job JSON. Complete runs also publish combined `companies.csv` and `companies.json`. Single-company run names include the company slug. `--out` overrides the universal output root.

CSV downloads depend on export readiness. Partial universal runs retain diagnostics and block combined exports. Empty or failed results are not proof that an employer has no vacancies. Review `status`, `issues`, `limited`, and the quality checks in the reports.

If using a data folder inside the repository, keep its generated files out of commits. Dependencies, compiled output, credentials, and scrape results are not shipped with this repository.

## Export fields and filtering

The CSV/JSON job schema has 15 fields:

```text
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

- Missing values remain empty. Job IDs, salary, geography, and work arrangement are not invented.
- Known posting dates must fall within the inclusive two-calendar-month window, using the Europe/London calendar. Invalid and future dates are excluded.
- Missing posting dates stay empty and are disclosed in `dateFallbacks`. Such records do not establish recency.
- Comeet uses its source `time_updated` as the date basis under the existing project rule. This is a last-modification date, not a publication date; missing or invalid updates are excluded.
- Confirmed UK geography is required; employer headquarters alone do not establish a job's location.
- Finalization merges matching vacancy location rows, joining multiple locations with semicolons, and checks IDs, URLs, descriptions, salary, and geography before making a CSV available.
- CSV uses UTF-8 with BOM, escapes commas/newlines, and protects spreadsheet formula-like text. Diagnostics stay in separate reports.

## Verify

After installing Chromium:

```powershell
npm.cmd run check
npm.cmd run verify:deployment
```

`check` runs maintained app/audit typechecks, unit tests, and browser integrations using local fixtures. `verify:deployment` checks a clean install/build and the compiled catalog listing after a production-only install. These checks do not verify current vacancies across every live company site.

`npm.cmd run typecheck:all` also includes preserved historical delivery and diagnostic scripts, which have known type errors. Historical comparison commands such as `test:uk` and `test:regression` require original company source packages outside this repository and are not part of the default `check` gate.

## Source layout

| Path | Purpose |
|---|---|
| [universal.ts](universal.ts) | Registered-company CLI and programmatic orchestration |
| [scraper.ts](scraper.ts) | Single careers-URL CLI |
| [batch.ts](batch.ts) | Batch CLI |
| [config/](config/) | Company catalog and held-source configuration |
| [src/](src/) | Extraction adapters, crawling, normalization, finalization, and output |
| [server/](server/) | Dashboard server, imports, state, and workers |
| [ui/](ui/) | Dashboard interface |
| [tests/](tests/) | Unit and browser integration tests |
| [scripts/](scripts/) | Build, verification, packaging, and historical maintenance tools |

Login walls, CAPTCHAs, robots restrictions, changed page formats, and unsupported pagination can prevent extraction. Review the reports for each run rather than assuming that a completed command found every vacancy.
