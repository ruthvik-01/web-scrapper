 # UK Scraping Process Documentation
 
 **Documented by:** PI-Desktop AI Agent  
 **Date:** 2026-09-25
 
 This document captures the scraping process followed for extracting UK job listings from company career pages.

## McGinnis Loy Scraper (Successful)

### Company Details
- **Company**: McGinnis Loy Associates Ltd
- **Website**: https://mcginnisloy.com/
- **ATS**: Custom WordPress-based job board

### HTML Structure Analysis

#### Job Listings Page
```html
<ul class="job_listings">
  <li class="post-34663 job_listing job-type-permanent...">
    <a href="https://mcginnisloy.com/job/accounts-assistant/">
      <div class="position">
        <h3>Accounts Assistant</h3>
      </div>
      <div class="location">Newbury</div>
      <div class="salary">£28,000 - £34,000</div>
    </a>
  </li>
</ul>
```

#### Individual Job Page
1. **Description** - Found in `<div class="job_description">` element
2. **Posted Date** - Found in JSON-LD schema:
```html
<script type="application/ld+json">
{
  "@graph": [
    {
      "@type": "WebPage",
      "datePublished": "2026-09-15T00:00:00+00:00"
    }
  ]
}
</script>
```

### Field Extraction Method

| Field | Source | Extraction Method |
|-------|--------|-------------------|
| `jobId` | `<li class="post-34663...">` | Regex: `post-(\d+)` from class attribute |
| `title` | `<h3>` in `.position` div | Direct text extraction |
| `description` | `.job_description` div | HTTP fetch individual page |
| `jobUrl` | `<a href="...">` | Extract href attribute |
| `postedDate` | JSON-LD `datePublished` | Parse JSON, format as D-M-YYYY |
| `salaryRange` | `.salary` div | Text extraction |
| `employmentType` | Job type classes | Parse `job-type-permanent`, `job-type-contract` |
| `worktype` | Job type classes | Parse `full-time`, `part-time` |
| `location/city/state/country` | `.location` div | Parse and split (e.g., "Newbury, England") |

### Date Filter Logic

```javascript
// Two-month cutoff filter
const CUTOFF_DATE = new Date('2026-07-25');

function isWithinCutoff(postedDate) {
    const date = new Date(postedDate);
    return date >= CUTOFF_DATE;
}
```

### Scraper Implementation

#### Prerequisites
```bash
npm install cheerio
```

#### Key Implementation Details

1. **Load HTML with Cheerio**
```javascript
const cheerio = require('cheerio');
const $ = cheerio.load(html);
```

2. **Extract jobId from class attribute**
```javascript
const classAttr = $(element).attr('class') || '';
const match = classAttr.match(/post-(\d+)/);
const jobId = match ? match[1] : '';
```

3. **Fetch individual job page for description**
```javascript
const https = require('https');

function fetchJobPage(jobUrl) {
    return new Promise((resolve, reject) => {
        https.get(jobUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const $ = cheerio.load(data);
                const description = $('.job_description').text().trim();
                // Extract postedDate from JSON-LD
                const jsonLd = $('script[type="application/ld+json"]').html();
                const json = JSON.parse(jsonLd);
                const postedDate = json['@graph'].find(g => g['@type'] === 'WebPage')?.datePublished;
                resolve({ description, postedDate });
            });
        }).on('error', reject);
    });
}
```

4. **Clean description (remove zero-width spaces)**
```javascript
description = description.replace(/[\u200B-\u200D\uFEFF]/g, '');
```

5. **Format date as D-M-YYYY**
```javascript
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}
```

### Output CSV Format

```csv
jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats
34663,"Accounts Assistant","McGinnis Loy Associates is proud to be working...",https://mcginnisloy.com/job/accounts-assistant/,15-9-2026,,"McGinnis Loy Associates Ltd","£28000 - £34000",Permanent,Full-time,"Newbury, England, United Kingdom","Newbury",England,United Kingdom,McGinnis Loy
```

### Results
- **Total jobs found**: 63
- **Jobs after date filter**: 3 (posted after 2026-07-25)
- **All fields populated**: ✅ jobId, title, description, jobUrl, postedDate, company, salaryRange, employmentType, worktype, location, city, state, country, ats

## Common Issues & Solutions

### Issue 1: File Locked (EBUSY)
- **Error**: `Error: EBUSY: resource busy or locked`
- **Solution**: Write to a different filename (e.g., `jobs-v3.csv`) then copy over

### Issue 2: Zero-width spaces in description
- **Problem**: `\u200b` characters appearing in descriptions
- **Solution**: Strip using regex: `description.replace(/[\u200B-\u200D\uFEFF]/g, '')`

### Issue 3: TypeScript to JavaScript conversion
- **Problem**: ts-node compatibility issues with Node v23.6.1
- **Solution**: Convert to plain JavaScript

## PowerShell Commands Reference

### Download HTML Pages
```powershell
# Using Invoke-WebRequest
Invoke-WebRequest -Uri "https://mcginnisloy.com/jobs/" -OutFile "mcginnis-loy.html"

# Using browser automation for JS-rendered sites
# (Requires Playwright for sites like Fusion People)
```

### Run Scraper
```powershell
Set-Location "D:\Internship\MAIN\UK SCRAPPER"
node output/2026-09-25-main-uk-scrape/code/scrape-mcginnis-loy-v3.js
```

## File Structure
```
output/
└── 2026-09-25-main-uk-scrape/
    ├── code/
    │   └── scrape-mcginnis-loy-v3.js
    ├── jobs company wise/
    │   └── mcginnis-loy/
    │       ├── jobs.csv
    │       └── jobs.json
    └── companies.csv
```

## Next Steps for Other Companies

### Fusion People
- **Issue**: Jobs loaded via JavaScript (not in static HTML)
- **Solution**: Requires Playwright for browser automation

### LAAT (London Academy for Applied Technology)
- **Issue**: Wrong date format in current output
- **Solution**: Parse date correctly and location splitting

### Meridial, The Independent School, E&W Recruitment
- **Status**: Pending analysis
