# Changelog

## 2026-10-06 - Project cleanup and dashboard export repair

- Rewrote README for the repository-root layout and fresh-clone setup; corrected dashboard import/data paths, registered versus URL CLI usage, date/location/export rules and historical-check limitations. Removed references to absent packages, taken controls, local deliveries and obsolete live totals.

- Removed unused JEV project and 134 scratch/generated JSON files from the app; preserved local history under ignored dated output/archive. Kept required catalogs/configuration and audit/verification inputs; updated the historical repair helper's archived-run path.

- Removed 36 unused root diagnostic files, captured pages and stale logs; [deletion manifest](docs/project-cleanup-2026-10-06.json). Historical deliveries and scripts remain intact.
- Dashboard exports recognize company-slug runs and the default `output/universal-runs/` folder, enforcing complete manifests for downloads.
- Added `npm start`; default typecheck covers maintained app/audit commands, with historical checks retained as `typecheck:all`. Updated stale CLI/browser checks and deployment catalog verification.
- Evidence and remaining limits: [shared session](D:/Projects/Sessions/06-10-2026/uk-scrapper-project-cleanup.md).

## 2026-10-05 — Universal Scraper Completion (All 75 Companies & Standalone Package)

- Expanded universal scraper catalog to all 75 companies across 13 platform engines (Comeet, Eploy, Jobtrain, WordPress, Custom ATS, Reed, Haystack, Tribepad, JobAdder, Portobello, Occy, Supabase, JobToday) with strict deterministic UK-only finalization.
- Modularized architecture: dedicated `src/filters.ts` for all UK location, date window, salary, and NHS exclusion logic; dedicated `src/common-utils.ts` for text/HTML cleaning, canonical URL resolution, and CSV serialization.
- Dedicated output directory: all runs output into `output/universal-runs/<timestamp>-<runId>/`.
- Created standalone, self-contained production folder `universal_scraper_production/` for team members with complete documentation.
- Verification: 171 unit tests passing, 795 + 15 UK assertions passing, 53 fixture regressions passing, app/build passing, repeated multi-batch live scrapes verified with 100% exact match. [Report](docs/universal-implementation/README.md), [Progress](docs/universal-implementation/production-progress.md), [Shared History](D:/Projects/Sessions/05-10-2026/uk-scrapper-universal.md).

## 2026-10-05 — Universal CLI completion

- Added `scrape:universal` default-all command, exact name/slug selection and platform filtering; retained existing single-site command. Complete datasets now include combined JSON and use dated shared output folders listed/downloadable through dashboard Exports.
- Added CLI file-output/default45/partial/selection tests and complete-versus-partial dashboard delivery coverage.148 unit tests,795 UK assertions and45 fixture comparisons pass; app typecheck/build pass. Classified67 broad historical script errors and the existing dashboard date-label failure as unrelated to universal execution.
- Additional live checks: Coralogix7 UK rows, Blockaid1, Intercity Technology6; Curve no_matches0. Original3 live results preserved;38 remain not live-verified. Held30 and original company sources untouched. [Code/report](docs/universal-implementation/README.md), [shared history](D:/Projects/Sessions/05-10-2026/uk-scrapper-universal.md).

## 2026-10-05 — Universal UK-only workflow

- Added catalog/registry/orchestrator and CLI for 45 audited candidates; kept 30 holds and original company sources intact. Existing collectors/normalization/output gate are reused; identity scope precedes display rename, and partial/error CSVs are blocked.
- Closed NHS robots-redirect bypass and comparison collision gap; added HTTP500 retry handling and explicit Jobtrain tenant job-search discovery.
- Original UK cases795/0fail, fixed-source old/new comparisons45/45, unit suite143/143, app typecheck/build pass. Three completed live runs export20 UK rows; other42 are not live-verified. Broad legacy typecheck67 errors and dashboard label integration1 failure remain.
- [Report and commands](docs/universal-implementation/README.md); [shared history](D:/Projects/Sessions/05-10-2026/uk-scrapper-universal.md). No deletions, historical output changes, commit or push.

## 2026-09-30 — Validated job data and full rerun

- Fixed Cross Keys advert role extraction, rendered-detail waiting, title-only XHR enrichment, source posting dates, and visible annual versus hourly pay; added focused regression tests.
- Added a final 15-column export gate for IDs, URLs, UK location, usable description, dates, annual salary, benefits, and duplicate job keys. Invalid candidates retain reasons in company reports.
- Prevented social-share/faceted-search crawl expansion; retained source town/county fields and required job-specific UK context rather than a company default.
- Reran eight companies without editing the old CSV: 92 valid rows over 311 pages versus 70 baseline rows; 188 excluded candidates are logged. Dachser's 18 German jobs are absent, and CV Technical now contributes 39 localized rows. Currie & Brown remains partial because one live advert lacks role/location fields.
- Passed 113 unit tests, 48 browser integrations, production typecheck, and final row audit. No commit or push.

## 2026-09-30 — Location evidence and live browser follow-up

- Tightened Greater London country confirmation to require the job's explicit location text, so a gazetteer-inferred state cannot turn ambiguous London into UK during reprocessing.
- Corrected-source dashboard runs completed Crone Corkill (16), Cross Keys Homes (8), Crowley Cox (5), Cura Terrae (12), and UK-filtered Dachser (18); latest saved CV Technical output has 39 rows. The interrupted live batch left Currie & Brown and Curtis Fox reruns pending. Packaged audit remains 92 validated rows over 311 pages.
- App typecheck passes; focused location tests pass 25/25. Full unit suite passes 116/117; the single Windows temp-file rename `EPERM` in `run-state.test.ts` passes when isolated. Dashboard browser reload was blocked by browser policy after the tab became unreachable. No data edits, commit, or push.

