# Restore

Full, self-contained scraper. Copy this entire folder to any location; no sibling company, original repository or universal_scraper folder is required.

The company entry point is `scrape.ts` (`npm run scrape`). The additional `scraper.ts` is the generic CLI used by bundled integration tests, not a replacement for the company entry point.

## First-time setup

Install Node.js 22 or newer with npm. Open a terminal in this folder and run:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run scrape
```

Setup requires internet access. On a different computer or operating system, run setup again; do not copy node_modules between machines. Linux may need browser system dependencies (`npx playwright install --with-deps chromium`).

## Later runs

```sh
npm run scrape
```

Each invocation fetches the current website using the current date and writes a new dated folder under `runs/`; previous runs are not overwritten. Edit `company.json` to update this company's configuration.

Job exports and scrape-report.json are under `runs/<timestamp>/restore/`. Review the report even if no jobs are exported. Exit code 2 signals partial, failed or unsupported extraction; unexpected errors also return a nonzero code.

## Limits

Websites can change, go offline, block automation, or publish no qualifying UK jobs. This package cannot guarantee future site availability or bypass access restrictions. Existing filtering and source limitations are preserved; missing job fields are never invented.

Configuration source: `output/combined 17-9-26 batches/code/restore/company.json`.

Current vacancies from the supplied Restore portal, not only the example Head of Fleet URL.
