# Interfaces

## Dashboard HTTP API

Start with `npm run ui`. Binds to `127.0.0.1:4317` by default; `PORT` can change the port.

- `GET /api/dashboard`: catalog, current statistics, current queue, run history, and local request token.
- `POST /api/runs`: `{ companyIds: [...] }`, one to five distinct non-taken catalog IDs.
- `POST /api/runs/stop`: finish the current company and skip remaining queued entries.
- `POST /api/companies/:id/taken`: `{ taken: true|false }`.
- `GET /api/companies/:id/results`: paginated/filterable rows and report (`q`, `notes`, `offset`, `limit`).
- `GET /api/companies/:id/download?kind=csv|code|report`: downloads allowlisted output files or a portable code ZIP.
- `POST /api/imports/preview`: raw file bytes, `X-Upload-Name` (URI-encoded filename), normal same-origin/token headers; returns worksheets, samples and suggested mapping.
- `POST /api/imports/:id/sheet`: `{sheet, headerRow}`; returns a bounded preview for the selected header position.
- `POST /api/imports/:id/commit`: `{mapping:{sheet,headerRow,nameColumn,urlColumn,websiteColumn?,apiColumn?,sitemapColumn?}}`; appends/merges companies and reports rejected rows.
- `POST /api/imports/:id/discard`: removes a pending import.
- `POST /api/companies/:id/settings`: mode, public endpoint URLs, CSS selectors, maxPages and renderWaitMs. Active/queued companies cannot have settings changed directly.

Mutations require the dashboard's `X-Workspace-Token` and same-origin `Origin` header. Host headers are restricted to loopback. Downloads are restricted to the resolved company output directory. No arbitrary shell commands or output paths can be submitted through the API.

## CLI

`npm run scrape -- "<company careers URL>" --company "<fallback name>"`

Optional arguments: `--out`, `--max-pages`, `--browser`, `--delay-ms`, `--render-wait-ms`, `--timeout-ms`, `--selectors`, `--sitemap`.

`npm run scrape:five` runs the five approved companies and prepares a portable code/CSV folder for each.
Within any exported company `code/` folder, `npm ci` and `npm run scrape` rerun just that company.

Exit codes: 0 complete (including legitimate no matches); 1 fatal error; 2 partial or unsupported extraction. Inspect the report before interpreting an empty result.

## TypeScript entry points

- `scrapeCompany(url, options)`: browser/public ATS collection.
- `scrapeJobSitemap(companyUrl, sitemapUrl, options)`: static sitemap collection.
- Both return `{ rows, report }`. Core rows contain 15 job fields.
- `outputRows(result, company)` adds process/reason and converts missing values to empty strings; a zero-result row is diagnostic, not a job.
- `outputCsv(rows)` writes the 17-field CSV format.
- `runCompany(config, directory)` runs one static job-sitemap collection and writes its CSV/data/reports into the company folder.
- `report.dateFallbacks` lists accepted jobs where both the posted date and the deadline were absent and the current run day was assigned as the posted date. Jobs with a deadline but no posted date keep `postedDate` empty.
- `report.locationEvidence` records visible/source/resolved locations; `report.dataNotes` contains location-review notes shown in CSV `reason`.
- `scrapeWebsite(url, options)` selects Auto/API/Static/DOM strategies and adds `report.selectedMode` and `report.attempts`.

## Public remote reads

- Ashby public posting API, Greenhouse Job Board API, Lever Postings API.
- Company-provided careers pages, robots.txt, and explicit job sitemaps.
- Public Postcodes.io `/postcodes/{postcode}` and `/places?q=...` reads for country/place verification; results are cached and paced per run.
- No application submission, authenticated Harvest API, or private/internal job endpoint is used.

## Batch/JSON extraction interfaces (2026-09-16)
New batch CLI: npm run batch -- MANIFEST --out DIRECTORY [--resume]. Manifest fields: name, safe unique slug, careersUrl, optional sourceNote/originalUrl, employerNames and extraction options. Public JSON decoding supports JobPosting and conservative jobs/results/data records, explicit next/links.next/pagination.next URLs, and reports unsupported cursor contracts. No dashboard HTTP endpoint changes.


## Comeet public boards
GET /jobs/{slug}/{companyUid}/ on www.comeet.com. JSON literals COMPANY_DATA and COMPANY_POSITIONS_DATA contain company identity, full descriptions and position-location records; no authenticated endpoint needed. time_updated is deliberately not used as datePosted. Missing/malformed data fails rather than reporting an empty board.


## Comeet field policy revision — 2026-09-18
User requests time_updated as the value behind postedDate; normalize its timestamp to Europe/London date. Preserve exact source timestamp, location.is_remote boolean, employment_type and workplace_type in report.sourceFields. Missing/invalid updates are excluded. Workplace label wins over boolean; absent labels use boolean fallback. Employment type is not inferred when absent.
