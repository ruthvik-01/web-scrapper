# MAIN UK Scrape — rules, sources, verification, and current delivery

Last checked: **24 September 2026**. This document records the rules and the actual results established during this conversation. The latest delivery is `output/2026-09-24-verified/`. The working copy is `output/2026-09-24-main-uk-scrape/`. Inputs needed for reconstruction were preserved inside today’s working folder. **All 124 older output directories were removed; only these two date-prefixed output directories remain.** “Verified” means the structural and packaging checks listed in `verification.json` passed. The content issues in “Data quality findings” remain open.

The `output/` root has no loose files. Nineteen older root files were grouped under the working folder’s `archive/legacy-output/`: `reports/` (historical audit Markdown), `packages/` (older ZIPs), `data/` (historical tracking CSV), and `logs/`. This archive is for reference, **not part of the current 536-row delivery**; it is intentionally absent from `2026-09-24-verified/` and `final.zip`. References in project documentation were updated to its new paths.

## Latest delivery and folder rules

**Start every new combined output folder name with the current date in `YYYY-MM-DD` form.** First build the working folder, for example `2026-09-24-main-uk-scrape`. After verification passes, create a **new** folder named `YYYY-MM-DD-verified`, for example `2026-09-24-verified`, and copy the verified delivery into it. Record the exact checks and any remaining limitations in `verification.json`; never imply content is fully clean when only structure and packaging were verified. A later correction requires fresh verification and a refreshed verified folder. Keep each company’s results in its own folder; never mix one employer’s jobs into another employer’s folder. Put the combined master CSV at the delivery root. Preserve the same layout in `final.zip`:

**Do the active scrape within the dated working folder, with one explicit code-library exception.** Keep every company’s canonical scraper code under `D:\Internship\MAIN\UK SCRAPPER\companies code\<company-slug>\`, individually by company. Copy the exact code used for a run into the dated working folder’s `code/<company-slug>/` (shared utilities under `code/universal_scraper/`). Keep all generated jobs, reports, checkpoints, logs, source inputs needed for reconstruction, and temporary work inside that dated working folder and run scripts with it as their output root. Do not create separate company output folders or other new outer folders in the workspace root or in `output/`. Remove temporary files from the deliverable before verification. The **only** sibling output folder to create is the separately requested date-prefixed `-verified` copy after checks pass. Historical project scripts may remain where they already are; do not retain old output directories once required inputs have been preserved. The new `companies code/` rule is the user-requested exception to the previous one-folder rule.

**Required language: TypeScript.** Write all new company scrapers, shared extraction/normalization code, batch combining, validation, and packaging automation in TypeScript (`.ts`) running on Node.js. Keep the TypeScript source, configuration, dependencies, and any task-relevant tests in the appropriate company or shared code folder; copy the exact run version into the dated working folder. Do **not** write new Python scrapers, converters, or verification scripts for this workflow. The Python files currently present are historical source snapshots from the September 24 extraction. They document how the existing 530-row output was made, but they do not satisfy this TypeScript requirement. Convert or replace a company’s Python source with TypeScript before its next scrape or correction; do not describe the current Python snapshots as TypeScript implementations.

**24 September 2026 update:** the company-name correction and the delivery verification/repackage are implemented in TypeScript — `web_scrapper_project/scripts/relabel-company-labels.ts` and `web_scrapper_project/scripts/verify-package-24-9-26.ts` — and both are snapshotted into the dated working folder's `code/universal_scraper/` and the ZIP.

```text
output/2026-09-24-verified/
├── companies.csv                     # combined 15-column master, 536 rows
├── companies.json                    # same combined rows
├── source-report.json                # counts, exclusions, source decisions
├── README.md
├── data-quality-audit.md             # open quality findings
├── verification.json                 # passed checks and their limits
├── final.zip
├── source-cache/                     # preserved source inputs for reconstruction; outside ZIP
├── jobs company wise/
│   ├── p-ducker-systems-ltd/
│   ├── partnering-health-ltd/
│   ├── pgs-ltd/
│   ├── pinpoint-group-recruitment-ltd/
│   ├── pinpoint-resourcing-ltd/
│   ├── ppghealthinjusticeweb/
│   ├── prdc-dental/
│   ├── prince-of-wales-medical-centre/
│   ├── rodericks-dental-partners/
│   └── operations-resources-limited/
│       # each company folder has jobs.csv and jobs.json
└── code/
    ├── universal_scraper/                # shared conversion, PDS/PHL and Reed source scripts
    ├── p-ducker-systems-ltd/
    ├── partnering-health-ltd/
    ├── pgs-ltd/
    ├── pinpoint-group-recruitment-ltd/
    ├── pinpoint-resourcing-ltd/
    ├── ppghealthinjusticeweb/
    ├── prdc-dental/                      # metadata only; unresolved
    ├── prince-of-wales-medical-centre/  # metadata only; unresolved
    ├── rodericks-dental-partners/
    └── operations-resources-limited/
