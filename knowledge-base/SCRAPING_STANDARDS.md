# UK Job Scraping Standards & Data Quality Rules

**Version:** 1.0  
**Date:** 2026-09-25  
**Purpose:** Define quality standards for all UK job scraping projects

---

## 🚨 Critical Data Quality Rules

### 1. **SALARY RANGE - NO TIME-BASED RATES**

**❌ WRONG - Move to Description:**
```json
{
  "salaryRange": "£700 - £750 per day",
  "description": "..."
}
```

**✅ CORRECT - Annual Salaries ONLY:**
```json
{
  "salaryRange": "£55000 - £60000",
  "description": "Salary: £700 - £750 per day. This is a contract role..."
}
```

**Rules:**
- `salaryRange` field should ONLY contain **annual salaries**
- Daily rates: `£X per day` → Move to `description` field
- Hourly rates: `£X per hour` → Move to `description` field  
- Weekly rates: `£X per week` → Move to `description` field
- Annual only: `£X - £Y per annum` or `£X - £Y per year`

**Detection Pattern:**
```javascript
function isAnnualSalary(salaryText) {
  if (!salaryText) return true;
  const lower = salaryText.toLowerCase();
  
  // These indicate NON-annual rates
  if (lower.includes('per day') || lower.includes(' per day')) return false;
  if (lower.includes('per hour') || lower.includes(' per hour')) return false;
  if (lower.includes('per week') || lower.includes(' per week')) return false;
  if (lower.includes('daily') || lower.includes('hourly')) return false;
  
  // These indicate annual rates
  if (lower.includes('per annum') || lower.includes('per year')) return true;
  if (lower.includes('annual') || lower.includes('yearly')) return true;
  
  // Default: if it looks like a reasonable annual salary (£20k+), it's annual
  const numbers = salaryText.match(/£([\d,]+)/g);
  if (numbers) {
    const minSal = parseInt(numbers[0].replace(/[£,]/g, ''));
    return minSal >= 20000; // £20k+ is annual
  }
  
  return true;
}
```

---

### 2. **JOB ID - EXTRACT FROM URL, NEVER SYNTHESIZE**

**❌ WRONG - Synthetic Hash IDs:**
```json
{
  "jobId": "ML-07066fa5",
  "jobUrl": "https://www.morgan-law.com/job/head-of-internal-audit-20695/"
}
```

**✅ CORRECT - Extract from URL:**
```json
{
  "jobId": "20695",
  "jobUrl": "https://www.morgan-law.com/job/head-of-internal-audit-20695/"
}
```

**Extraction Patterns by Company:**

| Company | URL Pattern | Regex | Example JobId |
|---------|-------------|-------|---------------|
| Morgan Law | `/job/title-{NUMBER}/` | `/-(\d+)\/?$/` | `20695` |
| Morson | `/jobs/category/type/location/{SLUG}` | `/([^\/]+)\/?$/` | `retail-designer-autocad` |
| Sellick Partnership | `/job/{SLUG}/` | `/job\/([^\/]+)\/?$/` | `commissioning-manager-adult-social-care` |
| SmartEd | `/Vacancy?Id={NUMBER}` | `/Id=(\d+)/` | `41057` |
| Stannah | `/careers/jobs/{ID}` | `/jobs\/([^\/]+)\/?$/` | `REF426J` |
| New Appointments Group | `/job/{SLUG}/` | `/job\/([^\/]+)\/?$/` | Extract slug |
| Fusion People | `/job/title-{NUMBER}/` | `/-(\d+)\/?$/` | `40016` |

**Universal Extraction Function:**
```javascript
function extractJobIdFromUrl(url, companyName) {
  if (!url) return null;
  
  // Pattern 1: Query parameter ?Id=NUMBER (SmartEd)
  let match = url.match(/[?&]Id=(\d+)/);
  if (match) return match[1];
  
  // Pattern 2: /job/title-NUMBER/ (Fusion People, Morgan Law)
  match = url.match(/-(\d+)\/?$/);
  if (match) return match[1];
  
  // Pattern 3: /jobs/.../.../.../SLUG (Morson)
  match = url.match(/\/jobs\/.*\/([^\/]+)\/?$/);
  if (match) return match[1];
  
  // Pattern 4: /job/SLUG/ (Sellick, NAG)
  match = url.match(/\/job\/([^\/]+)\/?$/);
  if (match) return match[1];
  
  // Pattern 5: /jobs/ID (Stannah, others)
  match = url.match(/\/jobs\/([^\/\?]+)\/?$/);
  if (match) return match[1];
  
  // Pattern 6: Any NUMBER at end before /
  match = url.match(/\/(\d+)\/?$/);
  if (match) return match[1];
  
  // Last resort: URL hash (but this is BAD PRACTICE)
  console.warn(`⚠️ Cannot extract JobId from URL: ${url}`);
  return null;
}
```

