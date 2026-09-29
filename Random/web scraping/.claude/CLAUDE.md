# Claude Instructions for This Project

## Critical Rules - Do NOT Ignore

### 1. TypeScript ONLY
- Create **only** `.ts` files
- **NEVER** create `.js`, `.mjs`, `.cjs` files
- Previous violation: created `garver.mjs`, `alamogordo.mjs` instead of `.ts`

### 2. Output Format
- **JSON only**
- **NO** CSV output
- **NO** Excel output
- **NO** JS module exports
- Previous violation: wrote `garver_jobs.js` and `garver_jobs.csv`

### 3. Single File
- **One TypeScript file per scraper**
- No separate test files
- No helper modules
- No config files

### 4. Verification Before Writing
Before creating files, verify:
- Extension is `.ts`?
- Output is JSON only?
- No additional formats being written?

## Consequences of Violations
- Creates broken toolchain (expect TS compile, fails on JS)
- Clutters repo with unwanted formats
- User must delete and re-request

## Reminder
Read `UNIVERSAL_JOB_SCRAPER_REQUIREMENTS.md` completely before coding.
