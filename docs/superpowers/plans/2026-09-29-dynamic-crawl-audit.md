# Crawl boundary and JEV separation — implementation audit

## Baseline (before this change)

- The dashboard worker supplies `maxPages: company.maxPages || 250`. Generic static/DOM and API crawling stop at that request count, including detail requests. Sitemap extraction slices discovered URLs at the same cap. Jobtrain and other adapters have separate caps.
- Dachser's saved run `ee8653ff-7945-49f1-b6d6-e8e3591da7d7` stopped at 250 requests with 482 pending URLs, 193 candidates, zero exported rows, and `limited: true`. Its pending list includes malformed host-prefixed search URLs and unrelated foreign detail pages. More requests alone cannot make that run correct.
- The current dashboard has 38 imported companies, 13 saved runs, and eight selected result directories. Those eight exports total 67 rows: 14 Crone Corkill rows have blank IDs; Currie & Brown has one repeated ID/URL across two different UK locations (two valid location rows for one job); Cross Keys Homes has six repeated IDs across distinct URLs; all selected ATS values are `Custom`. The saved summary job count is distinct ID count, so blank or repeated IDs make it disagree with CSV row count.
- The 38 imported company records have zero duplicate career URLs, one repeated name (two Dachser entries), one invalid career URL (`https://www..co.uk/search` for Crowley Cox), 38 blank API URLs, and no industry/company city fields in the source schema. The selected 67 job rows have 14 blank IDs, no blank URLs/countries, 10 blank cities, 16 blank states, and three blank posting dates. Missing fields remain unverified; they are not filled by inference.
- Dated aggregate exports contain 536, 536, 15, 34, and 34 rows respectively. They contain no blank IDs, but one dated set repeats a URL. Those archives are historical and are not a valid current crawl-completeness baseline.
- JEV runs can currently be selected from the dashboard; `server/app.ts` forks `jev-worker.ts`. JEV controls and metrics are exposed in UI. The standalone `jev-scraper/` CLI is separate and should remain available only when invoked directly from code.

## Design and verification steps

1. Keep an explicit user request budget as an optional override. For the default path, inspect each listing/API/sitemap before extending a crawl. Follow advertised totals or verified next/cursor links until they end, with cycle and no-new-results detection and a 10,000-request emergency ceiling. Listing and detail work still share that emergency request ceiling; this remains a limitation for exceptionally large inventories.
2. Remove JEV selection, worker dispatch, settings, metrics, and UI text from the application. Preserve the standalone `jev-scraper/` CLI and its own tests.
3. Add focused fixtures for 251+ pages, finite next chains, cycles, empty/no-new pages, sitemap indexes, API totals, and current small/DOM paths. Check exported IDs, URL scope, and ATS without inventing source metadata.
4. Re-run relevant existing tests, typecheck, browser integrations, and representative live sources. Compare page count, status, rows, duplicates, and runtime against the saved results. Do not push unless both code and generated-data checks pass.

## Requirements vs current output

| Requirement | Current implementation | Generated data | Baseline |
| --- | --- | --- | --- |
| Beyond 250 / dynamic boundary | Worker forces 250; sitemap slices 250; request budget includes details | Dachser 250, 482 pending | FAIL |
| Complete pagination | Mixed generic link queue; limited at maxPages | Dachser incomplete; current reports include partial runs | FAIL |
| Correct company/career URLs | Catalog keeps website and careers URL | Import rows hold both; Dachser pending URL is malformed | PARTIAL |
| Correct ATS | Normalization and output force `Custom` | Selected outputs all `Custom` | FAIL |
| Correct job count | Summary counts distinct job IDs | 67 selected rows, but blank/repeated IDs make several summaries lower | FAIL |
| No duplicate jobs | Exact full-row deduplication only | Currie & Brown repeated URL; Cross Keys Homes repeated IDs may be distinct locations/jobs | PARTIAL |
| Company-level fields | Catalog stores name, careers URL, website, slug, API URL; job output is 15-column job schema | `companyInput`, `industry`, location fields, `jobscount` absent from company records | FAIL for requested metadata; source workbook does not supply those fields |
| JEV absent from web app | Dashboard engine selector and worker branch | Existing saved settings may contain engine choice | FAIL |

Blank company metadata must not be fabricated. Archived outputs and the active dashboard state must be audited separately.

## Verified after changes so far

