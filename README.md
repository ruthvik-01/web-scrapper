# Fieldwork - UK job collector

Local UI for importing company spreadsheets, scraping selected public careers sites, and exporting jobs with confirmed UK location evidence.

## Setup

Requires Node.js 22+. From repository root, run these Windows PowerShell commands (use npm/npx on macOS/Linux):

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd start
```

Open http://127.0.0.1:4317. Keep the terminal running; Ctrl+C stops it. The app binds to localhost and has no separate frontend build step.

## Use the UI

1. Click **Upload data**, choose the file, worksheet and header row, then map company names and careers URLs.
2. Preview and import. Duplicate careers URLs merge; imports and history persist locally.
3. Search/filter companies and select up to five for a run.
4. Choose Auto/API/Static/DOM extraction and add selectors, public API URLs or sitemaps when needed.
5. Follow progress, review jobs/reports, and download available CSV, report or portable scraper code.

Supported input formats: .xlsx, .xls, .xlsm, .xlsb, .csv and .tsv. Limits: 10 MB, 20 worksheets, 10,000 rows and 100 columns per sheet. Formulas/macros are not executed. A fresh checkout needs your input file before it shows companies.

Stopping the queue finishes the active company before stopping queued work. Failed runs do not replace successful saved outputs. Access restrictions, unsupported formats or incomplete crawls are reported; an empty result does not prove zero vacancies.

## Private data

The default data root is the app's parent folder. An optional COMPANIE LIST.xlsx there supplies initial companies. You can choose another folder through the Windows launcher or environment:

```powershell
$env:FIELDWORK_DATA_DIR = Join-Path $PWD 'data'
npm.cmd start
```

Runs are under output/<company>/runs/<run-id>/ in the data root; state/imports/history are under output/_tracking/. Original dated UI deliveries remain accessible from Exports. Generated outputs, workbooks, dependencies and credentials are not committed.

## Exports

```text
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

UK evidence is required; employer headquarters alone are insufficient. NHS Jobs sources are excluded. Known dates use an inclusive two-calendar-month Europe/London window. Missing dates remain empty and disclosed; invalid/future dates are excluded. Comeet uses its approved source modification-date basis, disclosed in reports.

Missing source fields are not invented. The quality finalizer merges matching vacancy locations and gates CSV downloads. CSV uses UTF-8 BOM, correct quoting and formula protection. Review source status, exclusions, limits and quality checks.

Downloaded company code includes its own dependency manifest and source. Install dependencies/Chromium inside its code folder before running it. It uses the same extraction and export rules as the UI.

## Verify

```powershell
npm.cmd run check
```

This checks every retained TypeScript file and runs unit/browser fixtures covering imports, actual workers, extraction, pagination, UK/date rules and compiled portable code.

Source: [ui/](ui/), [server/](server/), [src/](src/), [tests/](tests/). See [Architecture](Architecture.md), [deployment](Deployment.md) and [current context](PROJECT_CONTEXT.md).
