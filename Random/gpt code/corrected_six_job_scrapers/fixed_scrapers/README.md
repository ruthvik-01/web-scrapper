# Corrected Six-Company Job Scrapers

Reference date: `2026-08-14`.

Each company has one TypeScript scraper. Every scraper uses a maximum PQueue concurrency of 5, produces JSON only, validates the required output fields, deduplicates by `jobId`, skips records without a usable detail-page description, and writes an errors file only when runtime errors occur.

## Install

```bash
npm install
npx playwright install chromium
```

## Run

```bash
npm run arona
npm run alamogordo
npm run farrow
npm run garver
npm run socorro
npm run uscourts
```

The output is written beside each scraper as `{company}_jobs.json` and, only when errors occur, `{company}_errors.json`.
