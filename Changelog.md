# Changelog

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
