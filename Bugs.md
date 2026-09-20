# Bugs and limitations

## Corrected — live correctness audit, September 15, 2026

- **High priority: stale/generic structured locations override more specific visible locations.** Examples: MWH 3440/3492/3493 show Hattersley but CSV says Preston; Walker's 166 is Elgin but CSV says Aberlour; Alzheimer's Society 4153 is Merthyr Tydfil but CSV says London.
- **High priority: HTML-only multi-locations are lost.** Guide Dogs 1027 lists Leamington and Reading; CSV currently has one country-only row.
- **Coverage: blank structured country rejects verifiable UK jobs.** Of 80 country-confirmation exclusions, MWH 3462 and TSAT 1848 were independently verified as England using source postcodes. Do not assume all 80 qualify.
- **Missing worktype:** 23 MWH rows contain explicit role-specific hybrid wording but export an empty worktype.
- These confirmed cases now have regression tests and regenerated outputs. See `output/CORRECTION_REPORT.md`.

Full evidence: `output/VERIFICATION_REPORT.md`.

## Remaining source-data limitations

- Some labels describe broad areas, service regions, or ambiguous abbreviated place names. The corrected files flag these in `reason` and leave unknown city/state values empty.
- 31 records still have insufficient UK-country evidence. They remain excluded rather than being assumed UK.

## Fixed — 2026-09-15

- HTTP redirect targets could evade browser route-based robots checks. Explicit document redirect navigation now checks each target; regression tests cover allowed and disallowed chains.
- API labels and richer detail addresses could duplicate the same UK location. Enrichment now retains additional locations without repeating the same city/state.
- Custom-domain sitemaps may emit canonical ATS-hosted job URLs. Static collection now follows those explicit links and checks their robots.txt instead of silently dropping them.
- CSV consumers needed missing-data handling and zero-result explanations. The export layer now writes empty fields plus process/reason columns, following the revised user request.

## Known limitations

- Proprietary job formats, unusual pagination, login walls, or challenges may require an adapter or prevent extraction.
- Missing country confirmation is excluded intentionally. If the posted date is missing but a deadline is given, `postedDate` stays empty; only when both are missing is the current run date used, with disclosure. Malformed present dates remain excluded.
- Structured addresses are source facts, not independently geocoded or reconciled against job titles.
- No general worktype inference from descriptions has been implemented.

## 2026-09-16 — Resolved export migration inconsistencies
Fixed stale output tests, 17-column packaging checks, generated documentation, and saved exports. Mencap's prior 138-issue / zero-job run remains unresolved.

## 2026-09-16 — Fixed during batch validation
- Eploy pages without JSON-LD: extract primary detail HTML fields, ignoring related jobs/listings.
- PropertyValue identifiers: use value before name; fixes six Intercity IDs and title entities.
- Geography reprocessing: derived county/state cannot establish previously unknown UK country; regression-tested.
- Static discovery excludes Eploy application/registration URLs; API cycles and unsupported pagination are reported.
- Mencap's remaining 128 exclusions are source-country evidence gaps, not fetch failures.

## Fixed 2026-09-17 — second batch
- Mixed-board fallback company labels could contaminate requested employer scope; source-title scoping and packaging assertion added.
- Structured postcode omissions ignored explicit role Location clauses; verified clause postcodes now usable without headquarters inference.
- Hourly ph and role-salary DOE qualifiers were missed; both covered by regression tests. Separate bonus/hour numbers no longer become salary-range bounds.


## Fixed 2026-09-17 — Tower Hamlets locations
- Working-arrangement labels erased 15 role locations and produced an Office/Suffolk false match for vacancy 500. Fixed shared resolver, 16 exports corrected to source-backed London / Greater London / UK, regression tests added, previous-batch ZIP rebuilt.

