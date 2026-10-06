# Universal scraper audit — 5 October 2026

Status: source inventory and UK normalizer checks completed; runtime migration has not started. This directory contains audit artifacts, not a replacement scraper.

## Scope and evidence

- All 75 supplied company folders inventoried. Source scan read 1,738 repository source/test/script files outside dependencies, generated output, runs, Git and `Random`; 1,528 are company files. Company configuration/manifests and Markdown were also read. Historical deliveries were not executed or edited.
- Company files contain 201,829 lines as counted by `split(/\r?\n/)`, including tests/comments and terminal empty lines. There are 104 distinct SHA256 file contents, 1,424 repeated file instances, and 186,385 repeated lines (92.348%). These are exact-copy measurements, not semantic duplication or achieved code reduction. No runtime code has been removed.
- Mechanisms: 48 copied modular frameworks, five earlier sitemap frameworks, four legacy JEV frameworks, eight folders with Python, and ten specialized/placeholder/export-only folders. Shared code was copied for a historical standalone-delivery requirement; reuse should target maintenance, with standalone packaging generated from the shared source when required.
- Platform inventory: 30 Comeet, 20 Eploy-compatible sources/configurations (including one historical Python exporter), one Jobtrain, and 24 other/unknown/unresolved sources. Do not infer a company's ATS from all the adapters bundled in its folder. Workday/SmartRecruiters support exists in legacy modules; no supplied company is proven to use either solely from that fact.
- Inventory is lexical navigation evidence plus source review of execution paths and canonical shared mechanisms. It is not a full semantic-equivalence proof of every function or a live support certification. Per-field evidence references may be empty when a mechanism is absent or not detectable by the scanner; emptiness does not establish dead code.

## Artifacts

| Artifact | Purpose |
|---|---|
| [company-inventory.json](company-inventory.json) | Every company: config, entry/source paths, architecture, platform hypothesis, libraries, imports, missing references, per-field source references, README limitations |
| [source-evidence.json](source-evidence.json) | Source SHA256/line counts, declarations, imports, endpoint literals, mechanism evidence, exact duplicate groups |
| [uk-scope-check.md](uk-scope-check.md) | All 75 companies: UK scope decision and reason |
| [uk-scope-check.json](uk-scope-check.json) | Actual offline checks/results and exclusions |
| [uk-only-candidates.json](uk-only-candidates.json) | 45 configs eligible for further UK-only migration checks; not a production manifest |
| [migration-map.md](migration-map.md) | Every company's original entrypoint, platform evidence, proposed engine, config source and hold/candidate status |
| [design.md](design.md) | Proposed architecture, choices, migration batches and acceptance gates |
| [baseline-unit-tests.log](baseline-unit-tests.log) | Primary app unit baseline: 125 pass, zero fail |
| [baseline-app-typecheck.log](baseline-app-typecheck.log) | Primary app typecheck: exit 0 |

## Findings that affect migration

- UK check: actual normalizers from all 53 framework folders passed 15 cases each: explicit UK codes/nations, explicit UK location label, foreign country rejection including conflicting UK label, unknown city, unscoped remote, unknown location, and mixed UK/foreign locations. Total: 795 cases, zero failures. Normalizer-only proof does not test upstream parsing, geography calls, launcher execution or current source availability.
- Migration candidates: 45 (27 Comeet, 17 Eploy-compatible, one Jobtrain). Hold 30: five broken framework launchers; three Comeet identity/demo sources; four model-assisted JEV frameworks; eight historical Python sources; ten specialized/placeholder/export-only/unresolved folders. Some held implementations contain legitimate UK checks; they need further migration proof rather than being declared non-UK employers.
- `exchange-street`, `get-recruited`, `long-term-futures`, `osborne-clarke`, `tcfm`: launcher imports `../universal_scraper/src/batch.js`, while the bundled framework is inside the company folder. This is a source-resolution failure, not a reason to classify the underlying jobs as foreign. MBER also imports a missing `../universal_scraper/types` and returns a constant empty array.
- `alice`, `classiq`: documented supplied-company/board identity mismatches. `persivalenic`: documented demo/identity uncertainty. Hold even though their normalizers pass. Historical absence of UK rows on a saved board does not establish current absence.
- Legacy JEV implementations reject explicit foreign country but can establish UK from a model probability of at least 0.5; this does not satisfy the strict independent role-evidence requirement for cutover.
- SJC assigns UK with blank geography and has an inverted hardcoded cutoff comparison; Mega Centre hardcodes a known vacancy; PPG appends UK to a location; Mountain is a snapshot exporter; No35/Northwood contain dated defaults and custom place assumptions. Keep original evidence, require focused corrections/regressions before inclusion.
- Mayra's supplied source identifies a German employer and uses weak substring/city UK matching. Oliver is an identity report. PRDC/Prince folder snapshots contain no scraper; newer primary-app evidence of Prince's Hospice board is a separate identity issue, not automatic permission to invent a folder implementation.
- Older modular normalizers generate missing IDs and sometimes run-date posting fallbacks; current app requires source IDs and keeps missing source dates blank. Older location row expansion also differs from the current finalizer's one-vacancy row. Treat these as explicit policy differences in regression reports, not silent refactor changes.
- Current `AccessPolicy` centralizes pacing/robots/retries but its HTTP status retry list omits 500 and uses linear fallback delay. Browser resources are reused within a crawl, not across all company processes. `src/batch.ts` uses `outputRows` rather than the CLI/worker finalizer. Avoid claiming full pipeline parity based on older documents.
- No obsolete source has been deleted. No company scraper was run. No live vacancies were verified. Full repository typecheck/browser suite and old/new scraper comparisons were not run during this audit.

## Reproduce audit checks

From `D:/Internship/MAIN/UK SCRAPPER/web_scrapper_project`:

```powershell
node --import tsx scripts/audit-company-scrapers.ts
node --import tsx scripts/check-company-uk-scope.ts
.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.audit.json
npm.cmd run typecheck:app
npm.cmd test
```

The first two commands overwrite only this audit's generated reports. They never execute scraper entrypoints. Dependency installation/build/scrape commands for the proposed system remain design targets until implementation and regression verification.
