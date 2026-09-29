# Fusion People - Scraping Knowledge Base

## Company Overview
- **Company Name:** Fusion People
- **Website:** https://www.fusionpeople.com
- **Jobs Page:** https://www.fusionpeople.com/jobs/
- **ATS Type:** Custom (no standard ATS detected)
- **Scraping Date:** 25-09-2026

---

## Critical Findings

### 1. Pagination Type: "Load More" Button (NOT Infinite Scroll)
- Fusion People uses a **"Load More" button** to paginate job listings
- The button must be clicked programmatically to reveal additional jobs
- There is NO infinite scroll functionality

### 2. JobId Extraction from URL (CRITICAL)
- **NEVER use synthetic JobIds** (like `JOB-00001`)
- JobIds MUST be extracted from the job URL
- URL Format: `https://www.fusionpeople.com/job/{job-title-slug}-{NUMBER}/`

#### JobId Extraction Process

**Step 1: Identify the URL Pattern**
```
https://www.fusionpeople.com/job/group-finance-manager-40016/
                                                     ^^^^^^
                                                     JobId = 40016
```

**Step 2: Extract JobId with Regex**
```javascript
// CORRECT regex pattern - matches the NUMBER before the trailing slash
function extractFusionJobId(url) {
  // Pattern: hyphen followed by digits, then optional trailing slash and end of string
  const match = url.match(/-(\d+)\/?$/);
  if (match) {
    return match[1]; // Returns: 40016
  }
  return null;
}
```

**Step 3: Apply to Job Data**
```javascript
// Before (WRONG):
jobId: "JOB-00001"

// After (CORRECT):
jobId: extractFusionJobId(job.jobUrl)  // Returns: "40016"
```

---

## Scraping Process

### Step 1: Download HTML Page
```powershell
# Using Playwright to render JavaScript
$url = "https://www.fusionpeople.com/jobs/"
$html = Invoke-PlaywrightRender -Url $url -Output "fusionpeople.html"
```

### Step 2: Handle "Load More" Button
```javascript
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://www.fusionpeople.com/jobs/');

// Keep clicking "Load More" until no more results
let loadMoreVisible = true;
while (loadMoreVisible) {
  const loadMoreButton = await page.locator('button:has-text("Load More"), a:has-text("Load More")');
  
  if (await loadMoreButton.count() > 0) {
    await loadMoreButton.click();
    await page.waitForTimeout(2000); // Wait for content to load
  } else {
    loadMoreVisible = false;
  }
}

// Now scrape all job cards
const jobs = await page.locator('.job-card').all();
```

### Step 3: Extract Job Details
```javascript
for (const job of jobs) {
  const title = await job.locator('h2, .job-title').textContent();
  const jobUrl = await job.locator('a').getAttribute('href');
  
  // CRITICAL: Extract JobId from URL
  const jobId = extractFusionJobId(jobUrl);
  
  // Extract other fields...
}
```

---

## Fix Script: fix-fusion-jobids.js

**Location:** `D:\Internship\MAIN\UK SCRAPPER\fix-fusion-jobids.js`

```javascript
const fs = require('fs');
const path = require('path');

// Extract job ID from Fusion People URLs (format: /job/title-NUMBER/)
function extractFusionJobId(url) {
  const match = url.match(/-(\d+)\/?$/);
  if (match) {
    return match[1];
  }
  return null;
}

// Fix Fusion People job IDs
const fusionPath = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\fusion-people\\jobs.json';
const content = fs.readFileSync(fusionPath, 'utf8').replace(/^\ufeff/, '');
const jobs = JSON.parse(content);

const fixedJobs = jobs.map(job => {
  const urlId = extractFusionJobId(job.jobUrl);
  
  return {
    ...job,
    jobId: urlId || job.jobId
  };
});

// Write JSON to file
fs.writeFileSync(fusionPath, JSON.stringify(fixedJobs, null, 2));

// Write CSV
const header = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
const csvLines = [header];

fixedJobs.forEach(job => {
  const escapeField = (field) => {
    if (!field) return '""';
    const cleaned = String(field).replace(/\s+/g, ' ').trim();
    const escaped = cleaned.replace(/"/g, '""');
    return `"${escaped}"`;
  };
  
  csvLines.push([
    escapeField(job.jobId),
    escapeField(job.title),
    escapeField(job.description),
    escapeField(job.jobUrl),
    escapeField(job.postedDate),
    escapeField(job.jdDeadline),
    escapeField(job.company),
    escapeField(job.salaryRange),
    escapeField(job.employmentType),
    escapeField(job.worktype),
    escapeField(job.location),
    escapeField(job.city),
    escapeField(job.state),
    escapeField(job.country),
    escapeField(job.ats)
  ].join(','));
});

fs.writeFileSync(fusionPath.replace('.json', '.csv'), csvLines.join('\n'));

console.log(`Fixed ${fixedJobs.length} Fusion People job IDs`);
fixedJobs.forEach(job => {
  console.log(`  ${job.jobId}: ${job.title}`);
  console.log(`    URL: ${job.jobUrl}`);
});
```