| Source / fixture | Before | After | Finding |
| --- | --- | --- | --- |
| 1,200-page linked HTML fixture | default generic crawl stopped at 100 | 1,200 pages and 1,200 jobs, no page 1,201 request, `limited=false` | Dynamic next-chain boundary passes |
| 260-URL sitemap fixture | default sitemap read 250 | all 260 read, `limited=false` | Known sitemap boundary passes |
| API with advertised `totalPages=3` | one page | three pages, three rows | API total boundary passes |
| Repeating next-chain fixture | no duplicate-content stop | stops after three listing pages, marks partial | Loop safety passes |
| Crone Corkill live | 90 pages, 14 rows, 14 blank IDs, six issues, partial | 53 pages, 14 rows, 14 distinct URL-backed IDs, zero issues, `ok` | Same inventory; removed false navigation and malformed links |
| Cross Keys Homes live | 13 pages, 7 rows, one repeated company ID, partial | 12 pages, 7 rows, seven distinct URL-backed IDs, zero issues, `ok` | Preserved inventory; filtered privacy/attachment downloads and unrelated blocked map embeds |
| Cote Restaurants live | 11 pages, 10 rows, `ok` | 101 pages, 94 rows, 94 distinct URLs/IDs, ten HTTP 429 detail failures and six empty detail pages, partial | All ten old job URLs are retained; 84 more are found, but complete inventory is unproven. Earlier crawl discovered 104 links; the ten rate limits plausibly explain the gap, but cannot confirm all current roles. |

The current saved dashboard results are intentionally untouched. Fresh CLI results live under the ignored local `output/_audit-after/` folder for comparison. No live-data count increase is accepted as complete while a run has unresolved failures.

## Final requirements-versus-output audit

| Requirement | Current code / test | Generated data | Status |
| --- | --- | --- | --- |
| Crawl beyond 250, dynamic stopping | No dashboard 250 default; HTML follows next links; API reads advertised totals; sitemap enumerates entries; 10,000-request emergency ceiling; 1,200-page HTML and 260-URL sitemap fixtures pass | Dachser's saved 250-page run is not regenerated; no live >250-page source was completed | PARTIAL |
| Complete pagination without loops | Repeating listing/API batches stop as partial; explicit next and load-more covered by browser tests | Crone and Cross Keys end cleanly; Côte ends partial on HTTP 429 and empty details | PARTIAL |
| Correct company/career/API URL | Import stores website and careers URL separately; malformed host-prefixed navigation filtered | 38 imports have no duplicate careers URL; Crowley Cox still has invalid `https://www..co.uk/search`; API URLs are blank in all 38 | FAIL |
| Correct ATS | Known ATS retained from source; unknown platform remains `Custom` | Fresh Crone 14, Cross Keys 7, and Côte 94 are all `Custom`; no live known-ATS after-output was audited | PARTIAL |
| Correct job count and IDs | Worker counts distinct `(ID or URL, URL)`; URL-specific identifiers extracted before generic company IDs | Crone 14/14 IDs and Cross Keys 7/7 IDs match rows; Côte 94/94 but incomplete; two saved failed companies remain unrerun | PARTIAL |
| No duplicate jobs | Normalization deduplicates exact location rows | Fresh three sources: 115 rows and 115 distinct URLs/IDs; saved Currie & Brown's two rows for one URL are distinct locations, not an accidental duplicate | PASS for audited sources |
| Location/date fields | Source evidence retained; unverified fields stay blank | Fresh Crone and Cross Keys have no blank city/state/country/date; Côte has 94 blank states (source unverified), no blank city/country/date | PARTIAL |
| Requested company metadata | Catalog only stores name, slug, website, careers URL, API URL and source row | `companyInput`, industry, company city/state/country and `jobscount` are absent from the imported source/workspace schema; no values fabricated | FAIL |
| JEV removed from website | Dashboard route, worker selection, metrics and UI controls removed; standalone `jev-scraper/` remains explicitly runnable | Active `src/`, `server/`, `ui/`, dashboard package and CLI have no JEV references; historical reports remain untouched | PASS |

Before/after for the three rerun companies: 31 saved rows across 114 visited pages became 115 fresh rows across 166 visited pages. The 84-row increase is entirely Côte's expanded listing traversal, and that run remains partial. Crone and Cross Keys together kept the same 21 rows while dropping from 103 to 65 visited pages and clearing 21 bad/blank IDs. The dashboard still contains 38 imports, 13 saved runs, 67 selected rows, five empty runs, two failed runs and two interrupted runs; no full-batch after run was performed. Runtime is not comparable because saved summaries lack elapsed duration and the Côte site rate limited this audit run.

Validation: 105 unit tests pass; 44 browser integration tests pass, including the 1,200-page, 260-sitemap, API-total, repeated-pagination, retry, job-detail and irrelevant-resource cases. Active app typecheck and UI syntax pass. Standalone JEV typecheck/23 tests pass. The repository-wide `npm run typecheck` still fails with 67 pre-existing diagnostics in archived one-off scripts; no lint target is defined. `git diff --check` reports no whitespace errors. Because the live Côte data and full repository gate are incomplete, the push gate is **FAIL**. No commit or push was made.
