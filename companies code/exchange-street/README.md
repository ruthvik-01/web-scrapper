# Exchange Street Claims & Financial Services

Self-contained launcher for the 22-9-26 batch. Requires the sibling `universal_scraper/` folder (framework + node_modules live there).

- Source: ruhvik-new.xlsx (22-9-26 selection). Careers URL: https://www.exchange-street.co.uk/candidate/search/results
- Extraction: auto mode; UK-only rows, two-calendar-month window, 15-column export contract.
- Exported company label: **Exchange Street Claims & Financial Services** (canonical workbook name).

## Run

```sh
npm run scrape   # from this folder; writes runs/<timestamp>/
```

First-time on a new machine: run `npm ci` and `npx playwright install chromium` inside `../universal_scraper/`.
