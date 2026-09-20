# UK SCRAPPER — current project context

## New folder — Jev-optimised scraper (`jev-scraper/`), September 19, 2026

Standalone, self-contained project: a fast UK careers scraper where TypeSafe Jev makes the judgment calls and code handles I/O, dates and verbatim extraction. It does not modify or depend on the deterministic engine in `src/`.

- Boundary kept strict. Jev does link triage (vacancy vs listing vs navigation), single-vacancy confirmation, UK/right-to-work, worktype, employment type, salary kind and date kind. Code fetches, respects robots.txt, paces per origin, parses dates with `parseDate`, and extracts £ ranges verbatim. A date or salary is never invented; Jev output is a label, never a copied value.
- Providers, both verified live: OpenRouter `POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.13` (primary, returns `usage.cost`); Vercel AI Gateway `POST https://ai-gateway.vercel.sh/v1/evaluate`, model `typesafe-ai/jev` (fallback — note its question type is `boolean`, not `noul`). Transient 429/5xx retry with backoff and `Retry-After`; a hard failure (free-tier rate limit/402/403) fails forward to the next provider; with none left the run still completes deterministically and those rows are marked `judged: deterministic`.
- Restricted-choice bias is mitigated: every Choice carries an explicit escape (`not stated` / `not sure`), and answers below `--confidence` are ignored in favour of source evidence. Link triage questions each name their own url and link text, because identical per-link wording made the model return one verdict for a whole page.
- Evidence: `npm run typecheck` clean; `npm test` 6/6 passing; `npm run e2e` (local fixture server plus real Jev) PASS, with the UK row `judged: jev`, salary `£24500-£26000` and the US row excluded as `no_confirmed_uk_location`. Live crawl of `https://compasscommunityweb.eploy.net/vacancies` (Eploy, static HTML) produced **8 UK rows from 8 pages for ≈$0.001** (10 Jev calls, 382 ms average), all `judged: jev`; triage scored real vacancy pages 0.88–1.00 and rejected navigation, saved-jobs, view toggles and application forms.
- Limit: no browser. JavaScript-rendered boards (Greenhouse/Lever listing pages) expose no static links and still need the parent Playwright path or a site adapter.
- Secrets: keys live only in `jev-scraper/.env`, which is gitignored. Cost model ≈ $0.00008 per job at $0.042/MTok input with free output.


## Latest delivery — Consolidated company code, September 18, 2026
`companies code/` contains exactly the user-selected 48 fully self-contained company folders; there is NO shared-folder dependency. Each includes src/, company.json, scrape.ts, package.json, package-lock.json, tsconfig.json and setup/run instructions. The 43 framework packages also include bundled tests and scraper.ts (generic CLI supporting tests). The 5 legacy sitemap implementations are preserved, with launchers now reading company.json. Run inside any copied company folder: npm ci; npx playwright install chromium; npm run scrape. Every run uses current dates and a new dated runs/ output folder. All original company configurations and batch sources unchanged.

Verified outside the repository with each package's own fresh dependency install: 48 installs, 48 typechecks, 96 local CLI runs with output preservation; 62 packaged unit tests and 20 browser/integration tests passed. A missing generic CLI detected by integration testing was added to all 43 packages; all 43 updated typechecks and the affected integration test passed. Unavailable-source tests returned exit code 2 for both implementation families. Final source hash checks cover 1,216 copied files. Evidence: companies code/portability-validation.json (allPassed=true); collection-validation.json. No live employer scraping or promise of future website availability. Existing source/identity caveats, including Aviation demo-board limitations, remain in company READMEs.

Builders: scripts/collect-companies-code.mjs and scripts/company-code-selection.json; isolation verifier: scripts/verify-company-portability.mjs. Previous shared-layout collection archived in output/_history/company-code-before-standalone-2026-09-18. Next: user can copy any one folder, install dependencies and run its script. Obsidian MCP unavailable; local documentation only.

## Active recovery — Akhil/Ruthvik replacement CSV, September 18, 2026
User explicitly requests continued autonomous work until extraction is finished. Source: `D:/Programs/Java/downloads/Akhil team - ruthvik.csv` (47 rows); PDF superseded. Original CSV and full-name manifest mappings/hash verified. **No final delivery yet.** A heartbeat named `Finish Akhil CSV job extraction` (id `finish-akhil-csv-job-extraction`) continues this task every 30 minutes; pause it after final delivery/blocker report.

