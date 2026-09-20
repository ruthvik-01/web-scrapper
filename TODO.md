# TODO

## Dashboard

- [x] Upload XLSX/XLS/XLSM/XLSB/CSV/TSV with preview, worksheet/header selection and column mapping.
- [x] Persist imports, merge duplicate sites, report invalid rows and preserve assignments/exports.
- [x] Add Auto/API/Static/DOM settings and custom selectors to company details.
- [x] Add strategy fallback, attempt reporting, raw-API support and static crawling.
- [x] Bound parser memory/time/input sizes; never execute macros/formulas.

- [x] Local company directory and five-company batch builder.
- [x] Taken assignments, queue progress, run history, and safe stop-after-current behavior.
- [x] Job preview, review reports, CSV/code/report downloads.
- [x] Preserve existing exports and isolate new runs in separate folders.
- [x] Test API security, local fixture batches, browser interactions, and a real worker process.
- [ ] Complete mobile visual QA (responsive CSS exists; default desktop viewport was tested).
- [ ] Add cross-computer assignment synchronization only if requested.

## Correctness audit — priority before more scraping

- [x] Reconcile structured addresses with primary visible location fields; fix confirmed MWH, Walker's, Guide Dogs, and Alzheimer's Society examples.
- [x] Expand Guide Dogs 1027 into distinct Leamington and Reading rows with identical shared fields.
- [x] Preserve source postcodes and verify UK country before rejecting missing-country records.
- [x] Extract unambiguous role-specific hybrid worktype wording without inferring it from generic benefits.
- [x] Add regression tests, regenerate all five company CSVs/code copies/ZIP, and verify confirmed examples.
- [ ] Review the remaining source-location notes and 31 country-confirmation exclusions if additional precision/coverage is needed.

- [x] Create TypeScript scraper and runnable package.
- [x] Add UK/two-calendar-month filters and multi-location output.
- [x] Add public ATS, DOM, static sitemap, and CSS selector extraction paths.
- [x] Add empty missing fields, process, and reason to exports.
- [x] Scrape one company from the supplied workbook.
- [x] Export and validate the MWH Treatment CSV.
- [x] Pass typecheck, 26 unit tests, and 9 integration tests.
- [x] Dynamically assign the run day when a source posting date is missing; disclose every fallback.
- [x] Complete the five approved companies: 277 pages, 78 rows, 25 date fallbacks.
- [x] Copy self-contained runnable code into each company folder alongside its CSV.
- [x] Maintain a completed-company index and record Malmaison as already taken.
- [ ] Select the next five companies after checking the friend's assignments.
- [ ] Add site-specific adapters only when a real supplied URL needs them.
- [ ] Synchronize documentation to a dedicated project Obsidian vault once its MCP connector is available.

## 2026-09-16 requested adjustments
- [x] Standardize existing/future exports to 15 fields with Custom ATS; refresh portable code and ZIPs.
- [x] Choose next five using workbook completion fills and unique careers URLs.
- [ ] Retry Mencap and then process Intercity Technology, London Borough of Bexley, SeeAbility, Compass Schools when requested.

## Five-company delivery / framework
- [x] Scrape Mencap, Intercity, Bexley, SeeAbility and Compass Schools; validate source-specific corrections.
- [x] Deliver combined 15-column CSV, individual results, six reusable code packages and final.zip.
- [x] Verify project tests, isolated package execution, independent CSV and ZIP integrity.
- [ ] Review 128 Mencap records missing independent UK-country evidence; do not invent locations.
- [ ] Choose next five only when requested; optional dashboard tracking integration is separate.

## Requested three-company batch — 2026-09-17
- [x] Refresh supplied portals, preserve restrictions, deliver validated zero-job package with reports.
- [ ] Obtain permitted public sources for Stantec/Legion, or verify Clulow role-specific UK store evidence before reconsidering exclusions.


## 17-9-26 second batch
- [x] Frasers Hospitality / Restore / Phase Eight batch delivered in the exact requested folder; 160 jobs, 163 location rows.
- [x] Source/date/location/pay and mixed-employer scope checks; ZIP and isolated-package verification.
- [ ] Await next requested companies. Phase Eight had no matching roles on the supplied board; no alternate-source search requested.


## Second batch — Wren replacement
- [x] Replace Phase Eight with Wren Kitchens; rebuild and verify final.zip (340 jobs / 343 rows).
- [x] Preserve Frasers/Restore byte-exact and archive the previous revision outside delivery.
- [ ] Await next requested companies or delivery review.


## Tower Hamlets location correction
- [x] Correct all 16 previous-batch locations and rebuild the eight-company ZIP; no actual jobs dropped or other-company job rows changed.
- [x] Verify regression, ZIP/source typechecks, data/schema checks and location-only differences.
- [ ] Await requested delivery review or next task.


## Combined 17-9-26 deliveries
- [x] Merge corrected previous batch with Wren second batch into separate validated ZIP; 11 companies, 528 jobs, 531 rows.
- [x] Retain original files and both source ZIPs unchanged; verify no duplicates and portable wrappers.
- [ ] Await combined-delivery review or next request.


## Combined eight-company scope
- [x] Restrict combined ZIP/folders/manifest to the exact eight completed companies supplied by the user.
- [x] Keep 528 jobs / 531 rows unchanged; verify final ZIP and unpacked files agree.
- [ ] Await next requested work.


## Exact company-column labels
- [x] After lock release, normalize 307 labels to the eight requested names and rebuild combined CSV/ZIP.
- [x] Preserve all 531 rows, 528 jobs, non-company fields and source identities; test filter/resume behavior.
- [ ] Await review or next request.