---

### 3. **LOCATION EXTRACTION - MULTI-SOURCE**

**❌ WRONG - Empty Location:**
```json
{
  "location": "",
  "city": "",
  "description": "Head of Internal Audit, London Salary: £700 per day..."
}
```

**✅ CORRECT - Extract from Multiple Sources:**
```json
{
  "location": "London",
  "city": "London",
  "description": "Head of Internal Audit, London Salary: £700 per day..."
}
```

**Extraction Priority:**
1. **Dedicated location field on page** (highest priority)
2. **URL structure** (e.g., `/jobs/category/type/LOCATION/slug`)
3. **Description text** (regex for cities)
4. **Title text** (sometimes contains location)

**Location Extraction Function:**
```javascript
function extractLocation(jobElement, jobUrl, description, title) {
  // Priority 1: Dedicated field
  const locationField = await jobElement.locator('.location, .job-location, .vacancy-location').textContent().catch(() => '');
  if (locationField && locationField.trim()) {
    return locationField.trim();
  }
  
  // Priority 2: URL structure (Morson pattern)
  const urlMatch = jobUrl.match(/\/jobs\/[^\/]+\/[^\/]+\/([^\/]+)\//);
  if (urlMatch) {
    const urlLocation = urlMatch[1].replace(/-/g, ' ').trim();
    if (isValidCity(urlLocation)) return urlLocation;
  }
  
  // Priority 3: Description regex
  const cities = ['London', 'Birmingham', 'Manchester', 'Leeds', 'Bristol', 'Liverpool', 
                  'Glasgow', 'Edinburgh', 'Sheffield', 'Newcastle', 'Nottingham', 'Leicester',
                  'Southampton', 'Reading', 'Brighton', 'Cardiff', 'Belfast', 'Oxford', 
                  'Cambridge', 'York', 'Bath', 'Exeter', 'Plymouth', 'Coventry', 'Stoke-on-Trent'];
  
  for (const city of cities) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(description) || regex.test(title)) {
      return city;
    }
  }
  
  // Priority 4: Check for UK counties/regions
  const regions = ['Middlesex', 'Surrey', 'Kent', 'Essex', 'Hertfordshire', 'Buckinghamshire',
                   'Berkshire', 'Hampshire', 'Sussex', 'Suffolk', 'Norfolk', 'Cornwall'];
  
  for (const region of regions) {
    const regex = new RegExp(`\\b${region}\\b`, 'i');
    if (regex.test(description) || regex.test(title)) {
      return region;
    }
  }
  
  return '';
}

function isValidCity(location) {
  const validLocations = ['london', 'birmingham', 'manchester', 'leeds', 'bristol', 
                          'cardiff', 'liverpool', 'edinburgh', 'glasgow', 'sheffield'];
  return validLocations.includes(location.toLowerCase());
}
```

---

### 4. **ATS FIELD - DETECT ACTUAL ATS, NOT COMPANY NAME**

**❌ WRONG:**
```json
{
  "ats": "Morgan Law",  // This is the COMPANY name, not ATS!
  "ats": "Morson",      // Wrong!
  "ats": "Sellick Partnership"  // Wrong!
}
```

**✅ CORRECT:**
```json
{
  "ats": "Custom",      // When no recognized ATS detected
  "ats": "HiBob",       // When HiBob platform detected
  "ats": "JobTracks",   // When specific ATS detected
  "ats": "InHouse"      // When company has own custom ATS
}
```

**ATS Detection Rules:**

| Platform | Detection Pattern | ATS Name |
|----------|------------------|-----------|
| HiBob | `hibob.com` in URL | `HiBob` |
| JobTracks | `jobtracks` in URL or HTML | `JobTracks` |
| eRecruit | `erecruit` keyword | `eRecruit` |
| JobAdder | `jobadder` keyword | `JobAdder` |
| JobPage | `jobpage.io` in URL | `JobPage` |
| Custom | No standard ATS detected | `Custom` |
| In-house | Company-built system | `InHouse` |

**Detection Function:**
```javascript
function detectATS(url, pageContent) {
  // Check URL patterns
  if (url.includes('hibob.com')) return 'HiBob';
  if (url.includes('jobpage.io')) return 'JobPage';
  if (url.includes('jobadder.com')) return 'JobAdder';
  if (url.includes('erecruit')) return 'eRecruit';
  
  // Check page content for ATS signatures
  const lowerContent = pageContent.toLowerCase();
  
  if (lowerContent.includes('jobtracks')) return 'JobTracks';
  if (lowerContent.includes('powered by jobadder')) return 'JobAdder';
  if (lowerContent.includes('erecruit')) return 'eRecruit';
  
  // If company has their own careers subdomain and custom UI
  if (url.includes('careers.') || url.includes('jobs.')) {
    if (!lowerContent.includes('powered by')) {
      return 'InHouse';
    }
  }
  
  // Default to Custom when no recognized ATS
  return 'Custom';
}
```