Current processing: `companies-akhil-targeted-{1,2,3}-2026-09-18.json` and corresponding `output/akhil-targeted-{1,2,3}-2026-09-18/` directories (15 / 20 / 1 company entries; independent domains, not agents). Group 1 log is `run-filtered.log`, group 2 `run.log`, group 3 `run-paginated.log`. Inspect matching running Node command lines before restarting. The previous broad default passes were stopped because they crawled irrelevant global navigation. Their old `completion.json`/finalizer failure is **not** the current task status.

Recovered: `output/akhil-recovery-2026-09-18/laat/` has 3 current jobs from the officially linked LAAT Zoho board (8 listed: 3 filled, 2 old, 3 exported). TCFM has 73 rows from 83 extracted / 89 sitemap URLs; 10 old, 6 redirect failures; visible board initially advertised 86. TCFM remains partial until listing/redirect reconciliation. Do not lose either recovery when merging later.

New shared code: `src/zoho.ts` is deliberately LAAT-scoped, reads public embedded JSON and full current details without evaluating source JavaScript. `selectors.jobLinksOnly` is opt-in restrictive navigation plus pagination and disables automatic global sitemap discovery; original additive `jobLinks` behavior remains unchanged. CSS descriptions now retain roleDescription for source-based geography, and official NHS Jobs hosts are recognized for linked details. Thirteen focused tests and typecheck passed before the latest manifest-only changes; earlier broad selector behavior broke a legacy test and was replaced with this backward-compatible opt-in.

Research snapshots/inputs: `output/akhil-ruthvik-2026-09-18/research/` and `research-*.json`; helper `scripts/inspect-akhil-sources.ts`. Many supplied careers paths were 404; homepages provided verified replacements in `scripts/prepare-akhil-targeted.py`. Louis Vuitton UK filter advertises 17 jobs; **only** `main > div.lv-career-job-list` links avoid its worldwide related-job cascade. Long Term Futures needs its explicit `/job-search/page/` next selector (leading-zero/158 pagination); initial 6-candidate no_matches output is incomplete/superseded. All its geographic exclusions must remain evidence-based, not headquarters inference.

Remaining special-source work: Kent advertises Trac board id 944 via an embedded script; Kent robots crawl-delay is 600 seconds, and feeds.trac.jobs robots returns 403. Use another legitimately public official NHS listing, never bypass access controls. Sutton's employer-name NHS search is fuzzy (149 pages including unrelated employers); needs exact source-employer scoping, not blind collection. TCFM name matches supplied careers destination despite bad tcfmagazine company URL. EW official contact confirms EW Recruitment Ltd at ewrecruitment.co.uk, distinct from EW Recruitment Services. Somerce's genuine social-commerce careers page links `https://apply.workable.com/somerce/`; supplied somercecil is unrelated. Edmund & Evans valid board is `https://edmundandevans.com/current-vacancies/`. Marc Daniels supplied domain fails; Reed's company-specific public board `https://www.reed.co.uk/jobs/marc-daniels/o393766` advertises 47 jobs (secondary source, must disclose). First Rung Independent School is reported closed by official school-register search; supplied US school careers page is unrelated. MHA Brazil only exposes a general recruitment contact; supplied mha.com URL fails. OP/Opel must not be relabelled with all Stellantis group jobs; unresolved scope. SF Partners source domain is parked.

Next: finish the active targeted groups, recover accessible special boards, verify every company against current advertised listing counts, account for all 47 CSV entries, merge the best result per company once, then use `scripts/package-batch.ts` and `scripts/validate-batch.py`. Include explicit unresolved/blocked outcomes; no failed extraction may be labelled zero vacancies. Obsidian MCP unavailable; local docs only.

## Latest delivery — Combined job sheet, September 18, 2026
Combined only the latest corrected Eploy sheet (1,528 rows), annual-salary-corrected FourCompany sheet (185 rows), and user-uploaded `D:/Programs/Java/downloads/companies (4).csv` (63 rows). Delivery: `output/combined-all-jobs-2026-09-18/all-jobs-combined.xlsx` (one worksheet) and same-name CSV: 1,776 rows / 15 columns. All input values and order preserved; missing ats padded blank for the two 14-column inputs. No source files altered; no deduplication, salary reformatting, or other correction during merge. Nine untitled rows and existing repeated rows retained (48 extra repeated URLs; 8 extra exact duplicate rows). Zero URL overlap between the three sources. Original-file hashes, source-to-output field preservation and exact CSV/XLSX equality pass; `merge-validation.json` records source row spans. Regeneration: `scripts/combine-current-job-sheets.py`. Next: user review; optional cleanup only if requested. Prior source uncertainties remain. Obsidian MCP unavailable; local docs only.