```

The company folders and `code/` above exist both physically in the latest delivery and inside `final.zip`. The ZIP is built from the dated working folder; `verification.json` is beside it and is not inside it. The ZIP also stores the combined JSON, source report, and README under `jobs company wise/`. The canonical code library now has ten neat folders under `companies code/`: eight contain the historical Python source script used and `company.json`; the two unresolved companies contain only `company.json` and **no claimed scraper**. The dated `code/<company-slug>/` folders are copies of those company folders. Shared extraction scripts are copied into each relevant company folder so the code used can be found by company; the same shared scripts also appear once under `code/universal_scraper/` for provenance. Some copied legacy scripts still use repository-relative source/output paths or process more than one company; they are extraction evidence, **not** a claim that every folder is independently runnable or TypeScript-based. Future TypeScript scripts must take output paths under the dated working folder and should be runnable for the named company alone. Do not put temporary files, caches, logs, or `node_modules` in the ZIP.

The original **10-column source extracts**, PPG raw export/location audit, and Rodericks fallback input were preserved under `source-cache/` before older output directories were deleted. They are inputs, not the current 15-column deliverable. The same cache is copied to the verified folder for future reconstruction, but is kept outside the final ZIP’s clean delivery structure.

## Required 15-column contract

The CSV header and order are exactly:

```csv
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

Use UTF-8 CSV, with proper quoting for commas and line breaks, and matching JSON keys. One row represents one live, source-backed vacancy. Keep `jobId` and `jobUrl` nonempty and unique. Preserve the employer name shown by the actual job source. `postedDate` and `jdDeadline` use `YYYY-MM-DD`; leave them blank when the source does not establish a date. Do not substitute the scrape date. `salaryRange` is an explicit annual amount formatted `£N` or `£N-£N`; do not put hourly rates in that field. `employmentType` is the contract type, and `worktype` is the work arrangement only when supported by the role. `location`, `city`, and `state` must describe the **job**, not the company headquarters; leave unknown parts blank. `country` is `United Kingdom` for a verified UK role. Current exports use `Custom` in `ats`, matching the supplied input convention; this label is not proof of the technical platform behind a board.

### Selection and verification rules

1. **Employer identity first.** Verify the job page’s hiring organization or unmistakable employer branding. A supplied careers link can belong to another company. Never relabel another employer’s jobs to match the spreadsheet row.

   **Exception, 24 September 2026 (requester instruction, takes precedence for this delivery):** the `company` column must use the requester's supplied company-name list. Three labels were rewritten accordingly — Rodericks Dental Partners → `PRDC Dental`, Operations Resources Limited → `Operations Resources`, Pinpoint Resourcing Ltd → `Pinpoint Resourcing ltd` — for 359 rows in 9 files. Under this exception the underlying board identity is disclosed in `README.md` and `source-report.json` instead of in the label. Do not extend the exception to another company without the same explicit instruction.
