# Fieldwork - UK job scraper

Fieldwork is a local TypeScript/Node.js dashboard for importing company spreadsheets, scraping selected careers URLs, and exporting jobs with confirmed UK location evidence. The same extraction engine supports URL and user-manifest batch commands. Company inputs come from users; no fixed employer catalog is bundled.

Jobs require confirmed UK location evidence. NHS Jobs sources are excluded. A configured company or supported platform does not guarantee a successful or complete scrape of its live website.

## Install

Requires Node.js 22 or newer and npm. The examples use Windows PowerShell. Use `npm.cmd` and `npx.cmd` so CLI flags are forwarded reliably; on macOS/Linux, use `npm` and `npx`. Run from the repository root:

```powershell
git clone https://github.com/ruthvik-01/web-scrapper.git
cd web-scrapper
npm.cmd ci
npx.cmd playwright install chromium
```

The app files are directly at the repository root. No separate build step or production-catalog package is required.

## Start the dashboard

```powershell
npm.cmd start
```

Open <http://127.0.0.1:4317>. Keep the terminal running; use Ctrl+C to stop it. The server binds to localhost.

A fresh clone does not include company spreadsheets, imported company data, or previous runs. Use **Upload data** to import a spreadsheet or CSV, map its company-name and careers-URL columns, and add companies.

The dashboard supports:

- Uploading `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.csv`, and `.tsv` files.
- Searching companies and selecting up to five for a batch.
- Choosing Auto, API, Static, or DOM extraction, with optional selectors, API URLs, and sitemaps.
- Following progress, viewing job previews and reports, and downloading available exports.
- Viewing saved run history and existing dated deliveries.

An optional `COMPANIE LIST.xlsx` in the data folder provides the default company list. Its row count depends on your file. Upload limits are 10 MB, 20 worksheets, 10,000 rows, and 100 columns per sheet. Formulas and macros are not executed.

## User-provided manifest batches

Create your own `companies.json` with unique `name`, `slug`, `careersUrl`, and optional extraction `options` for each company:

```powershell
npm.cmd run batch -- companies.json --out ./output/YYYY-MM-DD-batch
npm.cmd run package:batch -- ./output/YYYY-MM-DD-batch companies.json
```

Replace the date placeholder with the run date. `--resume` continues matching saved results rather than refreshing them; use a new dated folder for a fresh scrape. Batches preserve employer/title scope filters, per-company checkpoints, and reports.

Packaging reads saved exports and creates `final.zip` with the combined CSV, `jobs company wise/<company>/`, and `code/`. Company wrappers share `code/universal_scraper`, a reusable URL/batch framework rather than a fixed-catalog product. See [batch framework notes](UNIVERSAL_SCRAPER.md).

## Scrape a careers URL

For an employer's public careers URL:

```powershell
npm.cmd run scrape -- "https://company.example/careers" --company "Company" --out ./output/manual
npm.cmd run scrape -- --help
```

Replace the example URL with the actual careers page. The URL scraper supports `--mode auto|api|static|dom`, `--api-url`, `--sitemap`, and custom CSS selectors through `--selectors`. Unsupported sites may require an adapter or selectors. Browser-based extraction requires the Chromium installation from setup; installed Chrome or Edge can also be selected with `--browser chrome` or `--browser msedge`.

## Data and outputs

By default, the dashboard uses the parent directory of the app as its data folder. To choose a private data folder, set `FIELDWORK_DATA_DIR` before launching it:

```powershell
$env:FIELDWORK_DATA_DIR = Join-Path $PWD 'data'
npm.cmd start
```

This creates dashboard state and run outputs under `data/output/`. The URL and manifest batch commands use their own `--out` paths, otherwise the app's `output/` folder.

| Output | Location relative to the data folder |
|---|---|
| Dashboard company runs | `output/<company>/runs/<run-id>/` |
| Dashboard state and imports | `output/_tracking/` |

Existing dated saved deliveries remain discoverable for compatibility. New runs are created from the user's company selections or manifests, with separate company results and reports.

Dashboard/URL CSV downloads depend on export readiness. Empty or failed results are not proof that an employer has no vacancies. Review `status`, `issues`, `limited`, and quality checks in reports.

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
- Dashboard/URL finalization merges matching vacancy location rows with semicolons and checks IDs, URLs, descriptions, salary, and geography before making a CSV available. Manifest batches retain per-source location rows and scope reports.
- CSV uses UTF-8 with BOM, escapes commas/newlines, and protects spreadsheet formula-like text. Diagnostics stay in separate reports.

## Verify

After installing Chromium:

```powershell
npm.cmd run check
```

`check` typechecks every retained TypeScript file and runs unit/browser integration tests against local fixtures, including real worker execution and portable packaging. These checks do not certify current vacancies across every live company site.

The fixed-catalog production/audit tooling and historical one-off scripts are outside the active app. No external company source library is required for the retained commands and checks.

## Source layout

| Path | Purpose |
|---|---|
| [scraper.ts](scraper.ts) | Single careers-URL CLI |
| [batch.ts](batch.ts) | Batch CLI |
| [src/](src/) | Extraction adapters, crawling, normalization, finalization, and output |
| [server/](server/) | Dashboard server, imports, state, and workers |
| [ui/](ui/) | Dashboard interface |
| [tests/](tests/) | Unit and browser integration tests |
| [scripts/package-batch.ts](scripts/package-batch.ts) | Packaging user-provided saved batches |

Login walls, CAPTCHAs, robots restrictions, changed page formats, and unsupported pagination can prevent extraction. Review the reports for each run rather than assuming that a completed command found every vacancy.