## Latest revision — FourCompany annual salary move, September 18, 2026
Input: `D:/Programs/Java/downloads/FourCompany-jobs.csv`. Delivered CSV/XLSX at `output/fourcompany-annual-salary-corrected-2026-09-18/FourCompany-jobs-annual-salary-corrected.*`. Moved 10 explicit per-annum Salary headers (9 ranges, 1 upper-limit single amount) from description into salaryRange; description now retains only the corresponding salary-basis qualifiers at those headers. All other description text, including alternative FTE/pro-rata explanations, preserved. All 185 rows retained; other 175 rows entirely unchanged, including hourly wages, annual student stipend, research funding and missing salaries. All other 12 columns unchanged. Source original unchanged; CSV/workbook roundtrip and 8 focused regression cases pass. Script `scripts/correct-fourcompany-annual-salary.py`; audit and validation alongside delivery. Next: user review; no annual salary invented for the remaining 175 rows. Prior Eploy corrections remain separate and unchanged. Obsidian MCP unavailable; local documentation only.

## Latest revision — Eploy salary formatting, September 18, 2026
Delivered `output/eploy-sheet6-salary-corrected-2026-09-18/eploy-sheet6-1-uk-jobs-salary-corrected.xlsx` and same-name CSV. Changes salaryRange only in the prior 1,528-row corrected sheet; all other 13 columns, including employment/worktype, unchanged. 1,211 salary cells changed: 166 ranges, 804 single amounts, 558 blank (missing/non-numeric/malformed or ambiguous regional bands). Ranges use £30000-£40000; shorthand k expanded; bonus/allowance amounts not mistaken for range endpoints. Source currency retained, not converted to USD. This formatting-only revision retains hourly/daily numeric amounts without annualization; period, bound, OTE/FTE qualifiers and original text are retained in Salary audit. Script: `scripts/correct-eploy-sheet6-salary.py`. Twelve parser regression cases, strict output-format checks, exact other-column preservation and CSV/workbook equality pass. Previous deliverables unchanged. Next: review Salary audit for missing salaries/basis qualifiers; employment/worktype uncertainty from prior delivery remains.

## Latest delivery — Eploy uploaded-sheet correction, September 18, 2026
Corrected only employmentType/worktype in the user-supplied `D:/Programs/Java/downloads/eploy-sheet6-1-uk-jobs.csv`. Output: `output/eploy-sheet6-corrected-2026-09-18/eploy-sheet6-1-uk-jobs-corrected.xlsx` (jobs, audit, readme) and same-name CSV. All 1,528 rows, order, duplicates and other 12 columns preserved. Checked 1,480 unique vacancy URLs (one HTTP 410); 338 employment entries changed, 75 worktypes filled (47 Hybrid / 6 Remote / 22 On-site). Unresolved fields remain blank: 841 employment types and 1,453 worktypes; do not call this a completely populated dataset. Valid original labels retained where live evidence unavailable are explicitly flagged. No blanket Full-time/On-site inference from hours/title/location; generic hybrid benefits and hybrid job responsibilities excluded. Sources, evidence and successful CSV/workbook/preservation validation saved alongside output. One-off scripts: `scripts/correct-eploy-sheet6-fetch.mjs`, `scripts/correct-eploy-sheet6.py`, `scripts/package-eploy-sheet6.py`; production scraper unchanged. Next: user review of unresolved fields; stronger source data required to fill them. Obsidian MCP unavailable; local documentation only.

## Latest delivery — September 18, 2026
User-requested Comeet policy revision: postedDate now uses time_updated (Europe/London calendar day), NOT publication date. Existing July 18–September 18, 2026 filter reapplied to saved website snapshots; no live refresh. 63 UK rows across 30 companies remain; two Cyera roles (88.764, updated June 30; 6A.55A, updated July 9) removed. No fallback dates. employment_type supplied for 49 rows, absent for 14 (left blank). location.is_remote checked: true 59 / false 4; explicit workplace_type preserved (43 Hybrid / 16 Remote / 4 On-site), boolean used only if workplace label missing. Exact source fields are retained in reports and source-field audit CSV/JSON. Previous job fields other than date/employment/worktype unchanged for retained rows, and original 65-row ZIP unchanged.
Delivery: `output/comeet-updated-fields-2026-09-18/final.zip`, `companies.csv`, `company-summary.csv`, `source-field-audit.csv`, `revision-audit.json` and `field-validation.json`. Manifest: `companies-comeet-updated-fields-2026-09-18.json`; regeneration: `scripts/revise-comeet-fields.ts`.
Implementation: src/comeet.ts; 9 source and packaged adapter tests pass; root/packaged typechecks pass. Independent CSV date/boolean/type checks, company-label checks, ZIP master/readme checks and preservation comparisons pass. Earlier identity/empty-board caveats remain. Next: review revised files; 14 employment types cannot be filled from absent source values. Obsidian MCP unavailable; local docs only.