---

## Merge Script Fix

**Location:** `D:\Internship\MAIN\UK SCRAPPER\merge-all-csv.js`

**Problem:** The merge script was overwriting original JobIds with synthetic `JOB-XXXXX` format.

**Solution:**
```javascript
// BEFORE (WRONG - replaces all JobIds):
jobs.forEach(job => {
  allJobs.push({
    ...job,
    jobId: `JOB-${String(globalId).padStart(5, '0')}`  // BAD!
  });
  globalId++;
});

// AFTER (CORRECT - preserves original JobIds):
jobs.forEach(job => {
  allJobs.push({
    ...job  // Keep original jobId from each company's file
  });
});
```

---

## Sample Job Data

### Before Fix
| jobId | title | jobUrl |
|-------|-------|--------|
| JOB-00001 | Group Finance Manager | https://www.fusionpeople.com/job/group-finance-manager-40016/ |
| JOB-00002 | Sideloader Operator | https://www.fusionpeople.com/job/sideloader-operator-40014/ |

### After Fix
| jobId | title | jobUrl |
|-------|-------|--------|
| 40016 | Group Finance Manager | https://www.fusionpeople.com/job/group-finance-manager-40016/ |
| 40014 | Sideloader Operator | https://www.fusionpeople.com/job/sideloader-operator-40014/ |
| 40009 | Graduate Engineering Geologist (Rail) | https://www.fusionpeople.com/job/graduate-engineering-geologist-rail-40009/ |
| 40007 | Engineering Geologist (Rail) | https://www.fusionpeople.com/job/engineering-geologist-rail-40007/ |
| 40000 | Estates Ops Manager NHS | https://www.fusionpeople.com/job/estates-ops-manager-nhs-40000/ |
| 39998 | M & E Supervisor | https://www.fusionpeople.com/job/m-e-supervisor-39998/ |
| 39996 | Material Handler Night Shift | https://www.fusionpeople.com/job/material-handler-night-shift-39996/ |
| 39994 | Manufacturing System Engineer | https://www.fusionpeople.com/job/manufacturing-system-engineer-39994/ |
| 39992 | Quality Control | https://www.fusionpeople.com/job/quality-control-39992/ |
| 39990 | Graduate Manufacturing Engineer | https://www.fusionpeople.com/job/graduate-manufacturing-engineer-39990/ |

---

## Locations Extracted

| City | Country | Job Count |
|------|---------|-----------|
| Stoke-on-Trent | United Kingdom | 2 |
| Leeds | United Kingdom | 2 |
| Middlesex | United Kingdom | 2 |
| Cookstown | United Kingdom | 4 |

---

## Employment Types Detected

| Type | Count |
|------|-------|
| Permanent | 6 |
| Contract | 4 |

---

## Lessons Learned

### 1. Always Check URL Structure for JobIds
Many job boards embed JobIds in the URL. Always inspect the URL pattern before synthesizing your own IDs.

### 2. Test Regex Before Running
Test regex patterns in isolation before applying to full dataset:
```javascript
// Test pattern
const testUrl = 'https://www.fusionpeople.com/job/group-finance-manager-40016/';
const match = testUrl.match(/-(\d+)\/?$/);
console.log(match[1]); // Should output: 40016
```

### 3. Preserve Original Data When Merging
When merging data from multiple companies, preserve each company's original JobId format rather than assigning synthetic IDs.

---

## Output Files

| File | Path | Description |
|------|------|-------------|
| jobs.json | `output/2026-09-25-main-uk-scrape/jobs company wise/fusion-people/jobs.json` | Individual company job data |
| jobs.csv | `output/2026-09-25-main-uk-scrape/jobs company wise/fusion-people/jobs.csv` | Individual company CSV |
| companies.json | `output/2026-09-25-main-uk-scrape/companies.json` | Master JSON with all companies |
| companies.csv | `output/2026-09-25-main-uk-scrape/companies.csv` | Master CSV with all companies |

---

## Run Commands

```powershell
# Fix Fusion People JobIds
cd "D:\Internship\MAIN\UK SCRAPPER"
node fix-fusion-jobids.js

# Copy fixed files to original location
cd "output\2026-09-25-main-uk-scrape\jobs company wise\fusion-people"
Copy-Item "jobs-fixed.json" -Destination "jobs.json" -Force
Copy-Item "jobs-fixed.csv" -Destination "jobs.csv" -Force

# Re-run merge to update master files
cd "D:\Internship\MAIN\UK SCRAPPER"
node merge-all-csv.js
```

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scrape-js-sites-v4.js` | Main scraper with Load More button handling |
| `fix-fusion-jobids.js` | Extract JobIds from Fusion People URLs |
| `merge-all-csv.js` | Merge all company CSVs to master files |
| `fix-leeds-locations.js` | Extract locations from job descriptions |

---

## Date Format
- Required format: **DD-MM-YYYY** (e.g., 25-09-2026)
- Cutoff date for jobs: **25-07-2026** (two months prior)
