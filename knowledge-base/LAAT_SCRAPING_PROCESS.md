# LAAT (London Academy for Applied Technology) Scraping Process

## Overview
This document describes the complete process for scraping job listings from LAAT's Zoho Recruit career page.

## Source URL
`https://laat.zohorecruit.eu/jobs/Careers`

## Data Source Format
LAAT uses **Zoho Recruit** ATS. The job data is embedded in the page source HTML as a hidden JSON structure.

### HTML Structure
The jobs are stored in a hidden input field or script tag within the page source. The data is HTML-encoded JSON containing:
- `Posting_Title` - Job title
- `City` - City location
- `State` - State/county
- `Country` - Country
- `Job_Type` - Employment type (e.g., "Full time")
- `Remote_Job` - Boolean for remote work
- `id` - Numeric job ID (13+ digits)
- `Date_Opened` - Posted date (YYYY-MM-DD format)
- `Work_Experience` - Experience required
- `Job_Description` - Full job description

### Key Challenge: Embedded JSON
The additional fields (`id`, `State`, `Country`, `Date_Opened`) are embedded within the `Job_Description` field as escaped JSON strings:
```
\u201d,\u201dWork_Experience\u201d:\u201d0-1 year\u201d,\u201dJob_Type\u201d:\u201dFull time\u201d...,\u201did\u201d:\u201d88368000000491005\u201d...
```

## Extraction Process

### Step 1: Download Page Source HTML
```powershell
# Use PowerShell to download the view-source page
$url = "https://laat.zohorecruit.eu/jobs/Careers"
$output = "laat.html"
Invoke-WebRequest -Uri $url -OutFile $output
```

### Step 2: Parse JSON from HTML
The job data is in HTML-encoded JSON format. Key regex patterns for extraction:

```javascript
// Extract ID (13+ digit number)
const idMatch = job.Job_Description.match(/(\d{13,})/);

// Extract Date_Opened (YYYY-MM-DD format)
const dateMatch = job.Job_Description.match(/Date_Opened.*?(\d{4}-\d{2}-\d{2})/);

// Extract State
const stateMatch = job.Job_Description.match(/State.*?([^"\\]{3,30}?)[\\""]/);

// Extract Country
const countryMatch = job.Job_Description.match(/Country.*?([^"\\]{5,30}?)[\\""]/);
```

### Step 3: Job URL Format
```
https://laat.zohorecruit.eu/jobs/Careers/{job_id}/{title-slug}?source=CareerSite
```

Example:
```
https://laat.zohorecruit.eu/jobs/Careers/88368000001777057/Assessment-Support?source=CareerSite
```

Where:
- `{job_id}` - The 13+ digit numeric ID
- `{title-slug}` - Job title with spaces replaced by hyphens, special characters removed

### Step 4: Create URL Slug
```javascript
function createSlug(title) {
    return title
        .replace(/\u200b/g, '')  // Remove zero-width characters
        .replace(/[^a-zA-Z0-9\s-]/g, '')  // Remove special chars
        .trim()
        .replace(/\s+/g, '-');  // Replace spaces with hyphens
}
```

## CSV Output Format

Required 15 columns:
```
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
```

### Column Mappings
| CSV Column | Source Field | Notes |
|------------|--------------|-------|
| jobId | id | Just the numeric ID (no company name) |
| title | Posting_Title | Clean title without location |
| description | Job_Description | First part before embedded JSON |
| jobUrl | Constructed | See URL format above |
| postedDate | Date_Opened | Convert to DD-MM-YYYY format |
| jdDeadline | - | Not provided, leave empty |
| company | - | "London Academy for Applied Technology" |
| salaryRange | - | Not provided in source |
| employmentType | Job_Type | Map "Full time" → "Full-time" |
| worktype | Remote_Job | false → "On-site", true → "Remote" |
| location | - | Combine: city, state, country |
| city | City | Direct mapping |
| state | State | Direct mapping |
| country | Country | Direct mapping |
| ats | - | "Zoho Recruit" |

## Date Filtering

Apply 2-month cutoff filter:
```javascript
const cutoffDate = new Date('2026-07-25');  // Example cutoff
const filteredJobs = jobs.filter(job => {
    if (!job.Date_Opened) return true;
    const openedDate = new Date(job.Date_Opened);
    return openedDate >= cutoffDate;
});
```

## Data Quality Checks

### Issues Fixed:
1. ✅ jobId - Extract only numeric ID (no company name prefix)
2. ✅ title - Clean title without location info
3. ✅ postedDate - Format as DD-MM-YYYY
4. ✅ employmentType - Standardize "Full time" → "Full-time"
5. ✅ location - Combine city, state, country
6. ✅ jobUrl - Correct Zoho Recruit URL format with slug

### Special Characters to Handle:
- `\u200b` - Zero-width space in titles
- `\u2013` - En-dash (-)
- `\u2019` - Right single quote (')
- `\u2022` - Bullet point
- `&amp;` - HTML ampersand

## Output Location
```
output/YYYY-MM-DD-main-uk-scrape/LAAT/jobs.csv
```

## Scripts Created

| Script | Purpose |
|--------|---------|
| `extract-laat-final.js` | Parse HTML and extract job JSON |
| `parse-laat-final.js` | Extract embedded fields from Job_Description |
| `create-laat-csv.js` | Format jobs to 15-column CSV |

## Sample Output
```
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
"88368000001714272","Student Experience Assistant","...",https://laat.zohorecruit.eu/jobs/Careers/88368000001714272/Student-Experience-Assistant?source=CareerSite","12-08-2026","","London Academy for Applied Technology","","Full-time","On-site","London, Tower Hamlets, United Kingdom","London","Tower Hamlets","United Kingdom","Zoho Recruit"
```

## Notes
- LAAT uses Zoho Recruit ATS
- Job IDs are 17-digit numbers (e.g., 88368000001714272)
- All jobs are on-site (Remote_Job = false)
- Salary information not available in source data
- Some jobs may have duplicate titles (e.g., "Student Experience Assistant" posted multiple times)
