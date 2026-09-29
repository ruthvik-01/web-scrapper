You are cleaning existing `<Company>_jobs.json` files. Your task is FILTERING plus narrowly-scoped ARTIFACT CLEANUP — you are not allowed to correct, infer, guess, or fabricate any factual value. For each job record, either it fully conforms to the rules below after artifact cleanup, or it gets removed. There is no in-between.

## Interface — enforce exactly, no deviation

```ts
interface Job {
  jobId: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate: string;
  jdDeadline: string;
  company: string;
  salaryRange: string;
  employmentType: string;
  worktype: string;
  location: string;
  city: string;
  state: string;
  country: string;
  ats: string; // must equal exactly "Custom"
}
```

- Every output record must have EXACTLY these 15 keys — no more, no fewer, no renamed keys, no nested objects.
- Every value must be a string type.
- No extra internal/debug fields — strip anything not in the interface.
- `ats` must literally equal `"Custom"`. If the source has the real ATS name (e.g. `"HRMDirect"`), normalize it to `"Custom"` — this is the one field allowed to be overwritten as a constant rather than filtered on.

## STEP 0 — Remove listing/search pages mixed in as fake "jobs"

Remove a record if ANY of these are true:

1. `jobId` equals `jobUrl`, or `jobId` is itself a URL.
2. `jobUrl` points to a listing/search page — contains `job-openings.php`, `?sort=`, `?search=true`, or similar list/filter query params, rather than a single-job path like `job-opening.php?req=<id>`.
3. `title` is a generic site/page title with no role name — e.g. `"Careers At <Company>, <State>"` on its own, `"Job Openings"`, `"Current Openings"`.
4. `description` is generic site boilerplate only, with no role-specific content at all.
5. The same `title` + `description` + `salaryRange` repeats verbatim across records with only the `jobUrl` query string differing — these are the same listing page scraped multiple times, not distinct jobs.

If a record trips any of these, remove it immediately without evaluating it further.

## STEP 1 — Strip embedded site boilerplate from `title` and `description`

Real job records commonly still carry the site's header/footer chrome baked directly into the text, because it wraps every job page on the same ATS. This must be stripped from the surviving content — it is noise, not job data, and its presence does not by itself make the record fake (unlike Step 0).

**From `title`:** remove any trailing site/location suffix appended after the actual role name, and remove any pay-rate text embedded in the title. The title must end up as just the role name.
- Before: `"APPRAISER I STARTING PAY 2206 2435 PER HOUR DOE, Careers At Eddy County New Mexico"`
- After: `"APPRAISER I"`
- Patterns to strip from titles: `", Careers At <Company>...`" suffixes, `"STARTING PAY ..."` / `"PER HOUR DOE"` fragments, digit runs that are clearly a mangled pay rate.