## Prior Comeet count summary — superseded by update-date revision
30-company count summary created from saved September 18 snapshots: 854 listed records / 66 UK-tagged candidates / 65 usable exported records after existing rules. Total includes 23 demo and 3 general-interest non-vacancies. One UK-tagged Aviation record lacks details; no UK jobs removed for age. All 65 export dates are fallbacks, so recency is unverified. Correct skip accounting is 759 geography + 4 missing details, not 763 geography as earlier summary metadata stated. Exported job data and ZIPs unchanged.
Files: `output/comeet-company-summary-2026-09-18/company-summary.csv` and `audit.json`; generator `scripts/summarize-comeet-counts.ts`. Per-company normalization replay, count invariants, typecheck and independent CSV totals validated. Next: review summary with date/identity caveats.

## Latest count summary
Requested 18-company summary: `output/company-job-counts-2026-09-17/company-job-counts.csv` and `audit.json`. Distinct jobs: **1,196 total / 1,124 UK / 895 after existing date rules**. Uses September 15–17 saved snapshots; no vacancy refresh. Previously date-skipped jobs received geography-only checks. Compass is employer-scoped (70 of 251 portal jobs); Mencap retains its approved exception and 147 date fallbacks. Original deliveries unchanged. Generator: `scripts/summarize-requested-counts.ts`. Typecheck/count invariants/accepted-URL replays passed; geography checks had no errors. Next: review summary. Obsidian MCP unavailable.

## Overview / status
Latest combined delivery: `output/combined 17-9-26 batches/final.zip` now uses **exactly the user's eight names in the exported company column as well as its company folders**: News UK, Tower Hamlets, CC Nurseries, B&M, London Borough of Hillingdon, Frasers Hospitality, Restore and Wren Kitchens. **528 jobs / 531 UK location rows**; 307 company labels normalized from source aliases/brands, all other exported fields and job selection unchanged. Original source rows/raw records and names remain in reports; `report.exportCompanyIdentity` and `company-name-corrections.json` document the mapping. Packaged manifests set `exportCompanyName` so reruns retain canonical labels after source scoping. Both source-batch ZIPs are untouched; Tower fixes and Wren retained. The master file lock cleared and the updated CSV/ZIP were published together. Scope/schema/master/ZIP checks, typecheck, 8 targeted tests and 2 isolated packaged batch fixtures passed. Previous combined revision is archived under `output/_history/combined-before-canonical-names/`.

Latest correction: rebuilt `output/batch 17-9-2026/final.zip` for Tower Hamlets. All 16 rows now use **London, Greater London, UK**, supported by saved JobPosting addresses and verified E1 1BJ / E1 5NP postcodes. Fixed 15 UK-only rows and the false Office/Suffolk row. Only location/city/state changed in those exports; all other job fields and all 172 other companies' actual job rows remain unchanged. Removed three legacy company-only non-job placeholders; master now has **188 actual job rows**. Original scrape dates, selections and exclusions retained; no rescrape. Prior revision is under `output/_history/batch-17-before-tower-location-fix/`. Audit: `location-corrections.json`.

Separate second batch, unchanged by this correction: `output/17-9-26 second batch/final.zip` — **340 qualifying jobs / 343 UK location rows**, updated September 17, 2026. At the user's request, Wren Kitchens replaces Phase Eight: 255 Wren pages read, 180 jobs/rows accepted, 75 old postings excluded, no extraction errors/limits. Frasers Hospitality (143 jobs/rows) and Restore (17 jobs / 20 rows) were reused without rescraping; all eight CSV/JSON/result/report files are byte-identical. Wren has 53 both-dates-missing fallbacks, each disclosed in its report. Phase Eight company folders are absent from that delivery. Prior version archived under `output/_history/17-9-26-second-batch-before-wren/`; workbook colours unchanged.

