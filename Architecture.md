# Architecture

## Local dashboard

```text
ui/ static dashboard
  -> server/app.ts HTTP API (loopback only)
       -> server/catalog.ts: workbook + existing export metadata
       -> output/_tracking/ui-state.json: assignments/history/results
       -> isolated server/worker.ts per selected company
            -> existing scraper engine
            -> output/<slug>/runs/<uuid>/ CSV, report, code package
```

One dashboard batch runs at a time, with up to five companies processed sequentially. Stop-queue finishes the active company instead of killing a file write. A failed run does not replace the previously selected output. Worker loss/restart is represented as interrupted state rather than a permanent running indicator.

The UI uses plain browser JavaScript and CSS, with no build step. Fonts are self-hosted with their OFL licenses. Workbook reading and ZIP download generation add `read-excel-file` and `fflate`; the scraping engine's dependencies and behavior remain unchanged.

## Imported files and extraction strategies

- Uploads are parsed by an isolated, time/memory-bounded SheetJS worker. ZIP expansion, row, column, cell and text limits are checked. Macros/formulas are not run.
- Preview and commit are separate. Only mapped company fields and source metadata persist in UI state; the staged original is removed after commit/cancel.
- Company identity remains a hash of normalized careers URL, allowing imports to merge without losing prior exports/assignments.
- Company settings travel into the isolated scrape worker and generated portable code.
- `src/strategy.ts` orchestrates supported APIs, sitemap/static collection, and DOM fallback. Existing country/date rules and row normalization remain in the shared engine.

```text
scraper.ts CLI
  -> src/crawl.ts: robots-aware browser/public API traversal
       -> src/ats.ts: Ashby / Greenhouse / Lever mapping
       -> src/extract.ts: schema, microdata, CSS selectors
  -> src/sitemap.ts: explicit public job sitemap traversal
       -> src/extract.ts
       -> src/geography.ts: visible labels + verified postcode/place context
  -> src/normalize.ts: identity, UK/date filters, per-location rows
  -> src/output.ts: 17 columns, empty missing values, process/reason, CSV

scripts/run-five-companies.ts
  -> portable company code copies under output/<slug>/code/
  -> src/company-runner.ts -> sitemap extraction -> per-company CSV/reports
  -> output/completed-companies.csv and _tracking/ manifests
```

No database, paid scraping API, LLM, or credentials are required. Files are written locally. Public remote services are read only.

Reports retain filtering exclusions and extraction issues separately from job rows. CSV descriptions can contain quoted newlines; consumers must use a proper CSV parser.

A present source date is kept as published. If the posted date is missing but a deadline is given, the posted-date column stays empty — the run date is never substituted. Only when both the posted date and the deadline are missing is the run's UK calendar day assigned and retained in `report.dateFallbacks`; `reason` discloses this on each affected output row. A source salary shown as d.o.e or per hour is moved into the description with `salaryRange` left empty. The salary field contains only the pay range with the pound sign — £ prefixed to each amount and a hyphen between bounds (e.g. £42500-£45000 or £24785); thousands separators and all other wording are stripped, and a source value with no numeric pay range (d.o.e and hourly rates are moved to the description instead) stays empty.

`report.locationEvidence` stores source/resolved addresses and visible labels. `report.dataNotes` preserves unresolved source-location notes. Public Postcodes.io lookups are cached within each company run, paced, and reflected in the `STATIC + API` process label.

Tests use local HTTP fixtures and mocked ATS feeds, not live third-party availability. The first production sample separately validated MWH Treatment's static Eploy pages.

## Reusable batch delivery (2026-09-16)
Manifest -> src/batch.ts -> src/strategy.ts -> API/sitemap/static/DOM -> geography/normalization -> individual CSV/JSON/reports + combined CSV. src/api.ts is the conservative REST decoder extension point; existing ATS adapters remain separate. package-batch.ts assembles five complete standalone code trees plus universal_scraper, then validates a ZIP containing only companies.csv and code/. Sequential checkpoints support hundreds of manifest entries without claiming distributed execution.

## 2026-09-17 second-batch refinements
BatchCompany.titlePrefixes scopes mixed-board roles against actual source titles; src/batch.ts and the packager share matchesCompanyTitle. Geography verifies role-labelled postcode evidence before country resolution. Normalization uses explicit role Salary clauses for missing pay/qualifiers and distinguishes ranges from bonuses/hours. scripts/validate-batch.py accepts a manifest argument and validates the permanent three-part ZIP layout, including header-only company exports.


## 2026-09-17 — work-arrangement geography guard
src/geography.ts separates the original visible label from the effective geographic label. Exact Hybrid/Office/Community labels preserve role-specific source addresses and original labels in evidence; they are not sent to the gazetteer. Actual visible places and remote/home-based suppression retain existing handling.


## 2026-09-17 — canonical export identity
BatchCompany.exportCompanyName is an optional display-label override applied to output rows after filtering. scrape-result source rows stay unchanged; report.exportCompanyIdentity records source names. Packaged configurations retain the override for reruns. Packager/independent validator check exported labels against configuration.



## Comeet adapter (2026-09-18)
`src/comeet.ts` reads the complete public board embedded JSON through AccessPolicy; `src/strategy.ts` routes Comeet Auto/Static runs here. Shared normalization/export/packaging remains unchanged. Regression coverage: `tests/comeet.test.ts`, included in packaged framework.
