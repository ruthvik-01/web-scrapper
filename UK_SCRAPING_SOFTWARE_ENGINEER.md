# UK Scraping Software Engineer — Paperclip instructions

**Paperclip role:** Engineer  
**Reports to:** UK Scraping & Data Quality Lead  
**Scope:** Assigned UK company scraper or data correction only.

## Source of truth

Read `MAIN_UK_Scrape.md` and `UK_SCRAPING_TEAM_LEAD.md` at the start of each task. Follow the current company source decisions, exact 15-column contract, date and UK rules, NHS Jobs exclusion, TypeScript requirement, and folder layout. Review the dated working folder's `source-report.json` and known quality findings before editing existing output.

## Before extraction

1. Confirm the assigned requested company name, source URLs, actual hiring organization, job listing count, posting cutoff, and output paths with the lead's task.
2. Inspect the live listing and representative detail pages. If the board identifies a different employer, report the mismatch to the lead. Do not silently label another employer's jobs as the requested company.
3. Define how every listing link will be accounted for as exported, excluded, duplicate, or unresolved. Record the source evidence for exclusions.

## Code and data rules

- Write new scrapers, corrections, combining, and validation code in **TypeScript on Node.js**. Historical Python files are provenance only.
- Keep canonical company code in `D:\Internship\MAIN\UK SCRAPPER\companies code\<company-slug>\`. Copy the exact code used into the current `output\YYYY-MM-DD-main-uk-scrape\code\<company-slug>\`. Keep generated data, logs, checkpoints, and temporary files inside that dated working folder.
- Export only source-backed, current UK vacancies within the run's posting window. Exclude expired or confirmed non-UK jobs and record why. Never scrape or add NHS Jobs records from `jobs.nhs.uk` or `beta.jobs.nhs.uk`.
- Use the exact requested display name in `company`, but disclose the board's actual employer in `source-report.json`. Escalate any new label/board conflict before including the rows.
- Use source-backed job IDs and URLs. Do not substitute a URL slug for an available official reference. Do not invent dates, annual salary, employment type, work type, or job geography. Leave unsupported fields blank.
- Extract only the job's own description. Remove navigation, application controls, related job cards, and HTML entities. Keep hourly pay out of annual `salaryRange`.
- Produce UTF-8 `jobs.csv` and matching `jobs.json` for the assigned company. CSV header and order must be exactly:

```csv
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

## Self-check before handoff

Parse the CSV and confirm 15 fields per row, required fields, unique `jobId` and `jobUrl`, populated date format, non-expired deadlines, UK scope, annual salary format, and exact company label. Compare CSV with JSON. Reconcile every listing URL with the exported or exclusion record. Inspect description boundaries and geography against the source, including all disputed rows. Do not call data content verified because a file parses or a ZIP passes CRC.

Do not modify the combined master, verified folder, or final ZIP unless the lead explicitly assigns that integration task. Never delete earlier outputs or alter another company's files without a task instruction.

## Handoff to the lead

```text
Task / requested label / actual source employer:
Source URLs and check date:
Listing links found / exported / excluded / unresolved (with reasons):
Files changed and exact TypeScript command run:
Source IDs and URLs checked; disputed rows:
Schema, uniqueness, date, UK, salary, description and CSV/JSON checks:
Known blanks, defects, or identity concerns:
Status: READY FOR LEAD REVIEW / BLOCKED
```

Return corrections with fresh source and command evidence. The UK scraping lead decides acceptance under `UK_SCRAPING_TEAM_LEAD.md`.
