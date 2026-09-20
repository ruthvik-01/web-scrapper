# Decisions

## 2026-09-15

1. **No universal-support claim.** Public APIs, schema data, rendered pages, and optional selectors cover multiple patterns; unsupported sites must be reported.
2. **Two calendar months, inclusive.** Use Europe/London dates and clamp month-end subtraction.
3. **Strict evidence for UK; explicit date fallback.** Do not infer country from employer headquarters or replace publication dates with edit/sitemap dates. The user later explicitly requested that missing source posting dates use the current run day, disclosed in `reason`.
4. **Location expansion without identity changes.** Clone shared source fields and vary only location/city/state; retain distinct vacancies even when titles match.
5. **Empty missing fields.** The user revised the initial NULL requirement: other missing CSV fields are now empty. Never fabricate salary, deadline, work arrangement, or location details.
6. **Audit zero results.** Add process/reason; include one non-job diagnostic row when no qualifying jobs are returned.
7. **Static sitemap for MWH Treatment.** Its public sitemap exposes all 99 live job URLs, avoiding unnecessary browser pagination. Sitemap `lastmod` is not a posting date.
8. **Respect access controls.** Robots-aware pacing, bounded crawling, and no login/CAPTCHA bypass or application submissions.
9. **Portable per-company folders.** Copy the complete implementation and pinned dependency files under each company's `code/` folder alongside its CSV and reports, rather than providing a wrapper that depends on files elsewhere.
10. **Selected daily batch, not a scheduled automation.** Run only the five user-approved companies. Track completions locally; Malmaison is already taken. No recurring schedule or friend-side coordination has been configured.
11. **Reconcile Eploy's visible locations.** Do not let a generic/stale structured office address override a more specific primary visible job location. Preserve source postcodes, verify missing UK-country information, and use verified postcode context to distinguish same-named places.
12. **Separate bases from facets and coverage.** Expand distinct bases and named sites, not county hierarchy or travel coverage. Retain unresolved site/area labels and leave precise city/state fields empty with notes instead of inventing them.
13. **Extract explicit role worktype only.** Role-specific hybrid/remote/on-site wording can fill an absent structured field; generic job-dependent benefits are not sufficient.
14. **Local dashboard, no framework build step.** Reuse the TypeScript scraper through a loopback-only Node server and isolated worker processes. Plain HTML/CSS/JS is sufficient for this focused workflow.
15. **Preserve previous exports.** Each dashboard execution writes to a new run folder; the latest result pointer is updated only after the worker returns a complete result. Failed runs keep prior output available.
16. **Local coordination only.** The dashboard can mark companies taken, but does not claim real-time synchronization with another computer.
17. **Preview before import.** External files can use different filenames, worksheets and headers. Users confirm a column mapping; imports append/merge rather than replace existing results.
18. **Bounded, data-only file parsing.** Use the official pinned SheetJS distribution for common Excel/CSV formats in a child process; inspect cached values and literal links, never run formulas/macros, and remove temporary originals.
19. **Explicit strategy modes, no universal guarantee.** Auto/API/Static/DOM are shared by the UI, CLI and portable code. Unsupported schemas and access controls remain visible failures, not false successes.

## 2026-09-16 — Job export contract
Export 15 job fields with ats=Custom; retain diagnostics only in reports. Completion colours exclude already-done companies and duplicate careers sites from the proposed next batch.

## 2026-09-16 — Reusable batches and evidence boundaries
Use the existing modular scraper rather than a replacement framework. Add manifest-driven sequential execution with checkpoints, per-company packages, combined CSV and a universal package. Keep no process/reason CSV columns. Use source PropertyValue.value for IDs. Exact employer-name scope prevents group-portal contamination. A mandatory, role-specific UK work-eligibility statement may establish recruitment country with quoted evidence; footer/HQ, driving licence alone and inferred gazetteer counties may not. Reprocessing cannot turn previously inferred county data into independent country proof. Unsupported sites require adapters rather than claimed universal coverage.

## 2026-09-16 — Posted-date and salary revisions (supersedes decision 3's fallback scope)
Posting-date rule: a present posted date is kept as published; if the posted date is missing but a deadline is given, the posted-date column stays empty (the run date is never substituted); only when both the posted date and the deadline are missing is the run's UK calendar day used as the posted date, disclosed in the report. Salary rule: a source salary shown as d.o.e (depending on experience) or an hourly rate (per hour) is moved into the job description and `salaryRange` is left empty; a salary is never invented. The salary field contains only the pay range with the pound sign — £ prefixed to each amount and a hyphen between bounds (e.g. £42500-£45000 or £24785); thousands separators and all other wording are stripped, and a source value with no numeric pay range (d.o.e and hourly rates are moved to the description instead) stays empty. The `location` column is always the combination of city + state + country with empty parts dropped and country UK.

## 2026-09-17 — zero-result export integrity
Zero qualifying jobs produce header-only CSVs and empty JSON arrays, never company-only diagnostic records. All expected companies remain represented by source/result folders and reports. This supersedes the previous empty-job-row convention; old deliveries are preserved.


## 2026-09-17 — second-batch evidence and mixed-board scope
Use source titlePrefixes with word/separator boundaries where shared boards lack reliable hiringOrganization; never use the configured fallback company identity to establish scope. Verify postcodes from explicitly labelled role location clauses, not contact/HQ text, and never override explicit foreign country. Hourly ph and DOE in the role salary clause require blank salaryRange; bonus/hour numbers are not range bounds. Keep Frasers' source hiring-brand names and organize all under its requested company folder. No Phase Eight role was advertised on the supplied board; do not substitute other retailers or silently switch to another careers source.


