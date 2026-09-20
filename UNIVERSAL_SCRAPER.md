# Reusable company careers scraper

A modular TypeScript framework for public careers websites, not a promise that
arbitrary websites or private APIs can be scraped without an adapter.

## Install and run

Requires Node.js 22+. Install once in this folder:

```sh
npm ci
npx playwright install chromium
npm run scrape -- "https://example.com/careers" --company "Example" --out output/example
npm run batch -- companies.json --out output/new-batch
```

The supplied manifest contains the five requested companies and the verified
replacement Intercity careers URL. For hundreds of companies, add manifest
entries with unique `slug`, `name`, `careersUrl` and optional `options`.
Batch execution is sequential with per-company checkpoints and independent
failure reporting, intentionally not a distributed crawler.

`--resume` reuses a saved result only when its company configuration matches.
It is for continuing the same batch, **not refreshing old data**. New batches
should use a new output directory without `--resume`. Scraped timestamps and
date assumptions remain tied to the original run.

## Automatic strategy selection

1. Recognized Ashby/Greenhouse/Lever/Workable boards or a configured public JSON endpoint:
   use public API extraction.
2. Discover a sitemap declared in robots.txt, or use a supplied job sitemap.
3. Crawl static HTML, JSON-LD, microdata, linked public JSON feeds, pagination
   links and supported Eploy detail fields. CSS selectors extend unknown HTML.
4. Fall back to headless Playwright for JavaScript-rendered details, iframes,
   public GET JSON responses, load-more controls and infinite scroll.
5. Preserve the best partial result if no strategy completes. All attempted
   methods, limits and failures are recorded.

A successfully extracted set excluded by UK/date filters is not an extraction
failure. The framework does not repeatedly fetch the same data just because it
contains no qualifying jobs.

JSON feeds support schema.org JobPosting plus a conservative common
`jobs`/`results`/`data` array format requiring title, description and job URL.
Only explicit postedDate/datePosted values count as posting dates—not arbitrary
created/updated timestamps. Country is not inferred from company headquarters.
Workable's public widget uses its explicit `published_on` field and full
descriptions (`details=true`), not `created_at`. A false remote flag does not
establish On-site work. The verified LAAT Zoho adapter uses `Date_Opened`, matching
the visible Posted on field, excludes filled/unpublished entries, and retrieves
full in-window details. It is not enabled for unverified Zoho boards.
**Comeet exception, requested September 18, 2026:** `postedDate` stores the
Europe/London calendar date of `time_updated`, which is a modification date,
not publication. The two-month filter applies to that update date. Missing or
invalid update values are excluded, not replaced with the scrape date.
Reports retain exact timestamps, `location.is_remote`, `employment_type` and
`workplace_type`. Explicit workplace labels take precedence over the remote
boolean (Hybrid is not converted to Remote); absent labels use boolean fallback.
Employment type stays empty where the source does not provide it.
Explicit body `next`, `links.next` and `pagination.next` URLs are followed.
Unknown cursor/offset contracts, cross-origin API pagination and arbitrary
GraphQL responses need an adapter. Cycles and budgets produce partial reports.

Cross-origin career links are restricted to recognized ATS providers; a custom
embedded provider may need its public careers URL supplied directly. If an
iframe uses an unrecognized host or unconventional navigation, configure that
source instead of assuming it was exhaustively covered.

## Configuration

```json
[
  {
    "name": "Example",
    "slug": "example",
    "careersUrl": "https://example.com/careers",
    "options": {
      "mode": "auto",
      "maxPages": 1000,
      "delayMs": 1000,
      "timeoutMs": 30000,
      "renderWaitMs": 1500
    }
  }
]
```

Optional `options.apiUrl`, `options.sitemapUrl`, and `options.selectors` supply
public endpoints, a job sitemap or CSS selectors. Modes: auto/api/static/dom.
Selector fields are declared in `src/extract.ts` and include job, title,
description, jobUrl, location, city, state, country, postedDate, jdDeadline,
salaryRange, employmentType, worktype, jobLinks, next and loadMore.
An explicit `selectors.jobLinksOnly` keeps extraction on that targeted listing and
skips automatic global-sitemap discovery. An explicitly supplied `sitemapUrl`
still takes precedence. This avoids replacing a UK-filtered board with a
worldwide sitemap. Job links then come only from that selector; ordinary
same-origin next/numeric pagination and an explicit `next` selector still work.
Unselected careers/category/related-job navigation is not followed. Robots
checks remain enabled. The original `jobLinks` remains additive and unchanged.
Optional `employerNames` selects exact source employer names when a group portal
serves multiple brands; excluded normalized rows are listed in scopeExcluded.
Do not use the name of a group company to relabel unrelated subsidiaries.

## Modules / extension points

