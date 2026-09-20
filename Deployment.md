# Local dashboard runtime

## Start

```powershell
npm install
npm run ui
```

Browse to `http://127.0.0.1:4317`. Stop with Ctrl+C in the terminal.

To choose another port in PowerShell:

```powershell
$env:PORT = "4318"
npm run ui
```

## Environment

- Node.js 22+.
- Optional `COMPANIE LIST.xlsx` at the project root; otherwise start with an empty directory and use Upload data.
- Read/write access to the project's `output` directory.
- Internet access when actually scraping public job sources.
- `npx playwright install chromium` is needed only for browser-based scraper fallback and browser tests, not for static sitemap scraping.

## Storage and safety

- Input workbook and existing root company exports are not edited by the dashboard.
- New runs live in `output/<company>/runs/<run-id>/`.
- Local assignment/run metadata lives in `output/_tracking/ui-state.json`.
- The app listens on loopback only, restricts Host/Origin, requires a request token for writes, and does not expose arbitrary file paths.
- This is not a public multi-user deployment. Do not expose it through an external reverse proxy without adding authentication and a separate security review.
- Taken-company tracking is local; coordinate with the friend outside the app.
- Imported-company metadata/settings persist in UI state. Raw uploads are temporary under `output/_imports/`, with bounded child-process parsing and cleanup.
- Upload formats: XLSX, XLS, XLSM, XLSB, CSV, TSV. Limit: 10 MB; 10,000 rows and 100 columns per sheet; up to 20 sheets.
- Only public endpoint URLs are supported in extraction settings. Do not enter private API credentials or tokens.

## Verification

`npm run check` runs typechecking, scraper/API unit tests, browser interaction tests, and a real worker against a local HTTP fixture. Tests do not start a real company scrape.