## 2026-09-17 — requested Wren substitution
Replace only Phase Eight in the second-batch manifest and package. Preserve validated Frasers/Restore files byte-for-byte instead of rescraping. Archive the prior delivery outside the final folder; rebuild with exactly the three current companies. Wren's 53 both-dates-missing fallbacks follow the existing disclosed rule, not a new date policy.


## 2026-09-17 — work arrangement versus geography
Hybrid, Office and Community in an Eploy All Locations field are working arrangements, not place names. Preserve the JobPosting's role-specific address geography instead of clearing it or geocoding those words. Do not use employer/footer addresses; actual geographic labels still take priority, and home-based/remote/nationwide roles retain the existing office-city suppression. Saved-source location repairs preserve exported non-location fields and original job selection.


## 2026-09-17 — authoritative combined-company scope
The combined 17-9-26 delivery includes exactly the user's eight completed companies, not the union of every attempted source-batch company. Exclude Royal British Legion, Stantec and David Clulow from the combined folders and manifest; preserve their historical source deliveries. Selected job data stays unchanged.


## 2026-09-17 — canonical display names without losing source identity
For the combined delivery, the company export field uses exactly the user's eight names. Source legal/employer/brand names are audit evidence, retained in source rows and report.exportCompanyIdentity. Optional exportCompanyName is applied after source-employer filtering; it never changes source rows used for checkpoint resumes or authorizes additional employer scope.



## 2026-09-18 — Comeet source semantics

Follow explicitly supplied ATS boards, but disclose mismatched website identities. Parse public embedded COMPANY_DATA/COMPANY_POSITIONS_DATA as JSON, never execute remote scripts. Keep position-location UID suffixes. Exclude explicitly fake demo and non-vacancy general-interest records with reasons. Never treat time_updated as postedDate; retain existing missing-date fallback. Preserve explicit workplace_type when the source location label conflicts and disclose the conflict.


## 2026-09-18 — Comeet merge and country-as-state correction

Include all 11 rows of the second table despite its label of ten; merge with the original 10 without refreshing or rewriting their saved data. Correct a state that literally repeats UK/GB/United Kingdom when country is already UK; leave region empty, record the correction, and never invent a county. Fallback dates do not establish two-month recency.


## 2026-09-18 — Third Comeet source quality

Keep Classiq identity mismatch explicit; follow supplied ATS board, not unrelated limousine website. Empty Curve/monday Comeet arrays establish only empty supplied boards. A source city equal to Remote/Hybrid/On-site is not a geographic place; clear it and allow only the separate source place label to supply city. Preserve explicit workplace and record normalization. Prior 21-company snapshots stay unchanged.


## 2026-09-18 — Explicit user override of Comeet date basis

For Comeet only, postedDate now means time_updated (last modification), converted to UK calendar day; use this for the existing two-month window. Missing/invalid updates are excluded, not replaced with run date. This supersedes the previous Comeet decision against using edit timestamps; it does not change other ATS date rules. Keep explicit workplace_type (Hybrid is not the same as Remote), use location.is_remote as boolean fallback and audit conflicts. Fill employmentType only from explicit employment fields; never infer Full-time from seniority, title or remote status. Keep 15 job columns; exact is_remote is retained in reports/source-field audit.

## 2026-09-18 — Eploy uploaded-sheet correction scope
Preserve all rows and all columns except employmentType/worktype. Prefer primary vacancy type over malformed weekly-hours strings; do not infer contract type from numeric hours. Worktype means workplace arrangement, not Agile methodology or mixed job responsibilities. Leave unsupported fields blank, retain evidence and limitations in the separate audit. No production parser changes in this sheet-only request.

## 2026-09-18 — Salary-format-only follow-up
Preserve source currency rather than replacing GBP with the example dollar symbol. Normalize numeric ranges and single amounts without adding bonus amounts or inventing endpoints; preserve removed period/bound/FTE/OTE qualifiers in Salary audit. This sheet revision does not annualize hourly/daily figures or change any other column.

## 2026-09-18 — FourCompany annual-only extraction
For this file, move only explicitly annual employment salary headers. Do not treat per-annum student stipends or programme funding as salaries. Preserve salary-basis qualifiers and alternate FTE/pro-rata explanations; do not merge them into a new range.

## 2026-09-18 — Merge scope and preservation
Combine latest corrected versions, not superseded uploads. Use union of columns with absent ats left blank, preserve all source rows including duplicates and untitled rows; do not infer fields or perform unrequested cleanup.

## 2026-09-18 — Company code collection
Use one canonical folder per company under root companies code, shared current framework, and corrected configurations. Preserve standalone implementations, changing only output isolation. Do not invent code for held identities or treat configuration-only launchers as successful extractions. Originals and superseded checkpoints remain in place.



## 2026-09-18 — Explicit 48-company scope
The user's enumerated selection supersedes all-company collection. Keep shared dependencies, retain known slug aliases, and archive excluded collection folders outside companies code without altering source batches. Future collection builds read scripts/company-code-selection.json.


## 2026-09-18 — Self-contained company packages
The user explicitly requires each of the 48 company folders to work independently when copied. This supersedes shared-framework deduplication for this delivery: each owns its implementation and lockfile. Preserve existing extraction rules, use editable company.json and timestamped outputs, and clearly separate verified portability from future live-site availability. Keep original deliveries unchanged.
