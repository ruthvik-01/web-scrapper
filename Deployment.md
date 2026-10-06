# Local UI setup

Requires Node.js 22+ and full dependencies including tsx. Run npm.cmd ci, npx.cmd playwright install chromium, then npm.cmd start from repository root on Windows. Use npm/npx elsewhere. Visit http://127.0.0.1:4317.

Upload company data after a fresh checkout. FIELDWORK_DATA_DIR selects the private data root; its default is the app's parent. PORT selects a loopback port and DASHBOARD_CONCURRENCY selects 1..5 workers. Windows Setup/Start/Choose-Location launchers support per-user folders.

Keep outputs when updating code. Run npm.cmd run check after source changes. See [README](README.md).