2. **Current roles only.** For this 24 September 2026 run, the two-month posting cutoff is **24 July 2026**. Exclude an older dated posting. A job page that is still linked but has `validThrough` before 24 September 2026 is expired and must be excluded. A missing date stays blank and must be disclosed; do not invent its year.
3. **UK role evidence.** Use a role-specific UK address, location, postcode, or explicit right-to-work requirement when appropriate. A UK company footer, headquarters, UK driving licence alone, or a matching place name alone does not prove that a particular job is UK-based. Exclude roles confirmed outside the UK; leave uncertain fields blank.
4. **Salary and other fields.** Copy only values that the vacancy supports. Separate annual salary from hourly pay, and never infer worktype or contract type from company-level metadata. Clean HTML entities and remove page navigation, application controls, and other job cards from descriptions.
5. **Job IDs.** Prefer an explicit source reference or stable source record ID. A URL slug is a fallback, not an independently verified job ID. Six PDS/PHL slug IDs were corrected to WordPress numeric page/post IDs. Reed’s Art Sales Consultant `57351409` was kept because the page shows it as both the visible reference and `JobPosting.identifier.value`. Rodericks currently uses numeric URL IDs even though its detail pages also expose separate `Job Reference` values; decide which convention is required before changing them.
6. **No NHS Jobs scraping.** Per the user’s rule in this conversation, do **not** scrape jobs from NHS Jobs (`jobs.nhs.uk`, including `beta.jobs.nhs.uk`) or add NHS Jobs records to this deliverable. If a company only points to NHS Jobs, mark it skipped or unresolved and explain why. This instruction takes precedence over older project code and documentation that technically support NHS Jobs extraction. No current 530-row job URL is on an NHS Jobs host.
7. **Per-company files, then one combined folder.** Write each company’s `jobs.csv` and `jobs.json` in its own slug folder, including header-only CSV and empty JSON for an unresolved company. Combine only verified rows into `companies.csv` and `companies.json`, retain exclusions in `source-report.json`, then build `final.zip` with the same company separation.
8. **Validate before delivery.** Check the exact header and row width, required fields, source employer, UK scope, posting/closing dates, annual salary format, IDs and URLs, duplicates, company counts, per-company versus master equality, JSON equality, ZIP file names, and ZIP CRC. A technically valid CSV is not necessarily clean content; inspect descriptions and place names too.

## Companies and source decisions

These are the ten company folders in the latest combined delivery. Eight employers have exported jobs; two requested names remain unresolved. Every company folder is under `jobs company wise/` in the latest delivery and ZIP.

| Folder / employer | Source used | Exported | Verification and exclusion notes |
| --- | --- | ---: | --- |
| `p-ducker-systems-ltd` — P Ducker Systems Ltd | https://pdslimited.co.uk/careers/vacancies/ | 1 | Commercial & Contract Manager explicitly states a Derby office base. Two other roles required UK/Republic of Ireland travel but did not confirm a UK base and were excluded. No source posting/deadline date. WordPress page ID `11455` replaced its URL-slug ID. |
| `partnering-health-ltd` — Partnering Health Ltd | https://phlgroup.co.uk/careers-home/ | 5 | The supplied `/careers` path was stale; the employer page linked seven role pages. One Guernsey role and one posting older than the two-month window were excluded. The five exported roles have role-specific UK places. WordPress post IDs `12237`, `12470`, `12339`, `12408`, and `12547` replaced URL slugs. Dates existed on original pages but were lost in the earlier 10-column conversion and are blank in the master. |
| `pgs-ltd` — PGS LTD | https://www.reed.co.uk/jobs/pgs-ltd-63908/p63908 | 5 | Six linked Reed pages were checked for `JobPosting` employer, country, and posting age; one was excluded. Art Sales Consultant ID `57351409` matches Reed’s visible reference and structured identifier. Current master dates are blank because the intermediate export did not retain them. |
| `pinpoint-group-recruitment-ltd` — Pinpoint Group Recruitment Ltd | https://www.pinpointgrp.co.uk/vacancies | 6 | Eight linked pages; two March-labelled pages excluded. The displayed month/day labels omit the year, so dates are blank. Four roles lack a precise place and have blank `location`. The supplied homepage `pin-point.co.uk` appears to be a separately branded recruitment firm; only the named `pinpointgrp.co.uk` vacancy board was used. |
| `pinpoint-resourcing-ltd` — Pinpoint Resourcing ltd | https://pinpointresourcing.co.uk/latest-vacancies/ | 10 | Ten linked Reed job pages, with employer/country/posting checks and no exclusions. The requested label spells `ltd` in lowercase. Current master dates are blank because the intermediate export did not retain them. This is separate from Pinpoint Group Recruitment. |
| `ppghealthinjusticeweb` — PPG Health In Justice / Practice Plus Group | https://ppghealthinjusticeweb.eploy.net/vacancies/vacancy-search-results.aspx and linked `apply.practiceplushij.com` detail pages | 154 | Source-audited 10-column export was converted to the master. A prior generic 156-row run used unverified scrape-date posting fallbacks; those dates were **not** carried forward. One duplicate and one UK-base-unconfirmed role were excluded in the source-specific export. Many city/state fields remain blank rather than guessed. |
| `prdc-dental` — PRDC Dental / PR Dental Recruitment | https://prdentalrecruitment.co.uk/jobs/ | 0 own rows, unresolved | The supplied `careers.rodericksdentalpartners.co.uk/jobs/search` board belongs to **Rodericks Dental Partners**, not PR Dental Recruitment, and the PR Dental site's jobs page is JavaScript-rendered and was not verified here. This folder is therefore header-only; the requested label `PRDC Dental` is carried by the 346 rows in the `rodericks-dental-partners` folder (see that row and rule 1's exception). The 0-row file is not a claim that PRDC Dental has no vacancies. |
| `prince-of-wales-medical-centre` — Prince of Wales Medical Centre | https://careers.pwh.org.uk/ (the requested https://www.pwh.org.uk/ returns HTTP 403) | 6 | Re-scraped live on the requester's instruction. The board brands itself **The Prince of Wales Hospice**, Pontefract, WF8 4BG, so keep in mind that the label comes from the requester's list, not from the board. Eight live adverts were listed; six exported (Casual Event Catering Staff, Fundraising Administrator, Lymphoedema Practitioner, Lymphoedema Assistant Practitioner, Catering Business Development Lead, Estates and Facilities Manager). Excluded: the two volunteer adverts posted 2026-03-16 and 2026-01-28, before the two-month cutoff. Advert creation dates supply `postedDate`, structured expiry supplies `jdDeadline`, annual figures only in `salaryRange` (the £12.71-per-hour casual role keeps its rate in the description), and `worktype` is blank because the adverts state no arrangement. |
| `rodericks-dental-partners` — board employer Rodericks Dental Partners, exported under the requested label `PRDC Dental` | https://careers.rodericksdentalpartners.co.uk/jobs/search | 346 | Added after retrying the supplied board. Seventy-one listing pages contained 704 unique links; 358 showed posting dates before 24 July 2026, and 346 were exported, including 12 with unavailable structured posting dates. All 704 detail URLs were accounted for after retry. The board identity is disclosed here, in `README.md` and in `source-report.json`, because rule 1's exception moved the employer name into the label. Content-quality corrections are still required below. |
| `operations-resources-limited` — Operations Resources | https://haystackapp.io/companies/operations-resources-limited | 3 | Haystack displayed five jobs with the correct hiring organization. Two were excluded because their structured closing dates were 29 August and 21 September 2026, before the check date. Three current UK jobs were added, with source dates and locations. |

