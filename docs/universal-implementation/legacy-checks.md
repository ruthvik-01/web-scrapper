# Remaining broad-check classification

Fresh `npm run typecheck`: 67 errors, all **UNRELATED LEGACY**, in historical one-off scripts:

| Script | Errors | Purpose |
|---|---:|---|
| fix-rodericks-quality.ts | 23 | Historical Rodericks correction |
| package-four-2026-09-28.ts | 1 | Dated delivery packaging |
| regenerate-master.ts | 1 | Historical master regeneration |
| relabel-company-labels.ts | 2 | Historical company-label correction |
| scrape-prince-of-wales-24-9-26.ts | 4 | Held company's historical scrape |
| test-batch2-companies.ts | 2 | Legacy ad hoc scrape check |
| test-one-by-one.ts | 1 | Legacy ad hoc scrape check |
| test-rodericks-fix.ts | 17 | Legacy Rodericks ad hoc check |
| verify-package-24-9-26.ts | 16 | Dated delivery verification |

The universal CLI, collectors, server and package runtime entrypoints do not import these scripts. `tsconfig.build.json` selects `universal.ts` and `src/**/*.ts`; `tsconfig.app.json` checks the relevant app/server/tests. Both pass. Broad `tsconfig.json` also includes every historical script, exposing strict indexing/optional-value errors. Those errors do not prevent universal execution, its build, or the normal unit/UK/fixture suites. No historical script was executed or rewritten. Full diagnostics: [completion-full-typecheck.log](completion-full-typecheck.log).

Fresh browser suite: **47/48 pass**. `tests/dashboard.integration.ts:76` expects the literal folder `2026-09-10-verified` in the oldest card. `ui/app.js` intentionally renders `deliveryDay(delivery.name)` as `10 Sept 2026`; the card is correctly selected after sorting. This fixture contains only its own old delivery and Acme company output, with no universal data. The mismatch is **UNRELATED LEGACY** presentation/assertion behavior, not a schema/company/location regression. UI/test unchanged; [failure log](completion-integration.log).

A separate real integration gap was fixed: universal output previously used an undiscovered default folder and lacked combined JSON. Complete runs now write dated shared-root CSV/JSON datasets, and dashboard listing/download routes admit only the explicit universal filename pattern. New tests verify actual CLI generation → UK-only15-column files → dashboard list/count → HTTP CSV download, plus partial runs remaining unlisted. Traversal and existing delivery tests remain protected.
