# jev-scraper — Jev-optimised UK job scraper

A fast, standalone careers scraper in which **TypeSafe Jev makes the judgment
calls** and ordinary code handles I/O, dates and verbatim extraction. It is a
new, self-contained project and does not touch the deterministic scraper in
the parent `src/`.

## Why Jev here

Jev is a System One decision model, not a chatbot. Per the technical
evaluation it is excellent at fast, low-cost classification, scoring and
probability — and it **cannot** fetch pages, emit free text, or do arithmetic.
This project keeps that boundary strict:

| Concern | Owner | Why |
|---|---|---|
| Fetching, robots.txt, redirects, concurrency | `fetch.ts`, `pool.ts` | Jev has no I/O. |
| Link triage (vacancy vs listing vs nav) | Jev `judgeLinks` | Judgment, high volume. |
| Is this page one vacancy? | Jev `judgeVacancy` | Judgment, untrusted text. |
| UK location / right-to-work | Jev `uk_location` Noul + `isUkCountry` | Negation/paraphrase robust. |
| Worktype / employment / salary-kind / date-kind | Jev `judgeJob` Choice | Restricted-choice bias handled with escape options. |
| **Parsing dates and £ amounts** | `normalize.ts`, `dates.ts` | Jev must not do arithmetic or copy values. |
| **Salary is never invented** | code | Only a verbatim `£` annual range survives. |

## Setup

```sh
cd jev-scraper
npm ci
# add your key(s)
echo OPENROUTER_API_KEY=sk-or-v1-... >> .env
echo TYPESAFE_API_KEY=vck_... >> .env
```

Keys live only in `.env` (gitignored); treat them as secrets.

## Providers and fallback

Jev is reached through two providers, both verified live:

1. **OpenRouter** (primary) — `POST https://openrouter.ai/api/alpha/decisions`,
   model `typesafe/jev-1.13`, native `noul`/`choice`/`score` answers, returns
   `usage.cost`.
2. **Vercel AI Gateway** (fallback) — `POST https://ai-gateway.vercel.sh/v1/evaluate`,
   model `typesafe-ai/jev`, `boolean` question type.

Transient errors (429/5xx) are retried with backoff, honouring `Retry-After`.
A hard failure (free-tier rate limit, 402/403) switches to the next provider
for the rest of the run. If no provider is left, the run finishes
deterministically instead of failing; each row records which engine judged it
(`judged: jev | deterministic`) and `report.json` counts both.

## Verify Jev connectivity first

```sh
npm run smoke
```

Expected: a few typed answers (uk_location, worktype, employment_type,
salary_kind, date_kind) and a latency/tokens line. This costs a fraction of a
cent, and prints which provider answered.

## End-to-end validation

```sh
npm run e2e        # local fixture server + REAL Jev calls
npm run debug:links -- <listing-url>   # inspect link triage on a live page
```

`npm run e2e` serves a careers page plus a UK and a US vacancy (embedded
JobPosting), runs the real scraper, and asserts that the UK job survives with a
normalised `£` salary while the US job is excluded. Expected summary:

```text
1 UK job rows, 1 skipped, 5 pages, 6 Jev calls (~$0.0002)
E2E PASS: UK job kept, US job filtered, salary normalised.
```


## Scrape

```sh
npm run scrape -- "https://example.com/careers" --company "Example" \
  --out output/example --mode auto --max-pages 100 --concurrency 6
```

Options:

- `--mode auto` — crawl + schema (default). `schema` = only pages with
  schema.org JobPosting. `crawl` = full link crawl.
- `--confidence 0.6` — minimum Jev confidence/probability to act.
- `--delay-ms 800` — per-origin request pacing (robots crawl-delay honoured).
- `--max-pages`, `--timeout-ms`, `--months-back`.

## Outputs (in `--out`)

- `jobs.csv` / `jobs.json` — filtered UK job rows.
- `skipped.json` — jobs excluded with a reason.
- `decisions.json` — every Jev answer (probabilities + confidence) for audit.
- `report.json` — counts, issues, and `jev` usage/cost stats.

## Cost

Measured on this machine's saved outputs: ~1,800 tokens/job average → about
**$0.00008 per job** (input $0.042/MTok, output free). 1,000 jobs ≈ **$0.08**.

## Tests

```sh
npm test        # offline, Jev is mocked
npm run typecheck
```

## Safety and limits

- Respects robots.txt and per-origin pacing; never bypasses auth/CAPTCHA.
- Treats page text as untrusted; Jev instructions carry intent, not state.
- Jev's output is a *label*, never copied verbatim into a field that must be
  exact (dates, salaries, URLs).
- No browser is used. JavaScript-rendered boards (for example Greenhouse and
  Lever listing pages) return no links to static HTML; those need the parent
  project's Playwright path or a site adapter. Static HTML, embedded JSON and
  schema.org JobPosting pages work as shown.
- Jev is best-effort. If every provider is rate-limited or unavailable the run
  still completes: rows fall back to deterministic extraction and are marked
  `judged: deterministic` in `jobs.csv` / `report.json`.

## Verified results

- Live smoke (`npm run smoke`): 1 Jev call, ~600-990 ms, correct judgments,
  ≈$0.00005.
- `npm run e2e`: UK job kept (`judged: jev`, worktype `Hybrid`, salary
  `£24500-£26000`), US job excluded as `no_confirmed_uk_location`.
- Live crawl of `https://compasscommunityweb.eploy.net/vacancies` (Eploy,
  static HTML): **8 UK job rows from 8 pages for ≈$0.001** (10 Jev calls,
  382 ms average), with titles, locations, posted dates, deadlines, employment
  types, worktypes, salary ranges and per-row confidence; all `judged: jev`.
  Link triage scored real vacancy pages 0.88-1.00 and correctly rejected
  navigation, saved-jobs, view toggles and application forms.

