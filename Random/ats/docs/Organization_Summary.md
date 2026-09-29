# Project Organization Summary

## Folder Structure

```
.
├── backup/                        # Backup files
│   ├── Eddy County_jobs.backup.json
│   └── FranklinCovey_jobs.backup.json
├── data/                          # Input data files
│   ├── companies.json             # List of companies to scrape
│   └── test_companies.json        # Test company data
├── docs/                          # Documentation
│   ├── analysis/                  # Analysis documents
│   │   └── Final_Analysis.md      # Final analysis and recommendations
│   ├── logs/                      # Log files (empty)
│   ├── reports/                   # Validation and summary reports
│   │   ├── Session_Summary.md     # Session summary
│   │   └── Validation_Report.md   # Detailed validation findings
│   ├── Bugs.md                    # Documented bugs
│   ├── Changelog.md               # Version history
│   ├── Decisions.md               # Architectural decisions
│   ├── PROJECT_CONTEXT.md         # Current project snapshot
│   └── TODO.md                    # Task tracking
├── output/                        # Scraped job data output
│   ├── Allevio Care_jobs.json
│   ├── Atlas Technical Consultants_jobs.json
│   ├── Carriage Services_jobs.json
│   ├── Data Device Corporation_jobs.json
│   ├── Eddy County_jobs.json
│   ├── FranklinCovey_jobs.json
│   ├── Now Optics_jobs.json
│   ├── Sevan Multi-Site Solutions_jobs.json
│   ├── Stake Center Locating_jobs.json
│   ├── Team Velocity_jobs.json
│   ├── The Raley's Companies_jobs.json
│   └── University of New Mexico Health System_jobs.json
├── scripts/                       # Utility scripts
│   ├── investigate_missing_jobs.js # Check for missing job IDs
│   ├── investigate_missing_jobs.ts # TypeScript version
│   ├── rescrape_test.ps1          # PowerShell rescraping test
│   └── rescrape_test.sh           # Bash rescraping test
├── sessions/                      # Session logs
│   └── 2026-08-18.md              # Daily session log
├── src/                           # Source code
│   ├── dist/                      # Compiled JavaScript files
│   │   └── scraper.js             # Compiled scraper
│   └── scraper.ts                 # Main scraper implementation
├── tests/                         # Test files (empty)
├── HRMDirect ats.md               # Original requirements
├── package-lock.json              # NPM lock file
├── package.json                   # NPM package file
├── README.md                      # Project documentation
└── tsconfig.json                  # TypeScript configuration
```

## Organization Benefits

1. **Clear Separation of Concerns**:
   - Source code in `src/`
   - Data files in `data/`
   - Output files in `output/`
   - Documentation in `docs/`

2. **Easy Navigation**:
   - Related files grouped together
   - Consistent naming conventions
   - Logical folder hierarchy

3. **Maintainability**:
   - Backup files separated
   - Test scripts in dedicated folder
   - Session logs organized by date

4. **Scalability**:
   - Structure supports future growth
   - Easy to add new components
   - Clear paths for automation