**From `description`:** remove these when they appear as standalone boilerplate wrapping the real content (do not remove them if they happen to appear as part of a genuine sentence — check context):
- Repeated site-name header lines: `"Career Opportunities with <Company>"`, `"Careers At <Company>, <State>"`, `"Current job opportunities are posted here as they become available."`, `"Back To Openings"`
- Bare structural labels with no content value on their own: `"START YOUR APPLICATION"`, `"BRIEF DESCRIPTION"` (the label itself, not the content that follows it), `"Department"` / `"Location"` used as bare field labels immediately followed by their value (keep the value, e.g. `"Carlsbad, NM"`, if it's not already captured in `location`/`city`/`state`; drop the bare label word)
- Footer boilerplate: `"Visit Our Home Page"`, `"Applicant Tracking System Powered by."`, trailing copyright/year lines with no job content
- `"TO VIEW FULL JOB DESCRIPTION, ... CLICK LINK BELOW"` type phrases with no other content around them
- Duplicated phrases appearing twice in immediate succession — keep one occurrence only

This is artifact cleanup, not rewriting: you are deleting recognizable boilerplate strings, not paraphrasing or summarizing the substantive duty/requirement text that remains.

## STEP 2 — Fix extraction artifacts (formatting only, never factual changes)

The scraper's character-stripping step has visibly corrupted some content. Repair these mechanical artifacts without changing any actual value:

- **Broken decimal points**: a digit, a period, a space, then more digits (e.g. `"22. 06"`) is a mangled decimal — collapse to `"22.06"`. Apply this throughout `salaryRange`, `title`, and `description`.
- **Mangled URLs**: a URL that has lost its `://` and had its `/` and `.` characters partially stripped or spaced out (e.g. `"https//acrobat. adobe. com/id/urnaaidscVA6C2d65ea4ad..."`) is no longer a usable link and cannot be reliably reconstructed. Do not attempt to guess the original URL — remove the broken URL fragment and its immediately surrounding label text (e.g. `"WAIVER - Please print, complete, and upload the waiver notarized below."` referencing a now-broken link) from the description, since a dangling reference to an unreachable link is not useful job content.
- **Missing punctuation from over-stripped special characters**: if removal of special characters elsewhere clearly broke apostrophes in real words (e.g. `"Veterans Form"` where `"Veteran's"` lost its apostrophe) — leave as-is; do not guess at restoring punctuation inside words, only fix the decimal/URL patterns explicitly listed above.

## STEP 3 — Field-content sanity check (catches wrong-field contamination)

Some fields end up holding a stray fragment of the description instead of their actual short categorical value — this is a scraping bug, not real data, and must be caught even though the field is technically a non-empty string.

For `employmentType` and `worktype`: the value must look like a short category (e.g. `"Full-Time"`, `"Part-Time"`, `"Temporary"`, `"Seasonal"`, `"Contract"`, `"Remote"`, `"Hybrid"`, `"Onsite"`), not a sentence fragment. If the value is longer than ~40 characters, contains multiple words forming a grammatical sentence clause, or clearly reads as a cut-off piece of the job description (e.g. `"s of climates and terrain. Employee will assist co-workers in assessing every property within the county, determine prop"`), treat it as corrupted: set the field to `""` (empty string). Do not remove the job over this — only null the corrupted field, since these fields aren't in the hard-required list.

Apply the same sanity check to `salaryRange`, `location`, `city`, `state`, `country`: each should hold a short, plausible value for its field (a dollar/rate figure, a place name) — not a paragraph fragment. If corrupted in this way, blank the field rather than removing the job.

## STEP 4 — Keep a real job ONLY if ALL of the following are true (after Steps 1–3 cleanup)

1. Required fields are non-empty strings: `jobId`, `title`, `description`, `jobUrl`, `postedDate`, `company`, `ats`.
2. `ats` is exactly `"Custom"`.
3. `postedDate` is a real, valid `YYYY-MM-DD` date. Reject if it's placeholder text (`"Open Until Filled"`, `"TBD"`, `"N/A"`, a relative string, etc.) or empty.
4. `jdDeadline`, if present, is a real `YYYY-MM-DD` date or `""`/`null` — never placeholder text. Never remove a job solely over `jdDeadline`; null it instead if it's placeholder text.
5. After boilerplate stripping (Step 1), `description` still contains genuine role-specific content — actual duties, qualifications, or requirements, not just leftover structural fragments. If nothing role-specific remains, remove the job.
6. No duplicate `jobId` within the same company file — keep only the first occurrence.
7. `jobUrl` is a valid, well-formed single-job detail URL.
8. `salaryRange`, after Step 2/3 cleanup, is either a real explicit value or an empty string — never guessed. Note but do not remove a job where the description clearly states a salary figure but `salaryRange` itself ended up empty — that's a missing-value inconsistency to flag in the report, not grounds for removal.

## Do NOT

- Do not invent, infer, guess, or reconstruct any value (including broken URLs) to make a record look complete.
- Do not paraphrase or summarize substantive job-description content — only delete recognized boilerplate/artifact text per Steps 1–2.
- Do not add, rename, or reorder fields.
- Do not remove a job over a corrupted `employmentType`/`worktype`/`salaryRange`/`location`/`city`/`state`/`country` — null that field instead (Step 3). Only the Step 0 and Step 4 conditions are removal triggers.

## Output

For each `<Company>_jobs.json`, produce `<Company>_jobs_filtered.json` containing only jobs that pass Steps 0–4, in the exact 15-field interface shape, with titles/descriptions cleaned per Steps 1–2 and corrupted fields nulled per Step 3.

Report per company:

```
Company:
Jobs in original file:
Removed as listing/search-page contamination (Step 0):
Jobs with title/description boilerplate stripped (Step 1):
Jobs with extraction-artifact fixes applied (Step 2):
Fields nulled for content-sanity failure, by field (Step 3):
Jobs removed at final check (Step 4, by rule violated):
Jobs kept:
Jobs with salary mentioned in description but salaryRange empty (flagged, not removed):
```

Do not overwrite the original file. Process one company at a time and give the report before moving to the next.