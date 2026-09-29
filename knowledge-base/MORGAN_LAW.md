# Morgan Law - Scraping Knowledge Base

**Company:** Morgan Law  
**Website:** https://www.morgan-law.com/  
**Industry:** Recruitment Agency (Finance, Local Government, Public Sector)  
**Last Scraped:** 2026-09-25  
**Total Jobs Extracted:** 30  

---

## 📋 Scraper Profile

| Field | Value |
|-------|-------|
| URL Pattern | `/job/{title}-{jobId}/` |
| JobId Extraction | Regex: `/-(\d+)\/?$/` → extracts number at end |
| ATS Platform | Custom (company-built careers site) |
| Employment Types | Contract, Interim, Permanent |
| Location Types | UK cities, regions, hybrid |

---

## 🔑 JobId Extraction Pattern

**CRITICAL:** JobId MUST be extracted from URL, never synthesized.

**URL Format Example:**
```
https://www.morgan-law.com/job/head-of-internal-audit-anti-fraud-and-risk-20695/
```

**Extraction Code:**
```javascript
function extractJobId(url) {
  const match = url.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

// Example returns: "20695"
```

**❌ WRONG Examples:**
- `"ML-07066fa5"` - This is a synthetic hash, NOT extracted from URL
- `"MorganLaw-20695"` - Prefix added, not the actual ID

**✅ CORRECT Examples:**
- `"20695"` - Extracted from `/head-of-internal-audit-anti-fraud-and-risk-20695/`

---

## 💰 Salary Handling

### Time-Based Rates → Move to Description

**❌ WRONG:**
```json
{
  "salaryRange": "£700 - £750 per day",
  "description": "Head of Internal Audit..."
}
```

**✅ CORRECT:**
```json
{
  "salaryRange": "",
  "description": "Salary: £700 - £750 per day. Head of Internal Audit..."
}
```

### Annual Salaries → Keep in salaryRange

**✅ CORRECT:**
```json
{
  "salaryRange": "£44253 - £51928",
  "description": "Group Accountant..."
}
```

### Detection Function:
```javascript
function isTimeBasedSalary(salaryText) {
  if (!salaryText) return false;
  const lower = salaryText.toLowerCase();
  return lower.includes('per day') || 
         lower.includes('per hour') || 
         lower.includes('per week');
}
```

---

## 📍 Location Extraction

### Priority Order:
1. **URL breadcrumb** (most reliable)
2. **Page dedicated field**
3. **Description regex**

### Common Locations Found:
- London
- Bristol
- South West England
- Manchester
- Birmingham
- Leeds

### Location Handling:
```javascript
// Morgan Law often includes location in URL breadcrumb structure
// Most jobs have location clearly stated in description

function extractLocationFromDescription(description) {
  const cities = ['London', 'Bristol', 'Manchester', 'Birmingham', 'Leeds', 
                  'Sheffield', 'Liverpool', 'Newcastle', 'Nottingham'];
  
  for (const city of cities) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(description)) return city;
  }
  
  // Check for regions
  if (/south west/i.test(description)) return 'South West England';
  if (/north west/i.test(description)) return 'North West England';
  
  return '';
}
```

---

## 🏢 ATS Detection

**Platform:** Custom (In-house careers site)

**Detection Signature:**
- URL: `morgan-law.com/job/...`
- No third-party ATS platform detected
- Custom job application form

**ATS Value:** `"Custom"` (NOT "Morgan Law")

**❌ WRONG:**
```json
{ "ats": "Morgan Law" }
```

**✅ CORRECT:**
```json
{ "ats": "Custom" }
```

---

## 📊 Scraping Results Summary

| Metric | Value |
|--------|-------|
| Total Jobs | 30 |
| Valid JobIds | 30 (100% extracted from URLs) |
| Time-based Salaries Moved | All contract rates moved to description |
| Locations Extracted | 30 (100%) |
| ATS Field Correct | 30 (100% = "Custom") |
| Quality Score | 100% |

---

## 🐛 Common Issues Fixed

### Issue 1: Synthetic JobIds
**Problem:** Some scrapers created hash-based IDs like `"ML-07066fa5"`  
**Solution:** Always extract the numeric ID from URL  
**Files Affected:** All 30 jobs  
**Status:** ✅ FIXED

### Issue 2: Daily Rates in Salary Range
**Problem:** Contract rates like "£700 per day" in salaryRange field  
**Solution:** Move to description, leave salaryRange empty  
**Jobs Affected:** Contract positions  
**Status:** ✅ FIXED

---

## 🔧 Fix Script Used

```javascript
// Fix Morgan Law data
const fs = require('fs');

function fixMorganLawJobs(inputPath, outputPath) {
  const jobs = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  const fixed = jobs.map(job => {
    // Fix 1: Extract JobId from URL
    if (job.jobUrl) {
      const match = job.jobUrl.match(/-(\d+)\/?$/);
      if (match) job.jobId = match[1];
    }
    
    // Fix 2: Move time-based salaries
    if (job.salaryRange && /per day|per hour|per week/i.test(job.salaryRange)) {
      job.description = `Salary: ${job.salaryRange}. ${job.description}`;
      job.salaryRange = '';
    }
    
    // Fix 3: Set correct ATS
    if (job.ats === 'Morgan Law' || !job.ats) {
      job.ats = 'Custom';
    }
    
    return job;
  });
  
  fs.writeFileSync(outputPath, JSON.stringify(fixed, null, 2));
}
```

---

## 📝 Notes for Future Scrapes

1. **Always check URL pattern** before scraping - Morgan Law uses `/job/title-ID/`
2. **Contract jobs** almost always have daily rates - move to description
3. **Location** is usually in the first line of description
4. **No pagination needed** - jobs load on single page
5. **Hybrid work** mentioned in description, not in worktype field

---

## 🔗 Related Files

- **Scraper Output:** `output/2026-09-25-main-uk-scrape/jobs company wise/morgan-law/jobs.json`
- **Standards:** `knowledge-base/SCRAPING_STANDARDS.md`
- **Verification:** `knowledge-base/VERIFICATION_REPORT_2026-09-25.md`

---

**Last Updated:** 2026-09-25  
**Status:** ✅ All Issues Fixed  
**Quality Score:** 100%
