# Local Fieldwork setup

Requires Node.js 22+ and full npm dependencies, including tsx. From repository root, run `npm.cmd ci`, `npx.cmd playwright install chromium`, then `npm.cmd start` on Windows PowerShell. Use npm/npx equivalents elsewhere. Visit http://127.0.0.1:4317.

There is no build or production-only catalog install. Fresh checkouts need a spreadsheet upload or optional default workbook to populate companies. FIELDWORK_DATA_DIR selects the dashboard data root; its default is the app's parent. PORT selects a loopback port; DASHBOARD_CONCURRENCY selects 1..5 company workers.

The Windows Setup/Start/Choose-Location launchers support per-user data folders. Preserve outputs while updating source. Run `npm.cmd run check` to validate retained TypeScript and fixtures. See [README](README.md) for URL/batch/packaging examples.