## 2026-09-30 — Pagination and identifier regressions

- Corrected listing/detail classification for search and named careers boards, and prevented related-job controls on detail pages from expanding the crawl.
- Prioritized WordPress REST post IDs over repeated generic JSON-LD identifiers.
- Fresh Cross Keys Homes run found nine candidates and exported eight valid unique rows; one bare-city location was transparently skipped. Unit 107/107, browser 47/47, app typecheck, and CSV/JSON schema comparison pass.
- Ran Cross Keys Homes from the dashboard and verified the live report and eight job rows in the browser: 13 pages, nine candidates, eight exports, one location-filtered exclusion, no extraction/access errors.

## 2026-09-30 — WordPress career feed and detail extraction

- Added discovery of custom WordPress job post types through the public REST type index and pagination using `X-WP-TotalPages`; detail records enrich the API rows with page content and job-specific IDs.
- Fixed location extraction on WordPress career pages to stay within `.single-post__content`, avoiding the “Product Finder” site navigation, and added safe literal `onclick`/data destination discovery without executing scripts.
- Live Northwood scrape found 12 candidates with distinct IDs. Seven were outside the selected date window and five current jobs were excluded because the source gives only a bare place name; strict UK location validation remains unchanged. No export was produced.
- Focused extraction tests 2/2, WordPress pagination integration 1/1, geography tests 17/17, and application typecheck pass.

## 2026-09-28 — Dashboard data visibility and upload recovery

- Fixed DOM pagination for count-based “Load N more of M remaining” controls and sent live page/job/action updates to the existing dashboard progress panel. A bounded Côte check reached ten batches and 104 job links; 13 affected integration tests pass.

- Added local Windows setup/start scripts, per-user `%LOCALAPPDATA%\Fieldwork` storage, startup folder checks, browser opening, and duplicate/foreign-port handling. Direct developer start keeps the existing workspace data. Verified 98 unit tests, 26 browser/integration tests, isolated persistence, and unchanged live 37-company/five-delivery legacy dashboard.
- Simplified the Fieldwork sidebar and page chrome: kept navigation and connection status, compressed collection rules, removed duplicate cards/footer/progress decorations, and flattened panels. Focused browser checks pass 2/2.
- Redesigned the Fieldwork dashboard in white and green across its pages and dialogs, replaced promotional copy with direct labels, and corrected tablet/mobile header overflow. Browser integrations pass 24/24, including 768px and 375px checks.
- Exposed dated output deliveries on the Exports page with row counts and CSV/final ZIP downloads.
- Imported `25-9 companies.xlsx` into persistent dashboard state (7 companies, 0 rejected).
- Restarted the local server with parser process permission after reproducing `spawn EPERM` on Excel preview.
- Verified dashboard tests 7/7 and live API responses. Full typecheck remains blocked by 67 pre-existing errors in unrelated scripts.
- Corrected completed company rows to open result details when output exists. Updated a browser test to expect blank exported posting dates when the source supplies none. Focused browser integration passes 12/12; full unit suite passes 94/94.
- Enabled the existing `jobLinksOnly` selector in dashboard settings so targeted listing crawls can be configured through the UI; added a persistence test and usage guidance.
- Kept targeted job-link discovery within its selected listing by ignoring unrelated page-wide JSON feeds; pagination remains available. Verified unit tests 95/95 and browser integrations 23/23.
- Improved shared DOM extraction for rendered job cards with opaque detail URLs and common “show/view additional vacancies” controls; added a browser regression. Unit tests pass 95/95 and browser integrations 24/24.

## 2026-09-22 — Salary normalization
- Moved 12 hourly rates from `salaryRange` into descriptions and promoted 87 explicit annual salary/pay values into `salaryRange` in the corrected five-company batch.
- Rebuilt `output/22-9-26 batch-corrected-fields/final.zip` with the normalized CSV and `salary-correction-report.csv`.
- Combined the corrected batch with four supplied 21-9-26 CSVs: 540 rows across 9 companies; 94 additional salary normalizations.

## 2026-09-18 — Akhil CSV supersedes PDF; scrape in progress
- Stopped the PDF-based batch after the user provided `Akhil team - ruthvik.csv`.
- Created a fresh 39-company manifest with complete CSV names/slugs/URLs; documented 8 held rows out of 47 and verified the original source hash and manifest mapping.
- Added CSV preparation and wait-then-package/validate scripts; new output directory is `output/akhil-ruthvik-2026-09-18/`. No production scraper edits or prior-delivery overwrites.
- Scraping and finalization are still running; results are not yet a completed delivery. Obsidian MCP unavailable.

## 2026-09-15 — External uploads and multi-strategy extraction

- Added XLSX/XLS/XLSM/XLSB/CSV/TSV upload, preview, sheet/header selection and column mapping.
- Added persistent source imports, duplicate merging, source filtering and invalid-row reports without altering prior exports/assignments.
- Added per-company Auto/API/Static/DOM settings, public endpoints, custom CSS selectors and bounded runtime options.
- Unified UI/CLI/portable code on multi-strategy orchestration with attempted-method reporting.
- Added isolated parsing/resource guards and tests covering all supported formats, mapping, persistence, unsafe input and mode fallback.
- Verification: 72 tests plus typecheck pass.

## 2026-09-15 — Fieldwork local dashboard