The original supplied company city/region fields were company metadata; they were not copied into a job’s city/state without role-level evidence.

## What was verified in this conversation

- The master CSV has **536 rows**, **15 columns**, and rows under the **nine requested company labels**: P Ducker Systems Ltd 1, Partnering Health Ltd 5, PGS LTD 5, Pinpoint Group Recruitment Ltd 6, Pinpoint Resourcing ltd 10, PPG Health In Justice 154, PRDC Dental 346 (extracted from the Rodericks Dental Partners board), Prince of Wales Medical Centre 6 (from the careers.pwh.org.uk board), Operations Resources 3. `prdc-dental` is the only header-only folder, because its label's rows sit in the `rodericks-dental-partners` folder.
- The master has no malformed-width rows, duplicate full rows, duplicate job URLs, duplicate job IDs, or duplicate ID/URL pairs. Populated dates have valid format and are not future posting dates or expired deadlines as of 24 September 2026. Populated annual salary strings fit the required format and have no reversed ranges. All populated `country` values are `United Kingdom`.
- `companies.json` equals the master CSV rows. Each per-company CSV row in the ZIP appears in the master. The ZIP master CSV equals the on-disk master; ZIP CRC validation passed. Ten physical company-wise folders were materialized from the verified ZIP into the latest combined output folder.
- PDS’s `11455` came from the official page’s WordPress `page-id`; the five PHL IDs came from official `postid` classes. Reed’s `57351409` was checked against the Art Sales Consultant page’s visible reference and JSON-LD identifier.
- Rodericks’ live board and detail pages identified Rodericks Dental Partners. The listing/detail pass found 704 unique links, 358 older postings, and 346 exported jobs. The six initial URL-slug IDs in the earlier combined CSV were corrected in the latest master and company-wise files.
- Operations Resources’ five Haystack links had the correct `hiringOrganization`. Structured `validThrough` values excluded two expired listings, leaving three current jobs.
- Previous output directories were removed after the source inputs needed for this delivery were copied into `source-cache/`. Use the two date-prefixed folders named at the top of this file; the verified copy is the delivery, and the working copy preserves its source cache and code snapshots.

## Data quality findings still open