Manifest: `companies-17-9-26-second-batch.json`. Reusable title-prefix employer scoping is in `src/batch.ts` and checked by the packager; never use fallback employer labels as scope evidence. `src/geography.ts` verifies missing structured postcodes from explicitly labelled role-location clauses (Restore 1679/1680). `src/normalize.ts` handles hourly `ph`, DOE in role salary clauses, missing salary-field fallback to an explicit salary clause, and ranges without interpreting bonuses/hours as bounds. Named unresolved sites remain in descriptions/reports with empty city/state.

Current export behavior: zero-result exports are header-only CSVs / empty JSON arrays; diagnostics belong only in reports. Geography now treats Hybrid/Office/Community as work arrangements, not geographic labels, retaining only role-specific source address fields. Genuine visible places still override conflicting addresses; home-based/remote/nationwide and explicit foreign-country safeguards remain. Regression reproduced before fix; typecheck and 31 targeted tests pass, plus isolated packaged typecheck and 17 geography tests. Independent CSV/master/ZIP checks and non-location/other-company comparisons pass. Tower checkpoints are under `output/_history/tower-location-checkpoints/`; Wren work remains under `output/_history/second-batch-wren-*`. Obsidian MCP unavailable; no vault sync claimed.

Next: review the combined ZIP; await requested work. Stantec/Legion blocked and Clulow no-match outcomes are unchanged, represented by header-only exports rather than diagnostic records.

TypeScript public-careers scraper with a local Fieldwork dashboard and reusable manifest-driven batch framework. The five-company batch is delivered and validated: `output/batch-2026-09-16/final.zip` (253 UK job-location rows / 240 jobs).

## Earlier five-company delivery
| Company | Jobs | Location rows |
| --- | ---: | ---: |
| Mencap | 147 | 149 |
| Intercity Technology | 6 | 6 |
| London Borough of Bexley | 15 | 15 |
| SeeAbility | 43 | 43 |
| Compass Schools | 29 | 40 |

