# Generic URL and batch framework

This describes Fieldwork's reusable extraction code, not a fixed employer catalog. The delivery folder `code/universal_scraper` contains shared source for user-selected careers URLs and company wrappers.

Install dependencies/Chromium and use the URL/batch commands in README. Supply your own manifest with unique name, slug, careersUrl and optional options. employerNames/titlePrefixes constrain mixed boards using source evidence; exportCompanyName changes display identity after scoping.

Batch execution is sequential with per-company reports/checkpoints. --resume reuses matching results without refreshing them. Use new dated folders for new live extraction; manifests retain per-source location rows and evidence.

package:batch creates final.zip with a combined CSV, jobs company wise/<company>/ and code/<company>/ plus shared code/universal_scraper. Install dependencies once in the shared framework, then run the company wrappers while keeping both folders together. Dashboard code downloads instead contain a self-contained source/dependency manifest and scrape entry.

Review status/exclusions/limits. Tests and sample sources do not certify arbitrary websites.