The audit in `output/2026-09-24-verified/data-quality-audit.md` is read-only. It did **not** change the CSV or ZIP. The latest master is structurally valid but should **not** be described as fully cleaned:

| Finding | Affected rows |
| --- | ---: |
| Rodericks descriptions contain page controls and related job cards rather than only the vacancy description | 346 |
| Rodericks `employmentType` blank, although each source page text contains `Contract Type` | 346 |
| Rodericks `city` looks like an address, postcode, or malformed place | 176 |
| Rodericks title/location contains an HTML entity such as `&amp;` | 12 |
| Blank `postedDate` / `jdDeadline` | 193 / 193 |
| Blank `salaryRange` / `employmentType` / `worktype` | 385 / 353 / 527 |
| Blank `location` / `city` / `state` | 4 / 107 / 506 |

Some blanks are the correct representation of unavailable evidence; others can be recovered from source pages. For example, all 12 Rodericks records with blank structured dates have visible `Posted on` and `Closing Date` text, and all 346 Rodericks pages show a `Job Reference` and `Contract Type`. Rodericks job `10607` is a concrete example: its description includes other Dental Nurse listings after the actual role. Correct source extraction and revalidate before calling the content clean. Do not fill fields by assumption.

## Reproduction and final checks

- Canonical code for each company is under `companies code/<company-slug>/` and is copied into the dated working folder’s `code/<company-slug>/` for the delivery ZIP. The current copied scripts are historical Python, not the required future implementation language. Historical root script copies still exist, but the company-folder copies point to `output/2026-09-24-main-uk-scrape/` and its `source-cache/`. The Rodericks and Operations scripts fetch live pages; output counts can change. The conversion script consumes the preserved 10-column files and fetches Pinpoint Group live. For future work, replace the relevant Python snapshot with TypeScript in that company’s canonical folder, snapshot its exact code into the dated working folder, and keep all run output there.
- Inspect `source-report.json` for per-company counts and exclusions, and `data-quality-audit.md` for unresolved field-level issues. The `prdc-dental` folder must remain empty until PRDC Dental's **own** employer source is verified; the Prince of Wales folder now holds its six exported rows.
- Recheck the 15-column header, per-company count sum, employer/source match, current dates, annual salaries, description boundaries, geography, ID uniqueness, CSV/JSON equality, ZIP file list, and ZIP CRC after any correction. Keep newly scraped NHS Jobs records out of the dataset.

- **24 September 2026 Prince of Wales addition:** the requester asked for the Prince of Wales board to be rescraped and added. `web_scrapper_project/scripts/scrape-prince-of-wales-24-9-26.ts` reads `https://careers.pwh.org.uk/` through the board's own public endpoint chain (`api/liveadverts/filter/-in-`, then `api/liveadverts/{AdvertId}` for the full advert body — the calls the board's AngularJS controller makes), applies the two-month window and UK/expiry checks, and appends the rows to the master without re-serialising existing rows. Result: 8 live adverts listed, **6 exported** (the two volunteer adverts posted 2026-03-16 and 2026-01-28 fall outside the window), taking the delivery to **536 rows**. The board's own branding is The Prince of Wales Hospice (Pontefract, WF8 4BG) and the requested `www.pwh.org.uk` returns HTTP 403, so the rows carry the requested label while README.md and source-report.json disclose the board identity — the same treatment as the `PRDC Dental` label. The tool aborts on a rerun if rows for that label already exist. Delivery re-verified and repackaged: 50 ZIP entries, 63 copied files hash-equal.

- **24 September 2026 company-name correction:** the requester supplied the canonical company list and required the `company` column to match it. The rewrite was applied with `web_scrapper_project/scripts/relabel-company-labels.ts` (359 rows in 9 files; the dry run reported exactly 346 / 3 / 10 replacements per master file before anything was written, and the rewrite is field-accurate so no description or other field changed). The delivery was then re-checked and repackaged with `web_scrapper_project/scripts/verify-package-24-9-26.ts`. Both TypeScript scripts are snapshotted into the working folder's `code/universal_scraper/` and inside `final.zip` (48 entries, up from 46). `2026-09-24-verified/` was refreshed from the working folder and all 61 copied files hash equal. The ZIP previously stored root copies of the README and source report under `jobs company wise/`; those two files are now identical to the root copies by design.

This document is the runbook and evidence snapshot for this conversation. It records what was checked and what remains unresolved; it is not a claim that every source page or every field is perfect.
