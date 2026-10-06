# Universal UK Scraper — Production Implementation Report

Implemented universal scraper covering **all 75 UK companies** across 13 platform engines (Comeet, Eploy, Jobtrain, WordPress, Custom, Reed, Haystack, Tribepad, JobAdder, Portobello, Occy, Supabase, JobToday).

---

## Key Highlights

- **Unified Single-Entry CLI & Programmatic API**: `universal.ts` (`scrapeAll`, `scrapeCompany`, `scrapePlatform`).
- **75 Companies Integrated**: All 75 company source folders registered in `config/companies.json`.
- **Dedicated Filters File**: `src/filters.ts` centralizes UK location, date window, salary range, and NHS exclusions.
- **Dedicated Common Utilities File**: `src/common-utils.ts` standardizes text/HTML cleaning, CSV formatting, and directory management.
- **Dedicated Output Directory**: All runs generate structured artifacts under `output/universal-runs/<timestamp>-<runId>/`.
- **Production Standalone Package**: Reusable standalone package created in `universal_scraper_production/` for team members.

---

## Verification Evidence

| Check | Result |
|---|---|
| Original UK Filters | 53 normalizers, 795 assertions, 0 failures |
| Current Shared UK Normalizer | 15 shared assertions, 0 failures |
| Unit Suite | 171 passed, 0 failed |
| Offline Fixture Regression | 53 / 53 passed, 0 unexplained differences |
| TypeScript App Typecheck | Passed (`tsc -p tsconfig.app.json`) |
| Production Build | Passed (`dist-universal/` and `dist/`) |
| Live Multi-Batch Repeated Scrapes | 100% exact match across repeat runs (0 failures/blocks) |

---

## Live Verification Sample (5 October 2026)

| Company | Platform | Status | UK Rows Extracted |
|---|---|---|---|
| aquasec | Comeet | LIVE VERIFIED | 1 |
| blockaid | Comeet | LIVE VERIFIED | 1 |
| cc-nurseries | Jobtrain | LIVE VERIFIED | 11 |
| checkmarx | Comeet | LIVE VERIFIED | 1 |
| coralogix | Comeet | LIVE VERIFIED | 7 |
| cyera | Comeet | LIVE VERIFIED | 13 |
| guide-dogs | Eploy (source/config evidence) | LIVE VERIFIED | 8 |

---

## Standalone Production Folder for Team Members

Located at: `D:/Internship/MAIN/UK SCRAPPER/universal_scraper_production/`

```powershell
cd universal_scraper_production
npm install
npm run list
npx tsx universal.ts --company aquasec
npm run scrape:all
```

---

## Release Boundaries & Verification Notice

- **Tested Standalone Workflow**: 20 standalone unit/regression tests, 158 app tests, and multi-batch live runs have been verified.
- **Explicit Verification Limits**: Do not claim all 75 companies are production-verified. **73 companies remain untested live here**, and reused collectors have not received independent line-by-line certification.
- **Next Release Steps**: Source-by-source identity verification, completeness checks, and browser/deployment testing.
- **TL Audit & Known Risks**: Detailed in [VERIFICATION.md](../../universal_scraper_production/VERIFICATION.md).