| Module | Responsibility |
| --- | --- |
| `src/strategy.ts` | Automatic selection and fallback, paginated public API runs |
| `src/crawl.ts` | Access policy, pacing, redirects, HTML/DOM crawling and interactions |
| `src/api.ts` | Public JSON envelope/record decoding; extend for REST schemas |
| `src/ats.ts` | Provider detection and public ATS adapters |
| `src/extract.ts` | JSON-LD, microdata, Eploy HTML, selectors and link discovery |
| `src/sitemap.ts` | Sitemap/index traversal and vacancy detail extraction |
| `src/geography.ts` | Source-specific UK location verification and audit evidence |
| `src/normalize.ts` | 15-field normalization, rolling date window and deduplication |
| `src/output.ts` | Consistent CSV/JSON schema and spreadsheet formula escaping |
| `src/batch.ts` | Manifest execution, company isolation, checkpoints and combined CSV |

For a new provider, add hostname detection and payload mapping in `src/ats.ts`,
or extend `src/api.ts`. Add a local fixture regression test for pagination,
location/date handling and malformed responses. Prefer a small provider
adapter or selectors over changes to the normalizer.

For mixed-employer boards without reliable hiringOrganization metadata, a company
manifest may set `"titlePrefixes": ["Phase Eight"]`. Matching uses the actual
vacancy title, case-insensitively with a word/separator boundary; a fallback
company name is not evidence. Nonmatching source records remain in
`report.scopeExcluded`. Packaged exports are checked against the same predicate.

A manifest may set `exportCompanyName` to a requested canonical company label.
This changes only the exported company column, after source-employer filtering.
Original source names remain in the saved source rows and
`report.exportCompanyIdentity`; checkpoint resumes therefore filter the original
employer rather than the display label.

## Output contract

`jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats`

ATS is `Custom` in exported job rows, regardless of actual extraction provider.
Missing values remain empty. No process/reason job columns; reports retain the
method, issues, scope exclusions, uncertain locations and date fallbacks.
One row per UK location; identical full rows are deduplicated.
The date window is the run's UK day minus two calendar months, inclusive; it
applies to present posted dates. Posting-date rule: a present posted date is
kept as published; if the posted date is missing but a deadline is given, the
posted-date column stays empty (the run date is never substituted); only when
both the posted date and the deadline are missing is the run's UK calendar day
used as the posted date, with a report disclosure. Salary rule: a source salary shown as d.o.e or an hourly rate (per hour) is moved into the job description and salaryRange is left empty; a salary is never invented. The salary field contains only the pay range with the pound sign — £ prefixed to each amount and a hyphen between bounds (e.g. £42500-£45000 or £24785); thousands separators and all other wording are stripped, and a source value with no numeric pay range (d.o.e and hourly rates are moved to the description instead) stays empty.
Invalid dates or unconfirmed UK locations are excluded, not guessed.
Unambiguous source SQL timestamps (`YYYY-MM-DD HH:mm:ss`) retain their calendar
date without inventing a timezone. Invalid dates/times remain excluded.
Zero qualifying jobs produce a header-only CSV and an empty JSON array. Company outcomes and diagnostics remain in reports, never export rows.

For Eploy pages without country metadata, an explicit role-specific requirement
to have the right to work in the UK can establish UK recruitment location; the
exact requirement is recorded in dataNotes. A company footer, a UK driving
licence alone, or a match in a UK-only gazetteer is not sufficient. Previously
inferred city/state values are never reused as independent country evidence.

Work-arrangement labels such as Hybrid, Office and Community are not geographic
places. They do not override the role-specific JobPosting address and are never
sent to the place-name gazetteer. Genuine geographic labels still take priority
over conflicting addresses; home-based/remote/nationwide labels still suppress
an unrelated office city. Without source address evidence, no city/state is invented.

NHS Jobs advert extraction reads explicit posting/closing dates, working patterns,
full description/specification sections and role-location blocks. Employer-contact
addresses at the bottom are not reused as job locations. Employer-specific NHS
searches should use verified `employerCode` values: the free-text employer field
can return unrelated organisations.

Each company output includes jobs.csv, export-rows.json, scrape-report.json,
scrape-result.json and company.json. The batch adds companies.csv and
batch-report.json. Delivered outputs are under `jobs company wise/<company>/`;
source wrappers are under `code/<company>/` and import `code/universal_scraper/`.
Reruns go into new dated runs/ folders.

## Safety and limits

Respects robots.txt for document/API requests and redirects, rate limits and
bounded navigation/interaction counts. Never bypasses authentication, CAPTCHAs
or access challenges. Does not click application/submission controls.
Browser subresources can include normal site JavaScript requests; job JSON
capture reads public GET responses rather than replaying private credentials.
Use trusted public manifests only: this is a local CLI, not a service that
accepts untrusted URLs. Network/DOM changes may require new adapters or selectors.
Completeness is assessed from report issues, pending URLs and limits, not merely
from receiving some rows. Missing advertised fields cannot be invented.

## Verify

```sh
npm run typecheck
npm test
npm run test:browser
```

Tests use local HTTP fixtures for static/JSON/DOM fallback, API pagination,
iframe crawling, load-more, browser network JSON, access restrictions, schema,
normalization and batch isolation. `validation.json` describes the delivered
data checks; `batch-report.json` records the live company outcomes.
