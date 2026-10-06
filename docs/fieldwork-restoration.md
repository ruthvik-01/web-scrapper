# Fieldwork scope restoration - 6 October 2026

The user confirmed the purpose: spreadsheet imports, selected-company careers scraping and UK job exports through the local dashboard and URL/manifest CLIs. The fixed 75-company production catalog, audit/build/report tooling and unrelated one-off repair scripts are no longer part of the active app. Historical files remain locally archived, outside the repository.

Regression tests reproduced missing dist-universal package entries in dashboard code downloads and batch ZIPs. Removing the unrelated package metadata repairs both. A fresh standalone install also exposed widened mode typing and an incorrectly typed exportReady read in generated code; both are corrected and covered by a generated-code compile regression. Shared ATS adapters, request retries/pacing, UK/NHS/date safeguards and output quality checks remain.

## Live before/after comparison

Both phases used the same supplied careers URLs, generic Fieldwork strategy/finalizer and a fixed October 6 comparison clock. Sorted exports were compared across all 15 fields.

| Company | Source | Source records | Before UK jobs | After UK jobs | Exact match |
|---|---|---:|---:|---:|---|
| Aqua Security | Comeet | 9 | 1 | 1 | Yes |
| CC Nurseries | Jobtrain | 15 | 14 | 14 | Yes |
| Guide Dogs | Eploy sitemap | 11 | 9 | 9 | Yes |

All three runs reported ok, exportReady true, no crawl limit and no extraction issues. All final quality counters were zero: duplicate/missing IDs, duplicate/invalid URLs, non-UK geography, invalid dates, contaminated descriptions and salary checks. No added or removed export rows in the comparison.

These are selected live-source checks, not certification of all employers or all possible pages. Missing dates do not prove recency; Comeet dates use last modification under the existing rule. Source availability may change.

## Automated checks

The restored app passed exhaustive TypeScript checking, 130 unit tests and 48 browser integrations, repeated from a clean dependency install outside the repository. Those include real worker execution, import/pagination behavior, transport/NHS guards and portable-package regressions. A fresh dashboard started with HTTP 200 and zero built-in companies; a generated standalone scraper installed its own dependencies and passed its own typecheck.

Local reproducible artifacts: ../output/2026-10-06-fieldwork-restoration/ contains baseline/after rows, raw source/report JSON, CSVs, comparison.json and TypeScript comparison automation/source snapshots. These datasets are ignored and not published.

[Detailed session](D:/Projects/Sessions/06-10-2026/uk-scrapper-fieldwork-scope.md).
