# Bugs Found

## 2026-08-18 - Job ID Field Formatting Inconsistency

### Description
The jobId field in JSON output files is inconsistently formatted:
- Small files (< 100KB): jobId correctly contains numeric job ID
- Large files (> 500KB): jobId incorrectly contains full job URL

### Impact
- Data quality issues in larger output files
- jobId field violates schema specification
- Makes job identification and deduplication difficult
- Affects downstream data processing

### Root Cause
Likely a logic error in the scraper implementation that handles job ID extraction differently based on file size or processing path.

### Evidence
Example of incorrect format:
```json
{
  "jobId": "https://nowoptics.hrmdirect.com/employment/job-openings.php?sort=pa&&search=true&city=-1&state=-1&city=-1&cust_sort1=-1",
  "jobUrl": "https://nowoptics.hrmdirect.com/employment/job-opening.php?req=3776261&req_loc=1413335&&cust_sort1=-1&#job"
}
```

Should be:
```json
{
  "jobId": "3776261",
  "jobUrl": "https://nowoptics.hrmdirect.com/employment/job-opening.php?req=3776261&req_loc=1413335&&cust_sort1=-1&#job"
}
```

### Affected Files
- Now Optics_jobs.json (1.82 MB)
- Stake Center Locating_jobs.json (1.88 MB)
- The Raley's Companies_jobs.json (0.58 MB)
- Team Velocity_jobs.json (0.54 MB)
- University of New Mexico Health System_jobs.json (0.35 MB)

### Status
🔧 Fix in progress