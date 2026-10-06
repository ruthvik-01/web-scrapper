# Universal UK Scraper Implementation Plan

> Execute inline with TDD. User approved `docs/universal-audit/design.md` and explicitly instructed START NOW. Preserve the current workspace's uncommitted engine fixes; no commit, push, historical delivery rewrite or old scraper deletion.

**Goal:** A working configuration-driven UK-only runner for exactly 45 audited candidates, with 30 holds, fixed-fixture comparisons and honest live reports.
**Architecture:** Reuse existing Comeet, sitemap/static Eploy and Jobtrain collectors. Compose a small registry, validated catalog, company scoping, UK/NHS gate and existing finalizer. Retain source evidence and original implementations.
**Stack:** Node >=22, strict TypeScript, existing Cheerio/Playwright/tsx; no new dependencies.
**Spec:** `docs/universal-audit/design.md` and the user's implementation attachment.

## Tasks and verification

1. Catalog/foundation: create `config/companies.json` and `config/companies-held.json` from frozen audit scope; implement `src/companies.ts`, `src/platforms.ts`, `src/uk-scope.ts`, `src/universal.ts`. `tests/universal.test.ts` first fails on missing modules, then proves 45/30 scope, registry dispatch, reject held/unknown/invalid/duplicate configs, source-employer filtering before rename, UK/foreign/unknown/mixed locations, NHS jobs and partial/error/empty runs. Preserve zero-date and location evidence through finalization.
2. Platform composition/transport: Comeet delegates to current `scrapeComeet`, Eploy uses explicit sitemap when present and current strategy otherwise, Jobtrain uses current collector. Keep source-compatible tenant/selector/time options. Transport tests first prove NHS redirect prevention and HTTP500 retry failure, then add NHS guards to existing AccessPolicy/DOM routing, centralized status list and bounded exponential Retry-After handling. No generic model-driven UK acceptance.
3. CLI/output: add `universal.ts`, npm scripts and production build tsconfig. Commands support `--company`, `--all`, `--list`, `--out` and explicit request/time budgets. Timestamped non-overwriting runs, JSON/report retained per company, CSV only complete/quality-ready; sequential runs isolate errors. Test actual CLI and registry collections on HTTP fixtures, including sitemap and Jobtrain pagination.
4. Regression: implement `src/scraper-comparison.ts` and `scripts/compare-scrapers.ts` for machine-readable identity/field/missing/duplicate differences with EXPECTED/UNKNOWN and strict failure exit for unexplained changes. Execute actual old collectors from all 45 candidate folders against identical mocked HTML/XML/job-card sources and time; compare with actual universal collectors, classify current source-date/geography/multi-location corrections explicitly. Never execute historical launchers/output writers. Preserve source counts/IDs and all source fields. Protect 795 original UK cases and primary UK gate cases.
5. Live: execute representative Comeet/Eploy/Jobtrain with explicit bounded budgets and paced requests, save all reports under ignored new output. Report ok/no_matches/partial/blocked/unavailable without attributing offline fixture rows to live vacancies. A source/network limit is a live limitation, never a passing company. Per-company matrix carries implementation/offline/live status separately; never cut over/delete originals without user migration approval.
6. Verify/document: narrow tests after each change, then app typecheck, build, all unit/integration tests, 795 audit cases and fixed-fixture comparisons. Run full typecheck once and disclose unrelated failures. Produce full 75-company matrix (MIGRATE/HOLD/UNKNOWN), blockers/remedies, code/file before/after counts and every created/modified/deleted path. Update README/current context/changelog and daily topic/index.

## Review focus

- A configured country cannot establish UK for an unknown role; foreign source country wins over resolved evidence.
- Group-board fallback identity cannot pass employerNames; display override happens only after scope filtering.
- An NHS target is denied before robots/document request, including redirected and DOM requests.
- Empty or partial extraction retains diagnostics and never reports a complete successful export.
- Different companies may have the same vacancy ID; output validation remains per-company before combined output.

## Execution ledger

- Plan created; prior audit baseline 125 unit tests and app typecheck passed. Implementation checks will record fresh results in the shared daily topic and final report.
