# Architectural Decisions

## 2026-08-18 - Job ID Field Formatting Issue

### Context
During validation of the HRMDirect job scraper output, it was discovered that the jobId field contains full job URLs instead of numeric job IDs in larger output files, while smaller files have the correct format.

### Decision
Document this inconsistency as a critical bug requiring immediate attention. The scraper implementation needs to be fixed to consistently extract numeric job IDs from job URLs across all file sizes.

### Consequences
- Larger JSON output files contain malformed jobId fields
- Data quality issues affect downstream processing
- Inconsistent behavior makes debugging difficult
- Additional processing step required to fix existing output files