- Added company directory, search/status filters, five-company batch selection, and local taken assignments.
- Added isolated worker queue, progress logs, stop-after-current control, run history, and preserved previous exports.
- Added job/detail/report preview and CSV/portable-code/report downloads.
- Imported the existing workbook and company outputs without rerunning or modifying them.
- Added loopback/Host/Origin/token safeguards and bounded file downloads.
- Added API, browser-interaction, and real-worker fixture tests; 57 total tests pass.

## 2026-09-15 — Corrected five-company delivery

- Added Eploy primary-visible-field reconciliation, preserved postcode/street evidence, and verified UK country/place context.
- Fixed audited city errors, genuine multi-location expansion, explicit hybrid worktype omissions, county-versus-city facets, travel coverage, and named-site retention.
- Regenerated 134 rows for 127 jobs across the five companies; 30 date fallbacks remain disclosed.
- Added source-review notes instead of inventing uncertain city/state values. 31 country-confirmation exclusions remain.
- Expanded verification to 49 tests plus live preflight and output-level regression assertions.
- Preserved the previous ZIP under output/_history and produced a new corrected ZIP.

## 2026-09-15 — Correctness audit (no dataset changes)

- Independently verified all five CSVs against cached source dates, code copies, and ZIP contents; re-ran 35 passing tests.
- Re-read all 78 exported job pages. Found location conflicts, missing visible-location details and multi-location expansion, and 23 missing explicit hybrid worktype values.
- Checked two excluded source postcodes independently; both are in England and in the date window.
- Added an evidence-backed verification report. Changed project status to correctness fixes required; did not alter delivered CSVs, production code, or ZIP.

## 2026-09-15 — Initial scraper and first live export

- Built URL-based TypeScript scraper with public ATS adapters, DOM/structured-data extraction, custom selectors, and static job sitemaps.
- Enforced UK-only and inclusive two-calendar-month posting window.
- Added multi-location rows, deterministic fallback IDs, exact deduplication, and spreadsheet-safe CSV encoding.
- Expanded exports to 17 fields with NULL values, extraction process, and zero-result reasons.
- Scraped all 99 MWH Treatment sitemap jobs; retained 31 verified recent UK jobs.
- Verified typechecking, 33 automated tests, and the final CSV roundtrip.

## 2026-09-15 — Five-company delivery and revised missing-date policy

- Replaced NULL export values with empty fields as requested.
- Changed absent source posting dates to the current run's UK calendar date; disclosed fallback dates in `reason` and reports.
- Completed MWH Treatment, Thinking Schools Academy Trust, Walker's Shortbread, Guide Dogs, and Alzheimer's Society.
- Read 277 pages and exported 78 rows; 25 jobs used the missing-date fallback.
- Delivered a complete standalone TypeScript code package alongside each company's CSV and reports.
- Added selected/completed/taken-company registers. Malmaison was excluded as already taken.
- Verified 35 automated tests and all five copied TypeScript packages.

