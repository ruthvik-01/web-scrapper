# Fieldwork UI decisions

- UI-based company imports/selections are the product entry point.
- Preserve the shared public ATS/static/DOM engine and request safeguards needed by UI workers.
- Require confirmed UK geography, current source-date rules, empty missing values and NHS source exclusion.
- Keep diagnostics in reports and gate CSV downloads with export quality checks.
- Store company data/history locally and keep generated datasets/credentials out of Git.
- Generated company code remains a UI download feature; it must install and typecheck independently.
