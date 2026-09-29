# Companies code

48 individual company folders, limited to the user's explicit selection in `scripts/company-code-selection.json`. Duplicate companies appear once using corrected configuration; previous batches and historical checkpoints remain untouched.

## Run any company independently

Copy its entire folder anywhere. Install Node.js 22+ with npm, open a terminal inside that folder, then run:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run scrape
```

After first-time setup, use `npm run scrape` for later runs. Every company includes its own complete src/, company.json, scrape.ts, package.json, package-lock.json and tsconfig.json. No universal_scraper, sibling folder or original repository is needed. Dependencies and browser installation require internet access. Results stay under the company's dated runs/ directory. See its README for output paths and limitations.

## Scope

`inventory.json` records every selected company and source. The 43 framework-based companies now include their own full framework source; the five legacy companies retain their sitemap implementations and now also read company.json. Walkers is `walkers-shortbread`; Aviation Inc is `persivalenic`; monday.com is `monday`; Upwind Security is `upwind`. No website can be guaranteed to remain available or unchanged. No live websites were re-scraped during packaging; read portability-validation.json for isolated installation/run checks.