---

## 📋 Complete Data Validation Checklist

Before saving any scraped data, validate each job entry:

```javascript
function validateJob(job) {
  const errors = [];
  
  // 1. JobId Validation
  if (!job.jobId || job.jobId.includes('-') && job.jobId.length > 15) {
    errors.push(`❌ INVALID JobId: ${job.jobId} (looks synthetic)`);
  }
  if (job.jobUrl && !job.jobUrl.includes(job.jobId)) {
    errors.push(`❌ JobId ${job.jobId} not found in URL ${job.jobUrl}`);
  }
  
  // 2. Salary Validation
  if (job.salaryRange) {
    if (job.salaryRange.toLowerCase().includes('per day') ||
        job.salaryRange.toLowerCase().includes('per hour') ||
        job.salaryRange.toLowerCase().includes('per week')) {
      errors.push(`❌ SALARY RANGE contains time-based rate: "${job.salaryRange}" - move to description`);
    }
  }
  
  // 3. Location Validation
  if (!job.location || job.location.trim() === '') {
    if (!extractLocation(null, job.jobUrl, job.description, job.title)) {
      errors.push(`⚠️ LOCATION empty - should extract from description/URL`);
    }
  }
  
  // 4. ATS Validation
  if (job.ats === job.company) {
    errors.push(`❌ ATS field equals company name "${job.ats}" - should be ATS platform name or "Custom"`);
  }
  
  // 5. Required Fields
  if (!job.title) errors.push(`❌ MISSING title`);
  if (!job.jobUrl) errors.push(`❌ MISSING jobUrl`);
  if (!job.description || job.description.length < 100) {
    errors.push(`⚠️ Description too short or missing`);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
```

---

## 🛠️ Fix Script Template

When fixing scraped data, use this template:

```javascript
const fs = require('fs');

function fixJobsData(inputPath, outputPath) {
  const jobs = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  const fixedJobs = jobs.map(job => {
    const fixed = { ...job };
    
    // Fix 1: Extract JobId from URL
    if (!fixed.jobId || fixed.jobId.includes('-')) {
      fixed.jobId = extractJobIdFromUrl(fixed.jobUrl);
    }
    
    // Fix 2: Move time-based salaries to description
    if (fixed.salaryRange && !isAnnualSalary(fixed.salaryRange)) {
      const salaryNote = `Salary: ${fixed.salaryRange}`;
      fixed.salaryRange = '';
      fixed.description = salaryNote + '. ' + fixed.description;
    }
    
    // Fix 3: Extract missing location
    if (!fixed.location || fixed.location.trim() === '') {
      fixed.location = extractLocation(null, fixed.jobUrl, fixed.description, fixed.title);
      fixed.city = fixed.location;
    }
    
    // Fix 4: Correct ATS field
    if (fixed.ats === fixed.company) {
      fixed.ats = detectATS(fixed.jobUrl, fixed.description);
    }
    
    return fixed;
  });
  
  fs.writeFileSync(outputPath, JSON.stringify(fixedJobs, null, 2));
  console.log(`✅ Fixed ${fixedJobs.length} jobs`);
}

// Usage
fixJobsData(
  'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\morgan-law\\jobs.json',
  'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\morgan-law\\jobs-fixed.json'
);
```

---

## 📊 Quality Metrics

After fixing, report these metrics:

1. **Total Jobs**: Count of all jobs
2. **Valid JobIds**: Jobs with extracted IDs (not synthetic)
3. **Valid Salaries**: Jobs with annual-only salary ranges
4. **Located Jobs**: Jobs with location data
5. **Correct ATS**: Jobs with proper ATS field (not company name)
6. **Data Completeness**: % of jobs with all required fields

---

## 🎯 Summary: Before vs After

### ❌ BEFORE (Bad Data):
```json
{
  "jobId": "ML-07066fa5",
  "salaryRange": "£700 - £750 per day",
  "location": "",
  "ats": "Morgan Law"
}
```

### ✅ AFTER (Fixed Data):
```json
{
  "jobId": "20695",
  "salaryRange": "",
  "description": "Salary: £700 - £750 per day. Head of Internal Audit...",
  "location": "London",
  "city": "London",
  "ats": "Custom"
}
```

---

**End of Standards Document**
