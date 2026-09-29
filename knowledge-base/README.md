# UK Scraper Knowledge Base

This directory contains process documentation for each company scraped. Each file serves as a reference for future scraping projects.

---

## Index

| Company | Status | Jobs Scraped | Knowledge Base File | Last Updated |
|---------|--------|--------------|---------------------|--------------|
| Fusion People | COMPLETE | 10 | [FUSION_PEOPLE.md](./FUSION_PEOPLE.md) | 2026-09-25 |
| Morgan Law | COMPLETE | 30 | [MORGAN_LAW.md](./MORGAN_LAW.md) | 2026-09-25 |
| Morson | COMPLETE | 856 | (pending) | 2026-09-25 |
| New Appointments Group | COMPLETE | 77 | (pending) | 2026-09-25 |
| Sellick Partnership | COMPLETE | 100 | (pending) | 2026-09-25 |
| SmartEd | COMPLETE | 238 | (pending) | 2026-09-25 |
| Stannah | PARTIAL | 15 | (pending) | 2026-09-25 |
| Paysafe | COMPLETE | 8 | (pending) | 2026-09-25 |
| SJC Partners | FILTERED | 0 | (jobs too recent) | 2026-09-25 |
| London Academy | PENDING | 2 | - | - |
| McGinnis Loy | PENDING | 3 | - | - |
| **TOTAL** | **8 Companies** | **1,334** | | |

---

## Key Documents

- **[SCRAPING_STANDARDS.md](./SCRAPING_STANDARDS.md)** - Data quality rules and validation standards
- **[MORGAN_LAW.md](./MORGAN_LAW.md)** - Company-specific extraction patterns (example)
- **[FUSION_PEOPLE.md](./FUSION_PEOPLE.md)** - Fusion People scraping process
- **[DATA_QUALITY_VERIFICATION_2026-09-25.md](./DATA_QUALITY_VERIFICATION_2026-09-25.md)** - Verification report

---

## Knowledge Base Template

When completing a company scrape, document the process in a new file: `{COMPANY_NAME}.md`

### Required Sections:

1. **Company Overview**
   - Company name, website, jobs page URL
   - ATS type detected
   - Scraping date

2. **Critical Findings**
   - Pagination type (Load More / Infinite Scroll / Paginated)
   - JobId extraction method (URL-based / Page-based / Synthetic)
   - Any special handling required

3. **Scraping Process**
   - Step-by-step code examples
   - Playwright/Puppeteer selectors used
   - Wait strategies for dynamic content

4. **Fix Scripts**
   - Full JavaScript code for any data corrections
   - Regex patterns used
   - Data transformation logic

5. **Sample Data**
   - Before/after comparison of fixed data
   - Example URLs with JobId extraction

6. **Lessons Learned**
   - Challenges encountered
   - Solutions applied
   - Best practices for future

7. **Run Commands**
   - PowerShell/Bash commands to execute scripts
   - File paths used

---

## Directory Structure

```
knowledge-base/
├── README.md                      # This file (index)
├── SCRAPING_STANDARDS.md          # Data quality standards
├── DATA_QUALITY_VERIFICATION_2026-09-25.md  # Verification report
├── FUSION_PEOPLE.md               # Fusion People process documentation
├── MORGAN_LAW.md                  # Morgan Law process documentation
├── MORSON.md                      # (to be created)
├── SMART_ED.md                    # (to be created)
├── SELICK_PARTNERSHIP.md          # (to be created)
├── NEW_APPOINTMENTS_GROUP.md      # (to be created)
├── STANNAH.md                     # (to be created)
├── PAYSAFE.md                     # (to be created)
└── ...                            # Additional company files
```

---

## Quick Reference

### Common Regex Patterns for JobId Extraction

| Company | URL Pattern | Regex | Example |
|---------|-------------|-------|---------|
| Fusion People | `/job/title-NUMBER/` | `/-(\d+)\/?$/` | `40016` |
| Morgan Law | `/job/title-NUMBER/` | `/-(\d+)\/?$/` | `20695` |
| Sellick Partnership | `/job/SLUG/` | `/job\/([^\/]+)\/?$/` | `commissioning-manager` |
| SmartEd | `/Vacancy?Id=NUMBER` | `/Id=(\d+)/` | `41057` |
| Morson | `/jobs/.../.../SLUG` | `/([^\/]+)\/?$/` | `retail-designer-autocad` |

### Data Quality Standards

| Field | Rule |
|-------|------|
| **salaryRange** | Annual salaries ONLY. Move "per day", "per hour", "per week" to description |
| **jobId** | MUST extract from URL, never synthesize hash IDs |
| **location** | Use dedicated field > URL structure > Description regex |
| **ats** | Platform name (HiBob, Custom, InHouse), NOT company name |
| **date format** | DD-MM-YYYY |
| **country** | "UK" for all UK jobs |

### Pagination Types

| Type | Detection | Handling |
|------|-----------|----------|
| Load More | Button with "Load More" text | Click until button disappears |
| Infinite Scroll | No pagination buttons | Scroll to bottom, wait for new content |
| Paginated | Page numbers 1, 2, 3... | Loop through each page URL |
| Single Page | All jobs visible | No special handling |

### Date Format Standard

- **Input**: Various (relative dates, ISO, UK format)
- **Output**: `DD-MM-YYYY` (e.g., `25-09-2026`)
- **Cutoff**: Jobs posted after `25-07-2026` (2 months prior)

---

## Related Documents

- [UK_SCRAPING_TEAM_LEAD.md](../UK_SCRAPING_TEAM_LEAD.md) - Operating rules and requirements

---

## Updating This Index

After completing a company scrape:

1. Create new knowledge base file: `{COMPANY_NAME}.md`
2. Update the index table above with:
   - Status: COMPLETE
   - Jobs Scraped: (count)
   - Knowledge Base File: link to new file
   - Last Updated: YYYY-MM-DD

---

*Last updated: 2026-09-25*
