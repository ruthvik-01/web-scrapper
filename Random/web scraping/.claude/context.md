# Project Context

Living document. Each session appends learnings.

---

## Project Overview

**Name:** Web scraping job board collection
**Location:** `d:\Internship\web`
**Tech:** TypeScript, Node.js, Playwright, Cheerio

---

## Session Log

### 2026-08-14

**What happened:**
- Removed Obsidian MCP check from global CLAUDE.md
- User wants single `context.md` for all session learnings here

**Files touched:**
- `C:\Users\RUTHVIK\.claude\CLAUDE.md` - removed Session Start Protocol section

**Rules learned:**
- Project uses TypeScript ONLY (no `.js`, `.mjs`, `.cjs`)
- Output JSON only (no CSV, Excel)
- One file per scraper
- Read `UNIVERSAL_JOB_SCRAPER_REQUIREMENTS.md` before coding

**Existing scrapers:**
- `graver/` - Garver job scraper
- `cityofalamogordonm/` - Alamogordo city jobs

**Next:**
- Maintain this file each session with new learnings

---

## Active Tasks

- [ ] Continue maintaining context.md

---

## Code Patterns

*To be filled as patterns emerge*

---

## Decisions

*To be filled as decisions are made*

---

## Scraper Updates (2026-08-14)

**garver_scraper.ts changes:**
- Added `cleanDesc()` - removes escape sequences (\n, \t, \r) and normalizes whitespace
- Added `isMexicoLocation()` with indicators: "mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"
- Skip jobs with empty description (return null if no description found)
- Description extraction from `<article>` element

**uscourts_scraper.ts changes:**
- Added "nm" to Mexico indicators list
- Added `cleanDate()` - filters out "Open Until Filled" and non-ISO dates, returns empty string
- Skip jobs with empty description
- Apply `cleanDate()` to both postedDate and jdDeadline
- Description cleaning removes escape sequences
- Mexico rule: skip only if missing dates AND Mexico location

**Mexico Rule understanding:**
- When postedDate OR deadline missing from detail page, filter for Mexico indicators
- Mexico indicators include: "Mexico", "Mexico City", "Monterrey", "MX", "New Mexico", "NM"
- Jobs missing dates AND matching Mexico location: keep them, use refDate as postedDate
- Jobs missing dates NOT matching Mexico location: skip them

---

## Known Issues

*To be filled as issues found*
