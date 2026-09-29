# HCMDirect Job Data — Quality Validation Spec

## 1. Objective

Perform a **strict, factual, company-by-company verification** of scraped HCMDirect job data. Every job record's every field is checked against its actual source job-detail page — not against the scraper's own output, prior validation reports, or assumptions — and corrected where wrong.

This spec governs the *validation* stage that runs after `scraper.ts` produces `{company}_jobs.json`. It does not re-run discovery or scraping logic — it audits what was already scraped.

**Ground rule:** schema conformance (15 fields present) is not accuracy. A record can be schema-valid and still factually wrong. This process checks factual correctness, field by field, against the live source page.

---

## 2. Processing Order

Companies are verified **one at a time, sequentially** — never in parallel, never batched. A company is not started until the previous company has completed Steps 3–9 and produced its `COMPANY VERIFIED` output.

Default sequence (adjust to match the actual company list being validated):

1. Eddy County
2. Team Velocity
3. Stake Center Locating
4. Carriage Services
5. FranklinCovey
6. Now Optics
7. UNM Medical Group
8. University of New Mexico Health System
9. Atlas Technical Consultants
10. The Raley's Companies
11. Data Device Corporation
12. Sevan Multi-Site Solutions
13. Allevio Care

If a company has no `{company}_jobs.json` file, record that explicitly (with the reason, if known — e.g. discovery returned 0, or the run errored) and move to the next company. Do not fabricate a placeholder file.

---

## 3. Per-Company Workflow

### Step 1 — Load the company's file
Open `<Company>_jobs.json`. Record the total job count and list every `jobId` + `jobUrl` pair before verifying anything.

### Step 2 — Verify every job against its live source page
Open each job's `jobUrl` and inspect the actual detail page. The detail page is the sole source of truth. Do **not** trust:
- the existing JSON
- the scraper's own output
- prior validation reports
- ATS-pattern assumptions
- listing-page values, when the detail page provides a value

### Step 3 — Verify every field
Check all 15 fields per job:

| Field | Verification rule |
|---|---|
| `jobId` | Confirm it belongs to this exact job — not another job on the same listing, not fabricated. |
| `title` | Must match the detail page exactly — flag missing words, extra text, truncation. |
| `description` | Must belong to this job, be complete, and contain only job-description content — no nav menus, apply/share/cookie boilerplate, or duplicated sections. Whitespace/HTML-artifact cleanup is allowed; factual content must not change. |
| `jobUrl` | Must open the exact job represented by the record. |
| `postedDate` | Verify directly from the detail page. Never guess. Never convert a relative date ("12 days ago") unless the page gives enough information to do so reliably. |
| `jdDeadline` | Verify directly from the source. Values like "Open Until Filled", "Immediate Start", "TBD", "N/A" must stay as `null` per the schema — never converted into a fake date. |
| `company` | Confirm the job actually belongs to the company being processed. |
| `salaryRange` | Verify directly against the page. Never estimate, infer, copy from another job, or convert "Competitive" into a numeric range. |
| `employmentType` | Verify against the source; no inference. |
| `worktype` | Only set Remote/Hybrid/Onsite if the source explicitly states it — never inferred from location alone. |
| `location` | Verify against the source page. |
| `city` / `state` / `country` | Set only when explicitly supported by the source — never inferred from HQ address, ZIP code, or assumption. |
| `ats` | Must equal exactly `"Custom"`. |

### Step 4 — Classify each field
For every field, assign one status:

```
CORRECT
INCORRECT
MISSING
FABRICATED
UNVERIFIABLE
```

Log every non-`CORRECT` field:

```
Job ID:
Field:
Old JSON value:
Source value:
Action:
Reason:
```

### Step 5 — Correct the record
- Preserve correct values as-is.
- Replace incorrect values with the verified source value.
- Remove fabricated values entirely.
- Never guess a missing value — use `null` where the schema allows it.
- Keep exactly the 15-field schema — no added or removed fields.

### Step 6 — Re-verify after correction
Re-check the corrected record against the source page. A job is not complete until the corrected record matches the source exactly.

---

## 4. Company-Level Audit Report

After every job in a company is verified and corrected, report:

```
Company:
Jobs in JSON:
Jobs verified:
Jobs corrected:
Jobs already correct:
Jobs requiring manual review:
Critical issues:
High issues:
Medium issues:
Low issues:
```

And separately:

```
Duplicate job IDs:
Duplicate job URLs:
Cross-job contamination:
Fabricated values found:
Missing source values:
```

---

## 5. Output

- Save the corrected file as `<Company>_jobs_verified.json`.
- **Never overwrite the original** `<Company>_jobs.json` — it stays untouched as the pre-verification record.
- Only after a company's corrected file is saved, emit:

```
========================================
COMPANY VERIFIED
========================================

Company: <name>

Jobs checked: X
Jobs correct: X
Jobs corrected: X
Jobs requiring review: X

Corrections:
1. jobId: ...
   field: ...
   old: ...
   new: ...
   reason: ...

Output:
<Company>_jobs_verified.json
```

Then proceed to the next company in sequence.

---

## 6. Non-Negotiable Rules

- **Source authority**: the live job-detail page is the only source of truth — never the JSON, never a prior report.
- **No guessing**: if the source doesn't explicitly support a value, it stays `null`/unavailable per schema. Guessing is treated as fabrication.
- **No silent changes**: every corrected field must appear in the correction log. An undocumented change is not a valid correction.
- **No bulk assumptions**: never assume all jobs for one company share the same value (e.g. same location or salary) — every job is checked individually, even within the same company.
- **Schema conformance ≠ correctness**: a record having all 15 fields populated does not mean the values are right. The goal of this process is factual accuracy, not structural completeness.

---

## 7. Definition of Done

The dataset is not production-ready until:

1. Every company in the list has completed Steps 1–6.
2. Every company has a `COMPANY VERIFIED` report with a correction log (even if the log is empty).
3. Every company has a `<Company>_jobs_verified.json` file, separate from the original.
4. No company was skipped, batched with another, or partially verified.

**Every job → every field → checked against the actual source → corrected if necessary → revalidated.** Nothing short of that satisfies this spec.