The final ZIP uses the permanent delivery layout (see "Permanent packaging and organization conventions" below): `code/` (scraper code organized by company plus the shared `universal_scraper/` framework), `jobs company wise/` (each company's generated job/output files in its own folder), and the combined master CSV at the ZIP root. Code reruns create dated `runs/` folders on disk; runs, logs, caches, test output and `node_modules` never enter the ZIP. Previous deliveries and the coloured workbook are unchanged.

The earlier five-company delivery (MWH Treatment, Guide Dogs, Alzheimer's Society, Thinking Schools Academy Trust, Walker's Shortbread — 134 location rows) is preserved under `output/batch 15-9-2026/` in the same permanent layout, with the `location` column recomputed as city + state + country in every CSV/JSON.

## Rules and known limitations
- Exactly 15 job columns; ats=Custom; no process/reason result columns. Missing fields stay empty; diagnostics remain in reports.
- The `location` column is always the combination of city + state + country (e.g. `Askern, Doncaster, UK`); empty parts are dropped and country is always UK on exported rows.
- Confirmed UK locations only; inclusive rolling two-calendar-month window (applies to present posted dates). Posting-date rule: a present posted date is kept as published; if the posted date is missing but a deadline is given, the posted-date column stays empty (the run date is never substituted); only when both posted date and deadline are missing is the run's UK calendar date used as the posted date, disclosed in the report. Present invalid dates are excluded.
- Salary rule: a source salary shown as d.o.e (depending on experience) or an hourly rate (per hour) is moved into the job description and the salary field is left empty. A salary is never invented. The salary field contains only the pay range with the pound sign — £ prefixed to each amount and a hyphen between bounds (e.g. £42500-£45000 or £24785); thousands separators and all other wording are stripped, and a source value with no numeric pay range (d.o.e and hourly rates are moved to the description instead) stays empty.
- Mencap is a confirmed UK-based organisation; per owner instruction only the two-month posting filter applies to it. Its visible location labels are exported verbatim with country UK (gazetteer-confirmation notes retained in the report); explicit foreign countries on the source are still excluded. All 147 advertised pages were extracted; 0 records excluded. All other companies keep the confirmed-UK-location rule.
- Intercity's old workbook host does not resolve. Manifest uses the new careers site linked from its official website. PropertyValue.value, not employer name, is the job ID.
- Compass's supplied portal is group-wide. Exports are restricted to source hiringOrganization=Compass Schools; other employers remain documented in scopeExcluded.
- Arbitrary/private APIs, unrecognized iframe providers and unusual cursor contracts can require adapters. No login/CAPTCHA bypass or application submission.
- New batch is not yet integrated into the dashboard's legacy completed-company tracking. Do not assume its workbook rows were coloured or marked taken.

## Architecture / implemented features
Node.js 22+, TypeScript, Playwright Chromium, Cheerio, robots-parser, fflate. Strategy selection covers public ATS APIs, explicit/linked JSON feeds, sitemaps, static HTML, JSON-LD/microdata, Eploy HTML fallback, DOM rendering, supported iframe links, browser GET JSON responses, pagination and infinite scroll. Batch execution is sequential with per-company checkpoints, resume, scope filtering and isolated failures.

Existing dashboard (`npm run ui`, localhost:4317) supports workbook import/mapping, six spreadsheet/text formats, duplicate merging, extraction settings, five-company queues, previews/downloads and history. Workbook has 100 rows / 98 unique sites; earlier five-company delivery contains 134 rows.

## Verification
- `npm run check`: typecheck + 59 unit/API/import tests + 23 integration/browser tests = 82 passing.
- Fresh dependency install outside the repository: npm ci completed; audit reported zero vulnerabilities.
- All six packaged projects typecheck. Five company entry points and a two-company universal batch pass isolated local-fixture runs.
- Packaged universal framework: 46 unit + 20 integration tests = 66 passing.
- Independent Python CSV/JSON checks and ZIP CRC/layout validation pass. Combined CSV has 253 rows. Validation evidence is in the batch and universal package.

## Key files / commands
- `companies-next-five.json`: verified five-company configuration and scope.
- `batch.ts`, `src/batch.ts`: reusable manifest CLI, checkpointing and combined CSV.
- `src/strategy.ts`, `src/api.ts`, `src/crawl.ts`, `src/extract.ts`, `src/sitemap.ts`: extraction/fallback modules.
- `src/geography.ts`, `src/normalize.ts`, `src/output.ts`: evidence, filtering and export contract.
- `UNIVERSAL_SCRAPER.md`: setup, extension points and supported/unsupported contracts.
- `scripts/package-batch.ts`, `scripts/validate-batch.py`, `scripts/verify-batch-packages.ts`: delivery assembly and validation.
- Run a fresh batch: `npm run batch -- manifest.json --out output/NEW-BATCH`.
- Package exactly five: `npm run package:batch -- output/NEW-BATCH manifest.json`.
- `--resume` reuses matching saved data, not a live refresh; use a new directory for a new extraction.

## Permanent packaging and organization conventions

Treat the rules in this section as permanent project conventions; follow them automatically for all future scraping work and batches.

### Final ZIP structure
Every future completed batch must produce a `final.zip` with this exact top-level structure:

```
final.zip
├── code/                        scraper/source code, organized neatly by company
│   └── universal_scraper/       reusable/common framework lives here, not duplicated per company
├── jobs company wise/           each company's generated job/output files, one subfolder per company
│   └── <company-slug>/
└── <master CSV>                 combined dataset CSV at the ZIP root
```

- The master CSV (e.g. `companies.csv`) stays at the ZIP root and contains the complete combined dataset.
- `code/<company>/` contains that company's scraper/source code; reusable/common functionality goes in the shared folder (`code/universal_scraper/` or a `common/` folder), never duplicated per company.
- `jobs company wise/<company>/` contains that company's generated outputs (jobs CSV, export rows, scrape reports, result documentation), separated by company.
- Do NOT place temporary files, logs, caches, `node_modules`, build artifacts, test output, or unrelated files in the final ZIP.
- Keep folder and file names clean, consistent, and company-specific.

### Coding organization
For every new company:
- Create a dedicated folder under `code/<company>/` and keep company-specific scraper logic there.
- Put reusable/common functionality in a shared/common folder instead of duplicating it.
- Keep generated company outputs under `jobs company wise/<company>/`.
- Never mix files from different companies; do not scatter company files across the repository.
- Reuse existing utilities whenever possible.

### Before final delivery
- Validate that all expected companies are present.
- Validate that the master CSV contains the complete combined dataset.
- Check for duplicate/unwanted files and remove temporary artifacts.
- Verify the ZIP structure before creating the final ZIP.
- Preserve the same organization for every future batch.

## Active tasks / next step
1. Review `output/17-9-26 second batch/`; await the next requested companies and never overwrite prior batches.
2. Optional: integrate batch results into dashboard tracking; mobile visual QA remains pending.

Architectural decisions are in [[Decisions]], history in [[Changelog]] and [[Sessions/2026-09-16]]. Obsidian MCP was unavailable; local project documentation is current. This directory is not a Git repository.
