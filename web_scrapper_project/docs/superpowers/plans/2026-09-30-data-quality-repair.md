# Job Data Quality Repair Implementation Plan

> **For agentic workers:** Execute these tasks inline in the current checkout because the running Fieldwork dashboard uses this checkout. Steps use checkboxes for tracking.

**Goal:** Make the shared scraper produce valid UK job rows with real descriptions, job-specific locations, source dates, and annual salary only; regenerate the affected eight-company delivery.

**Architecture:** Keep the existing 15-column schema and `scrapeWebsite`/`runBatch` pipeline. Parse role detail from the vacancy container on current-vacancies.com, then validate all normalized rows before export. Run a fresh batch from the saved company URLs rather than reusing the ad hoc legacy scripts that copied company-level locations and the first pound amount from page bodies.

**Tech Stack:** TypeScript, Cheerio, Playwright, Node test runner.

**Spec:** User request in this thread, September 30, 2026.

## Global Constraints

- Preserve source outputs and existing dashboard history; write fresh outputs to a new audit folder.
- Keep the 15-column CSV schema and record excluded jobs with reasons.
- Only explicit job-specific UK evidence may qualify a location. Explicit foreign country excludes a job.
- Keep annual salary in `salaryRange`; move verified hourly/daily pay to description and leave uncertain pay empty.
- Do not trust a title-only/schema snippet when the detail page has full role content.

## Review Focus

- The advert page contains scripts and several unrelated company sections: only the vacancy section is a description.
- Structured JobPosting `description` is only the title: detail content must supersede it.
- A salary field contains a benefit amount or hourly pay: annual salary stays empty.
- A company-level city conflicts with job-specific location: job-level evidence wins or location remains unknown.
- The batch contains foreign jobs: exclude and report them before CSV output.

### Task 1: Trace and fix detail extraction

**Files:** `src/extract.ts`, `tests/extract.test.ts`.

- [x] Add a failing fixture for current-vacancies.com with a title-only JobPosting, real vacancy section, scripts, company bio, source posting date and pay.
- [x] Implement a narrowly matched vacancy-container extraction that preserves the real detail text and metadata, without page scripts or unrelated sections.
- [x] Verify the fixture and inspect fresh Cross Keys rows.

### Task 2: Add the final data gate

**Files:** `src/normalize.ts`, `tests/normalize.test.ts` or existing focused tests.

- [x] Add failing cases for missing ID, title-only or script-contaminated description, foreign country, invalid date, duplicate key, hourly pay and benefit amounts.
- [x] Validate/normalize the row before adding it to CSV output; keep unknown fields empty and explain exclusions in the report.
- [x] Verify multi-location jobs remain separate valid rows and the current schema is unchanged.

### Task 3: Run five affected sources and the eight-company batch

**Files:** saved manifest under `docs/` or `scripts/`, fresh ignored output under `output/_audit-after/`.

- [x] Re-run Dachser, Cross Keys Homes, Crone Corkill, Currie & Brown, and Curtis Fox from their saved public careers URLs; investigate failures from reports.
- [x] Re-run all eight companies from the 70-row delivery with the shared pipeline.
- [x] Compare company counts, IDs, country, descriptions, dates, pay, locations and duplicate keys against the original 70 rows.
- [x] Record valid/invalid totals and final CSV path; do not overwrite the original delivery.