## 2026-09-16 — export contract and next batch
- Job CSV/JSON exports now have exactly 15 columns, omit process/reason, and set ats to Custom. Internal reports retain extraction methods, exclusions, location notes, and date fallbacks.
- Refreshed six saved exports (five delivered companies plus Mencap's diagnostic run), portable output/normalization modules, README generators, and both delivery ZIPs. Preserved historical folders, diagnostic reports, and original extraction implementations.
- Verified: npm run check (53 unit tests + 19 integration tests), five portable packages typecheck, independent CSV/JSON validation (134 job rows), correction regression checks, ZIP integrity.
- Next five uncoloured, unique careers sites in workbook order: Mencap (row 4), Intercity Technology (12), London Borough of Bexley (13), SeeAbility (14), Compass Schools (15). Guide Dogs alias (11) is skipped because its careers site is already completed.
- Mencap is a retry, not a completed company: previous run recorded 138 issues and zero jobs. No new companies scraped or marked done this session. Workbook colours and source columns unchanged.
- Obsidian MCP unavailable (plugin lookup returned no matches); project-local documentation updated instead.

## 2026-09-16 — five-company batch and reusable framework delivery
- Delivered `output/batch-2026-09-16/final.zip`: combined 123 rows / 112 jobs, five standalone company packages plus universal_scraper. Each package includes company results and runnable code; workbook colours and prior batches preserved.
- Counts: Mencap 19/19 jobs/rows; Intercity 6/6; Bexley 15/15; SeeAbility 43/43; Compass Schools 29/40.
- Added manifest batch/resume, CSV aggregation, scoped employer exports, packaging and independent/isolated verification scripts. Extended JSON APIs, explicit pagination, browser JSON capture, Eploy HTML fallback and infinite-scroll verification.
- Repaired Intercity job IDs (PropertyValue.value), title HTML entities and Mencap source extraction. Added source-evidence safeguards against promoting inferred county values into UK proof on reprocessing.
- Mencap: all 147 source pages extracted; 128 records excluded for unconfirmed UK location. Nineteen accepted on explicit job-specific UK work-eligibility requirements. Intercity uses its verified replacement careers URL. Compass excludes other group employers.
- Interrupted runs preserved as evidence; final batch completed without selected-strategy fetch issues or truncation. Source revalidation history remains in reports.
- Verification: 82 project tests, 66 isolated universal-package tests; six portable typechecks; five company fixture runs and two-company batch fixture; fresh npm ci with zero audit vulnerabilities; independent CSV roundtrips and ZIP CRC/layout checks pass.
- Obsidian MCP unavailable. Updated project-local documentation and requested MEMORY.md; no secrets stored.
- Next: review delivery/location exclusions, then choose next five when requested. Dashboard tracking integration remains optional and was not performed.

## 2026-09-17 — requested Stantec / Clulow / Legion batch
- Fresh run: Stantec and Royal British Legion blocked by robots.txt; David Clulow 36/36 sitemap pages read, all excluded for no confirmed UK location. Zero qualifying jobs; no access bypass or inferred country.
- Delivered output/stantec-clulow-legion-2026-09-17/final.zip with three company folders, shared framework and header-only master CSV. Earlier batches/workbook unchanged.
- Removed company-only diagnostic export rows from shared exporter; packager accepts empty datasets and rejects diagnostic rows. Reports preserve outcomes.
- Verification: typecheck and 7 targeted tests passed; independent schema/master/PK/CRC/layout/artifact checks passed.
- Obsidian MCP unavailable; local documentation updated, no vault synchronization claimed. Next: permitted alternate sources or independently verified role-specific Clulow locations.

## 2026-09-17 — 17-9-26 second batch
- Delivered output/17-9-26 second batch/final.zip: Frasers Hospitality 143 jobs/rows, Restore 17 jobs / 20 rows, Phase Eight 0; master 160 jobs / 163 rows. All 209 advertised pages read without extraction issues/limits. Three old Frasers postings excluded; 46 other-employer Learning Shop roles excluded.
- Added shared source-title prefix scope with separator boundaries and matching package validation. Fallback company labels cannot establish employer scope. Excluded source records remain in reports; no diagnostic CSV rows.
- Verified role-labelled postcodes for Restore 1679/1680; no city guessed for unresolved Manchester (Trafford Park) site. Recognize hourly ph and description salary DOE; salary fallback only from explicit Salary clauses; bonus/hour numbers no longer become range bounds.
- Verification: typecheck, 38 targeted tests, packaged source/wrappers typecheck and 5 isolated fixture tests, independent schema/master/PK/CRC/layout/duplicate checks and source-accounting audit pass.
- Prior batches/workbook colours unchanged. Clean delivery uses code/, jobs company wise/, CSV and reports; work/captures/logs remain under output/_history/17-9-26-second-batch-* outside ZIP.
- Obsidian MCP unavailable; local context/history updated with no vault sync claimed. Next: review delivery, then await next requested companies.

## 2026-09-17 — Wren replaces Phase Eight in second batch
- Rebuilt output/17-9-26 second batch/final.zip with Frasers Hospitality, Restore and Wren Kitchens only. Totals: 340 jobs / 343 rows (Frasers 143/143, Restore 17/20, Wren 180/180).
- Fresh Wren run read all 255 advertised pages without extraction errors/limits; excluded 75 old postings. Fifty-three accepted Wren jobs lack both dates; run-date fallback is disclosed individually. No invented hourly units for bare source pay amounts.
- Frasers/Restore were not re-scraped; all eight CSV/JSON/result/report files verified byte-identical before and inside rebuilt ZIP. Phase Eight company folders removed from delivery; prior version archived under output/_history/17-9-26-second-batch-before-wren/.
- Packager and independent CSV/JSON/date/location/pay/master/PK/CRC/layout/duplicate checks pass; source accounting 418 pages = 340 jobs + 78 date exclusions. Isolated rebuilt source and three wrappers typecheck. No implementation changes; no unit-test rerun claimed.
- Updated manifest, delivery/context/history. Other batches and workbook colours unchanged. Obsidian MCP unavailable; no vault sync claimed. Next: review rebuilt ZIP or await next requested companies.

## 2026-09-17 — Tower Hamlets previous-batch location repair
- Rebuilt output/batch 17-9-2026/final.zip. All 16 Tower Hamlets rows now have London / Greater London / UK: fixed 15 UK-only rows and one Office/Suffolk false place match.
- Reproduced the regression before fixing src/geography.ts: Hybrid/Office/Community working-arrangement labels no longer override role-specific JobPosting address geography or trigger place searches. Real visible-location conflicts, home-based/remote suppression and foreign-country exclusions remain covered.
- Used saved matching job pages plus verified E1 1BJ and E1 5NP postcodes, not headquarters inference. Only location/city/state changed in Tower exports. Original dates, job selection and other fields preserved; no rescrape.
- Other 172 actual job rows unchanged. Removed 3 legacy non-job placeholders from zero-result exports; all 188 jobs remain, with all eight company folders/reports. Previous revision archived under output/_history/batch-17-before-tower-location-fix/; Wren second batch and other deliveries unchanged.
- Verification: typecheck, 31 targeted tests; fresh ZIP source/eight wrappers typecheck and 17 packaged geography tests; independent CSV/master/schema/date/salary/location/PK/CRC/layout checks; exact non-location and other-job comparisons passed. Per-row evidence is in location-corrections.json.
- Updated context/history; Obsidian MCP unavailable, no vault sync claimed. Next: review repaired ZIP or await requested work.

## 2026-09-17 — combined previous and Wren second batch
- Delivered output/combined 17-9-26 batches/final.zip: corrected batch 17-9-2026 (188 rows) + 17-9-26 second batch (343 rows) = 528 jobs / 531 UK location rows across 11 company folders.
- Preserved all 44 company CSV/JSON/result/report files byte-for-byte; both original ZIPs unchanged. Tower Hamlets corrections and Wren substitution retained; Phase Eight absent. Existing date fallbacks, exclusions and zero-job outcomes unchanged. No rescrape/re-normalization or scraper code changes.
- Verified source/master concatenation, duplicate full rows/cross-company vacancy URLs, 15-column schema, dates/pay/locations, expected company folders, PK/CRC/layout and retained-file hashes. Fresh ZIP source/all 11 wrappers typecheck using pinned dependencies; no test rerun/install claimed.
- Clean combined delivery created separately; work checkpoints under output/_history/combined-17-9-26-checkpoints. Next: review combined ZIP or await requested work. Local context updated; no Obsidian sync claimed (MCP unavailable).

## 2026-09-17 — combined batch restricted to eight completed companies
- User explicitly limited combined 17-9-26 batches to News UK, Tower Hamlets, CC Nurseries, B&M, London Borough of Hillingdon, Frasers Hospitality, Restore and Wren Kitchens. Removed Royal British Legion, Stantec and David Clulow company folders/manifest entries.
- Rebuilt final.zip in the same combined folder. Still 528 jobs / 531 rows; master CSV and 32 selected company data/report files byte-identical. No jobs lost, no rescrape/code change. Original source-batch deliveries unchanged.
- Exact eight-company scope, schema/master/duplicate/date/pay/location/PK/CRC/layout and published-file-vs-ZIP checks pass. Old 11-company verification metadata moved to history rather than presented as current.
- Open file prevented whole-folder rename. Safely published component-wise without touching the unchanged master CSV; prior combined ZIP/reports and removed company folders archived under output/_history/combined-17-9-26-before-eight-only/.
- Context/history updated; no Obsidian synchronization claimed. Next: await requested review/work.

## 2026-09-17 — canonical company labels in combined exports
- User released the master CSV lock. Rebuilt/published output/combined 17-9-26 batches/final.zip and companies.csv with exactly the eight requested company names in the company column, not only folders.
- Changed 307 company labels (Tower Hamlets, B&M, Hillingdon, Frasers brands, Restore aliases); retained all 528 jobs / 531 rows and every non-company field. Original source rows/raw records remain unchanged in reports; company-name-corrections.json and report.exportCompanyIdentity record provenance.
- Added optional BatchCompany.exportCompanyName applied only to export rows after source-employer filtering, preserving checkpoint/resume source identities. Packager and independent validator enforce canonical labels. Combined manifests enable it; source-batch manifests/deliveries untouched.
- Verified typecheck, 8 targeted batch/output/package tests, fresh ZIP typecheck and 2 packaged batch fixtures; source-vs-export non-company equality, exact eight names in published CSV, complete master, duplicates, schema and ZIP integrity/layout. Prior combined revision archived under output/_history/combined-before-canonical-names/.
- Context/history updated; no Obsidian sync claimed. Next: await review/request.

## 2026-09-17 — 18-company count summary
- Created output/company-job-counts-2026-09-17/company-job-counts.csv with the six requested columns, plus audit.json and reproducible scripts/summarize-requested-counts.ts.
- Distinct job URLs: 1,196 company-scoped total; 1,124 confirmed UK (including the documented Mencap exception); 895 retained under existing two-month rules. Counts are from September 15–17 snapshots, not a vacancy refresh; multi-location CSV rows are not extra jobs.
- Rechecked geography only for previously date-skipped saved jobs, since original extraction intentionally skipped their geography. No lookup errors. Compass total is 70 employer-matched jobs, not the 251-job group portal. Original exports/ZIPs unchanged.
- Validated all 18 count inequalities, unique source URLs, and exact accepted URL replay for 17 companies; Mencap retains its explicitly documented bespoke UK/date fallback behavior. Typecheck passed. Missing-date fallbacks and portal scope disclosed in CSV.
- Obsidian MCP unavailable; no vault synchronization claimed. Next: review count summary.


## 2026-09-18 — Comeet ten-company scrape

Comeet batch completed: 16 UK jobs/rows from 212 advertised position records across 10 boards (Alice 5, Viber 4, Kaltura 3, Noma Security 3, Port 1; other five 0). Excluded 23 explicit Aviation demo records and 3 Viber general-interest records; 170 records excluded by UK geography. All 16 live detail IDs/titles verified. All accepted records lack posted/deadline dates: September 18, 2026 fallback disclosed; time_updated is not a publication date. Alice board is alice.io, not Alice + Olivia; Aviation identity is not verified as flyglobalnow.com; Kaltura board points to corp.kaltura.com. Noma country-only remote labels do not become cities; one On-site/Remote source conflict is preserved and reported. Existing batches/workbook unchanged.
Added reusable adapter, regression tests, manifest and canonical ZIP delivery.


## 2026-09-18 — Second Comeet batch and 21-company merge

Merged Comeet delivery covers all 21 supplied companies (the second table contained 11, not 10): 43 UK jobs/rows = original 16 unchanged + 27 new. New counts: Nayax 0, Empathy 0, Checkmarx 1, Frame Security 0, Cyera 11, Optibus 0, Aqua Security 1, Coralogix 5, Earnix 2, Cycode 0, Upwind Security 7. All 27 new live detail IDs, titles and descriptions match. All 43 posted dates are disclosed September 18, 2026 fallbacks, NOT verified publication dates; recent-posting eligibility cannot be established. Combined accounting: 671 advertised records, 26 non-vacancy exclusions, 602 geography exclusions, 43 exported. Prior Alice/Aviation identity warnings and Noma worktype conflict remain.
`output/comeet-combined-21-2026-09-18/final.zip` and `companies.csv`; manifest `companies-comeet-combined-21-2026-09-18.json`. Separate second batch: `output/comeet-second-2026-09-18/final.zip`. Original first-batch ZIP and all copied source data files are byte-identical. Provenance/validation and two detail audits are in the combined output directory.
Added country-as-state regression/normalization; no first-batch data changes.


## 2026-09-18 — Third Comeet batch and 30-company merge

Comeet delivery now covers 30 supplied companies: 65 UK jobs/rows = prior 43 unchanged + 22 new. Third-batch counts: Papaya Global 12, Remedio 0, Cellebrite 5, Curve 0, Overwolf 3, Mindspace 0, Classiq 1, monday.com 0, Solidus Labs 1. All 22 new live detail IDs/titles/descriptions match. All 65 posted dates are disclosed September 18, 2026 run-date fallbacks, NOT publication dates; two-month recency remains unverified. Curve and monday.com supplied boards explicitly returned empty arrays (not proof of no jobs elsewhere). Classiq board identifies classiq.io, NOT supplied classiquelimo.com. Prior Alice/Aviation identity and Noma workplace caveats remain.
`output/comeet-combined-30-2026-09-18/final.zip` and `companies.csv`; manifest `companies-comeet-combined-30-2026-09-18.json`. Standalone third batch: `output/comeet-third-2026-09-18/final.zip`. Prior 21-company ZIP and copied data files remain byte-identical; provenance, independent validation and all three detail audits are retained in combined output.
Corrected arrangement-as-city handling with regression coverage; previous data untouched.


## 2026-09-18 — Complete Comeet count summary

30-company count summary created from saved September 18 snapshots: 854 listed records / 66 UK-tagged candidates / 65 usable exported records after existing rules. Total includes 23 demo and 3 general-interest non-vacancies. One UK-tagged Aviation record lacks details; no UK jobs removed for age. All 65 export dates are fallbacks, so recency is unverified. Correct skip accounting is 759 geography + 4 missing details, not 763 geography as earlier summary metadata stated. Exported job data and ZIPs unchanged.
CSV and audit saved in output/comeet-company-summary-2026-09-18. All 30 normalization replays, typecheck and independent CSV/count checks pass. No live rescrape.


## 2026-09-18 — User-requested Comeet update-date/remote/employment revision

User-requested Comeet policy revision: postedDate now uses time_updated (Europe/London calendar day), NOT publication date. Existing July 18–September 18, 2026 filter reapplied to saved website snapshots; no live refresh. 63 UK rows across 30 companies remain; two Cyera roles (88.764, updated June 30; 6A.55A, updated July 9) removed. No fallback dates. employment_type supplied for 49 rows, absent for 14 (left blank). location.is_remote checked: true 59 / false 4; explicit workplace_type preserved (43 Hybrid / 16 Remote / 4 On-site), boolean used only if workplace label missing. Exact source fields are retained in reports and source-field audit CSV/JSON. Previous job fields other than date/employment/worktype unchanged for retained rows, and original 65-row ZIP unchanged.
Delivery: `output/comeet-updated-fields-2026-09-18/final.zip`, `companies.csv`, `company-summary.csv`, `source-field-audit.csv`, `revision-audit.json` and `field-validation.json`. Manifest: `companies-comeet-updated-fields-2026-09-18.json`; regeneration: `scripts/revise-comeet-fields.ts`.
Verification: 9 tests in source and package, root/packaged typechecks, exact date/type/remote audits, 15-column CSV/ZIP consistency, no duplicate URLs and original ZIP preservation passed. Independent CSV audit initially coerced ISO dates into Excel serial numbers; raw text parsing fixed the audit without changing data. Obsidian MCP unavailable.

## 2026-09-18 — Uploaded Eploy sheet field correction
- Processed 1,528 CSV rows / 1,480 unique URLs; original file and 12 unrelated columns unchanged.
- 338 employment entries corrected/normalized; 75 evidence-supported workplace values filled. Unresolved: 841 employment, 1,453 workplace. Source HTTP 410 and title mismatches recorded, no unsupported defaults.
- Delivered corrected CSV and styled XLSX with field-level evidence/comments and audit; validation passed row/column identity, CSV-XLSX equality, input preservation and misleading-hybrid regression cases.
- Artifacts/sources: output/eploy-sheet6-corrected-2026-09-18/. Production scraper unchanged. Obsidian MCP not available; local docs updated without claiming vault sync.

## 2026-09-18 — Eploy salary-format revision
- User requested compact salary ranges. Created separate salary-corrected CSV/XLSX with Salary audit; prior files preserved.
- 1,528 rows; 1,211 salary changes; 166 ranges, 804 single amounts, 558 blanks. Original currency retained, no annualization or invented endpoints, bonus excluded from base ranges.
- All other 13 columns unchanged, including prior employment/worktype corrections. Twelve parser regression tests, output format, row identity and CSV/workbook equality passed.
- Output: output/eploy-sheet6-salary-corrected-2026-09-18/. Obsidian MCP unavailable; local docs only.

## 2026-09-18 — FourCompany annual salary move
- Input FourCompany-jobs.csv: 185 rows. Moved 10 explicit annual Salary headers to salaryRange (9 ranges / 1 upper-limit amount), compact GBP format.
- Original salary header amounts removed; period/upper-limit/London weighting qualifiers retained in replacement basis lines. Alternative FTE/pro-rata text preserved.
- All other 175 rows and other 12 columns unchanged. Hourly pay, research funding and student stipends excluded; no annualization.
- Delivered CSV/XLSX, salary-move-audit.csv and validation.json under output/fourcompany-annual-salary-corrected-2026-09-18. Original hash, exact scoped edits, CSV/workbook equality and 8 regression cases verified. Local docs only; no Obsidian MCP available.

## 2026-09-18 — Combine latest corrected job sheets
- Merged latest corrected Eploy (1,528), FourCompany annual salary correction (185), and uploaded companies (4).csv (63) into one 1,776-row / 15-column worksheet and matching CSV.
- Output: output/combined-all-jobs-2026-09-18/all-jobs-combined.xlsx and .csv. All source values and row order preserved, missing ats blank. No duplicate or untitled-row removal.
- Validated original hashes, exact source fields and CSV/workbook equality. Existing 9 untitled rows, 48 extra repeated URLs and 8 extra exact duplicate rows retained. No cross-source URL overlap. Obsidian MCP unavailable; local documentation only.

## 2026-09-18 — Consolidated companies code
- Created `companies code/` with 90 company folders and shared framework, README, inventory and validation. Added reproducible collector `scripts/collect-companies-code.mjs`.
- Preserved five standalone scrapers except isolated output paths; collected 46 shared-framework company launchers; packaged 39 previously configuration-only entries without claiming live verification. Corrected CSV/Comeet configurations supersede prior duplicates; eight held entries remain excluded.
- Verified 239 original input hashes, company coverage, exact corrected configurations, absence of generated artifacts, shared/all-wrapper typecheck and five standalone typechecks. No source batch changes or live scraping. Obsidian MCP unavailable.


## 2026-09-18 — Limit company code to explicit selection
Reduced collection from 90 to the requested 48 company folders plus shared framework. Moved 42 excluded folders to output/_history/company-code-excluded-2026-09-18 without modifying original batches. Updated collector selection, inventory, shared manifest, README and validation. Exact folder/configuration/entrypoint checks, 88 copied-file preservation checks and collector syntax passed; no scraper logic changes or live scraping. Obsidian MCP unavailable.


## 2026-09-18 — Make all 48 company scrapers independent
- Replaced shared-layout collection with 48 full standalone packages. Copied complete framework code/dependencies/tests into 43; retained 5 legacy sitemap implementations and made their company.json authoritative. Added missing generic CLI support file discovered by bundled integration testing. No source-batch or configuration changes.
- Archived prior collection under output/_history/company-code-before-standalone-2026-09-18. Updated collector and added scripts/verify-company-portability.mjs.
- Fresh isolated npm installs and typechecks passed for all 48; two CLI runs each (96 total) preserved previous outputs. 62 unit and 20 browser/integration tests passed across initial run and targeted repair verification. Both implementation families returned nonzero on a local unavailable-site fixture. 1,216 copied files hash-checked and 48 company configs preserved. Final portability report allPassed=true. No live-site guarantee.
- Local project docs updated; no Obsidian MCP available.
## 2026-09-22 — Corrected five-company export fields

- Replaced the flawed five-company delivery with `output/22-9-26 batch-corrected-fields/final.zip`.
- Filled every job ID from source URL/reference evidence. Filled city/state only from source-labelled facts, verified TCFM recovery data, or unambiguous Postcodes.io matches.
- Re-scraped Long Term Futures live: 81 current rows replace the earlier 339 over-collected rows.
- Added extraction regression coverage for source IDs, Exchange Street labels, and Long Term Futures page content/location. Jev scraper typecheck and all 23 tests pass.

## 2026-09-22 — Combined CSV audit

- Read-only audit found the 540-row combined export is structurally sound and source-company mappings are consistent, but it violates permanent export formatting rules in 180 row-level cases: 111 location strings omit `UK`, 68 salaries are not compact canonical values, and one Long Term Futures row has no description. No exported data was modified.

## 2026-09-24
- Began the supplied 14-company scrape; corrected Partnering Health source and added verified zero-vacancy exports for Pathfinder Ashness Care and Pickwick. Recorded source identity mismatches in prior PRDC and Prince of Wales exports.


- 2026-09-24: Added eight-company 15-column export script and 181-row source-audited delivery; two mismatched employers remain unresolved.

- 2026-09-24: Added Rodericks Dental Partners live scraper and separate 346-job 15-column package.

- 2026-09-24: Packaged 527-row combined eight-company plus Rodericks delivery.

- 2026-09-24: Added Operations Resources Limited scraper and 530-row combined delivery.

- 2026-09-24: Corrected six source job IDs in latest 530-row delivery; validated Reed ID.

- 2026-09-24: Added MAIN_UK_Scrape.md runbook and physical company-wise layout for latest 530-row delivery.

- 2026-09-24: Adopted date-first output naming and separate verified copy with verification.json scope.

- 2026-09-24: Consolidated source scripts into dated output code/ and updated single-folder runbook rule.

- 2026-09-24: Added per-company code library folders and bundled their dated snapshots.

- 2026-09-24: Prepared date-only output cleanup and retired obsolete Markdown; folder deletion blocked by host policy.

- 2026-09-24: Removed 124 older output directories; retained only date-prefixed working and verified directories.

- 2026-09-24: Organized loose output files into dated working archive; output root now contains only two dated folders.

- 2026-09-24: Applied the requester's canonical company-name list to the 530-row delivery (Rodericks Dental Partners -> PRDC Dental, Operations Resources Limited -> Operations Resources, Pinpoint Resourcing Ltd -> Pinpoint Resourcing ltd; 359 rows in 9 files) with the new TypeScript tool `scripts/relabel-company-labels.ts`, which checks exact per-file counts and edits only the `company` field.

- 2026-09-24: Added `scripts/verify-package-24-9-26.ts` (contract, labels, CSV/JSON equality, per-company slices, ZIP-to-disk SHA-256, optional repackage and copy comparison); rebuilt `final.zip` (48 entries), fixed the stale README/source-report copies under `jobs company wise/`, and refreshed `2026-09-24-verified/` with all 61 files hash-equal.

- 2026-09-24: Rescraped the Prince of Wales board and added it to the delivery: new `scripts/scrape-prince-of-wales-24-9-26.ts` reads the board's own public endpoint chain (api/liveadverts/filter then api/liveadverts/{AdvertId}), exports 6 of 8 live adverts (two volunteer adverts fall outside the two-month window) under the requested label `Prince of Wales Medical Centre`, and appends them to the master without re-serialising existing rows. Delivery is now 536 rows; `final.zip` rebuilt with 50 entries and `2026-09-24-verified/` refreshed (63 files hash-equal).
- 2026-09-24: Added root `UK_SCRAPING_TEAM_LEAD.md` as the Paperclip UK scraping lead's review and acceptance playbook. No data or scraper changes.
- 2026-09-25: Added separate Paperclip software engineer instructions for Turio and UK scraping; no scraper or data changes.
# 2026-09-28 — Four-company scrape

- Exported 34 source-backed UK vacancies into a separate four-company delivery: Mountain Healthcare Ltd 27, Northwood Hygiene Products Limited 6, Mega food centre 1, Mayra Property Services 0.
- Preserved exact requested company labels; excluded the supplied Mayra German careers board because it belongs to another employer. Disclosed MegaCentre Rayleigh source-name difference.
- Added TypeScript export/packaging code to canonical company folders and dated code snapshots. Verified 15-column CSV/JSON agreement, unique vacancy keys, cutoff/expiry, ZIP contents and copied delivery. See `../output/2026-09-28-verified/verification.json`.

# 2026-09-28 — Personal data location and extraction fixes

- Added a Windows folder chooser and verified copy for each user's app data and exports; launcher reads the chosen location.
- Removed Taken/friend assignment, repaired uploaded-source deletion, sorted exports by actual recency, and kept only explicit annual GBP pay in salary range.
- Corrected misleading DOM robots errors from third-party widgets; added extraction for labelled unstructured vacancy pages and exact careers-site links.
- Verified seven rows from the live Counter Terrorism Policing careers listing. Unit and browser/integration suites pass; 67 pre-existing TypeScript diagnostics remain.

# 2026-09-29 — IDs and location-based exclusions

- Normalize URL-valued structured identifiers to a stable numeric posting ID when present in the actual job URL or supported ID query parameter.
- Allow the shared UK geography resolver to verify non-ATS listings when their job-specific location provides a settlement and region; ambiguous single names and explicit foreign locations remain excluded.
- Diagnosed active-run empty exports for Curtis Fox and CV Technical as location-evidence exclusions. Cwm Taf's saved source points to a general NHS homepage instead of its dedicated jobs site. Left the active batch and current user state untouched.
- Changed files have no TypeScript diagnostics; full project retains existing diagnostics. Tests were not run.

# 2026-09-29 — Dynamic crawl boundary and app/JEV separation (uncommitted)

- Removed Fieldwork's 250-request default; generic pagination, public API totals and sitemap enumeration now end on discovered source boundaries with a 10,000-request emergency ceiling and explicit partial reports for loops or limits.
- Removed JEV from dashboard settings, worker dispatch, metrics and UI. The standalone CLI remains separate.
- Corrected job-specific IDs, known ATS preservation, location evidence handling, detail-page pagination, and filtering of unrelated downloads and third-party embeds.
- Verified local 1,200-page HTML and 260-URL sitemap fixtures; fresh Crone 14/14 and Cross Keys 7/7 job IDs are clean. Côte found 94 distinct jobs but remains partial due site rate limits and empty details. Audit and before/after comparison are in `docs/superpowers/plans/2026-09-29-dynamic-crawl-audit.md`.
- Unit 105/105, browser 44/44, active TypeScript and UI syntax passed; full TypeScript retains 67 historical one-off-script errors. No commit or push because the user-required data/check gate did not pass.

- Data audit of the separate dated 70-row output found blockers: 18 Germany jobs in a UK delivery; corrupted Cross Keys descriptions and missing dates; hourly pay in salary fields; false salary values and apparent location mismatches at other sources. Dashboard Cross Keys descriptions are also title-only/short snippets. Keep this delivery out of release until corrected and re-audited.

## 2026-09-30 — Final CLI delivery and persistence readiness

- Added final-delivery producer and tested location consolidation: one vacancy row retains all explicit locations, and conflicting shared fields block delivery. CSV generation validates source records and re-reads the written file. Final company CSV, JSON and report counts agree.
- Produced `output/30-9-26/30-9-26.csv` with 110 jobs across eight companies, preserving the original 70-row CSV. Recorded 169 current exclusions and the withdrawn Curtis advert separately.
- Confirmed Currie advert 21863 genuinely lacks primary role/location fields in static and rendered HTML; Curtis advert 93 returns HTTP 410. Fresh affected-company runs completed through CLI.
- Fixed dashboard readiness before final persistence; deterministic regression and full concurrent unit suite pass. Final gates: 120 unit tests, 25 focused geography/API tests, app typecheck, whitespace diff and CSV read-back pass.

## 2026-09-30 — Dashboard pipeline reports

- Shared the final normalizer, quality checks and multi-location merge across dashboard workers, CLI runs and dated delivery packaging.
- Fieldwork retains reports for empty runs, exposes quality failures in the report panel and blocks unsafe CSV downloads.
- Exports now lists the `30-9-26` pipeline delivery with links to its CSV, summary report and rejection ledger.
- App typecheck, UI syntax, and focused finalizer/run-state/dashboard checks pass. Standard test launch hits a sandbox `spawn EPERM`; compiled focused tests pass.
