# Correct Output Format for UK Job Scraper

## CSV Column Structure (15 columns)

```
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

## Field Format Examples

| Field | Correct Format | Notes |
|-------|----------------|-------|
| `jobId` | `ML-34663` | Simple ML-XXX format, NO company name prefix |
| `title` | `Accounts Assistant` | Clean job title ONLY, no location included |
| `description` | `""` | Full job description (empty if not extracted) |
| `jobUrl` | `https://mcginnisloy.com/job/accounts-assistant/` | Full URL to job listing |
| `postedDate` | `25-9-2026` | Format: DD-M-YYYY (day-month-year) |
| `jdDeadline` | `""` | Application deadline (if available) |
| `company` | `McGinnis Loy Associates Ltd` | Full company name |
| `salaryRange` | `£28,000 - £34,000` | Salary range as shown |
| `employmentType` | `Permanent` | Employment type: Permanent, Contract, Temporary, etc. |
| `worktype` | `Full-time` | Work type: Full-time, Part-time, etc. |
| `location` | `Newbury, England, United Kingdom` | Combination of city, state, country |
| `city` | `Newbury` | City name only |
| `state` | `England` | State/Province/Region |
| `country` | `United Kingdom` | Country name |
| `ats` | `McGinnis Loy` | ATS/platform name |

## Sample CSV Output Row

```csv
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
ML-34663,"Accounts Assistant","",https://mcginnisloy.com/job/accounts-assistant/,,"McGinnis Loy Associates Ltd","£28,000 - £34,000",Permanent,Full-time,"Newbury, England, United Kingdom","Newbury",England,United Kingdom,McGinnis Loy
ML-34642,"Audit Senior","",https://mcginnisloy.com/job/audit-senior-4/,,"McGinnis Loy Associates Ltd","£45,000 - £55,000",Permanent,Full-time,"Reading, England, United Kingdom","Reading",England,United Kingdom,McGinnis Loy
```

## Key Rules

1. **jobId**: Never include company name prefix - use simple sequential or extracted ID format
2. **title**: Must be clean - extract ONLY the job title, no location or extra text
3. **postedDate**: Use DD-M-YYYY format (e.g., `25-9-2026`)
4. **location**: Must be combination of `city, state, country`
5. **employmentType**: Must be correctly extracted from the listing
6. **2-month filter**: Apply date filter based on postedDate (cutoff: 2026-07-25 for current scrape)

## UK Location Validation

Include only jobs in UK locations. Common UK cities:
- England: London, Birmingham, Manchester, Reading, Bristol, Newbury, Guildford, etc.
- Scotland: Edinburgh, Glasgow, etc.
- Wales: Cardiff, etc.
- Northern Ireland: Belfast, etc.

Exclude non-UK locations even if listed on the company's career page.
 
 ---
 
 ## Verification Status (as of 2026-09-25)
 
 | Company | Status | jobId | title | postedDate | location | employmentType | Issues |
 |---------|--------|-------|-------|------------|----------|----------------|--------|
 | McGinnis Loy | ✅ CORRECT | ✅ ML-34663 | ✅ Accounts Assistant | ⚠️ Empty | ✅ Newbury, England, UK | ✅ Permanent | postedDate not in listing |
 | Fusion People | ❌ NEEDS FIX | ❌ JOB-00001 | ✅ Group Finance Manager | ❌ Fake date | ❌ Empty | ❌ "Job Search" | All fields wrong |
 | LAAT | ❌ NEEDS FIX | ❌ JOB-00011 | ✅ Non-academic Coordinator | ❌ Wrong format | ❌ London only | ❌ Empty | Wrong date format, location incomplete |
 
 ### Fusion People Issues:
 1. **jobId**: Should be `FP-001` not `JOB-00001`
 2. **employmentType**: "Job Search" is wrong - should be actual employment type
 3. **location**: Empty - should be `city, state, country`
 4. **city/state/country**: Not extracted
 5. **postedDate**: Not real - needs proper extraction
 6. **worktype**: Contains garbage text instead of work type
 7. **Note**: Fusion People uses JavaScript rendering, needs Playwright scraper
 
 ### LAAT Issues:
 1. **jobId**: Should be `LAAT-001` not `JOB-00011`
 2. **postedDate**: Wrong format `2025-07-28` → should be `28-7-2025`
 3. **location**: Should be `London, England, United Kingdom` not just `London`
 4. **city/state/country**: All three show `London` - should be distinct
 5. **employmentType**: Missing for some rows
 
 ### Action Required:
 - **Fusion People**: Re-scrape with Playwright to get proper data
 - **LAAT**: Fix the scraper to output correct format
