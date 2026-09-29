# Changelog

## 2026-08-18
### Added
- Initial HRMDirect job scraper implementation
- Companies input file with 13 HRMDirect entries
- Dependency installation (playwright, p-queue, typescript)
- Environment setup and configuration files
- Job scraping execution for all 13 companies
- Individual job JSON output files for each company
- Validation report documenting findings
- Project context documentation
- TODO tracking file

### Changed
- None

### Fixed
- None

### Issues Identified
- jobId field incorrectly populated with URLs instead of numeric IDs in large files
- Two target job IDs (3780813, 3726810) missing from scraped data