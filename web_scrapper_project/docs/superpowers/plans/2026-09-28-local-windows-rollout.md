# Local Windows Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give about 20 Windows users independent local Fieldwork installs, with both backend and frontend on each computer and private data under each Windows account.

**Architecture:** Keep the existing loopback Node server, browser UI, JSON state, and scraper workers. Add an explicit data-root environment variable and two Windows scripts for one-time setup and everyday startup. Preserve the current parent-workspace data root for direct `npm run ui` launches; new Windows launches set `%LOCALAPPDATA%\Fieldwork`.

**Tech Stack:** Node.js 22+, TypeScript, PowerShell or Windows command scripts, Playwright Chromium, existing Node test runner and browser integration tests.

**Spec:** `docs/superpowers/specs/2026-09-28-local-windows-rollout-design.md`

## Global Constraints

- Backend and frontend run on each Windows computer and bind only to `127.0.0.1`.
- Fresh installs use `%LOCALAPPDATA%\Fieldwork`; direct legacy `npm run ui` retains the current parent-workspace data root.
- Keep existing JSON state, output folder structure, one active batch, and default concurrency one.
- Setup may use the internet once for `npm ci` and Playwright Chromium; Node.js 22+ is a prerequisite.
- Never move, delete, or overwrite the current workspace's imported companies or dated deliveries.
- No shared server, application login, database, or automatic data migration.

## Review Focus

1. Missing `LOCALAPPDATA`: the Windows launcher exits with a useful error rather than writing beside the app.
2. Unwritable data folder: startup fails before listening and prints the attempted folder.
3. Existing Fieldwork on port 4317: a second launch opens the existing local UI and does not start a second writer.
4. Different program on port 4317: launch reports a port conflict and does not open that program as Fieldwork.
5. Restart or update: the user's imported companies and outputs remain in the user-data folder, separate from code.

---

### Task 1: Select an explicit per-user data root while preserving legacy data

**Files:**
- Create: `server/runtime.ts` — pure data-root resolution and writable-directory check.
- Modify: `server/main.ts` — use the resolver before `createDashboard`.
- Test: `tests/runtime.test.ts` — path selection and startup errors.
- Test: `tests/dashboard.test.ts` — two data roots remain isolated and one persists after restart.

**Interfaces:**
- Consumes: `createDashboard({ root, dataRoot, runConcurrency })` from `server/app.ts`.
- Produces: `resolveDataRoot(projectRoot: string, configured: string | undefined): string` and `prepareDataRoot(path: string): Promise<void>` for `server/main.ts`.

- [ ] **Step 1: Write failing path and isolation tests.**

```ts
assert.equal(resolveDataRoot(projectRoot, undefined), resolve(projectRoot, ".."));
assert.equal(resolveDataRoot(projectRoot, "C:/Users/A/AppData/Local/Fieldwork"), resolve("C:/Users/A/AppData/Local/Fieldwork"));
const blocked = join(tempRoot, "not-a-directory");
await writeFile(blocked, "occupied");
await assert.rejects(prepareDataRoot(blocked), /not-a-directory/);
// Start two dashboard fixtures with distinct dataRoot directories; import into A,
// then assert B has zero imported companies. Close and reopen A; assert its import remains.
```

- [ ] **Step 2: Run the focused tests and confirm the new cases fail.**

Run: `npx tsx --test tests/runtime.test.ts tests/dashboard.test.ts`
Expected: new resolver import or assertions fail before implementation.

- [ ] **Step 3: Add the minimum resolver and wire it into startup.**

```ts
// server/runtime.ts
export const resolveDataRoot = (projectRoot: string, configured?: string) =>
  resolve(configured || resolve(projectRoot, ".."));
export async function prepareDataRoot(path: string) {
  await mkdir(path, { recursive: true });
  await access(path, constants.R_OK | constants.W_OK);
}
// server/main.ts
const dataRoot = resolveDataRoot(root, process.env.FIELDWORK_DATA_DIR);
await prepareDataRoot(dataRoot);
```

Catch the filesystem error in `server/main.ts` and include the data-root path in the startup message. Keep `createDashboard`'s current containment checks.

- [ ] **Step 4: Re-run focused tests and confirm they pass.**

Run: `npx tsx --test tests/runtime.test.ts tests/dashboard.test.ts`
Expected: all tests pass; no file from root A appears in root B.

- [ ] **Step 5: Commit only Task 1 files.**

Run: `git commit --only -m "feat: support per-user Fieldwork data root" -- web_scrapper_project/server/runtime.ts web_scrapper_project/server/main.ts web_scrapper_project/tests/runtime.test.ts web_scrapper_project/tests/dashboard.test.ts`

### Task 2: Add Windows setup and local launcher

**Files:**
- Create: `Setup-Fieldwork.cmd` — one-time dependency and browser installation.
- Create: `Start-Fieldwork.cmd` — set the per-user data root and start the local app.
- Modify: `server/main.ts` — browser opening and duplicate-port behavior after listening.
- Test: `tests/local-launch.integration.ts` — fresh data-root start and duplicate launch behavior.
- Modify: `Deployment.md` — Windows setup, start, updates, and data location.

**Interfaces:**
- Consumes: `FIELDWORK_DATA_DIR` from Task 1.
- Produces: `FIELDWORK_OPEN_BROWSER=1` for the launcher; direct `npm run ui` leaves browser opening off.

- [ ] **Step 1: Write failing launch checks.**

```ts
// Reserve a free TCP port with a temporary server, close it, then launch
// server/main.ts with FIELDWORK_DATA_DIR=tempA and PORT=that port.
// GET /api/dashboard must report zero companies. Launch again on the same
// port and assert the original server still answers and tempA has one state file.
// Run Start-Fieldwork.cmd with LOCALAPPDATA removed from its environment;
// assert it exits before starting the server and names LOCALAPPDATA.
// Bind an unrelated server on a second port; Fieldwork must exit with a
// conflict message and must not open a browser for that program.
```

- [ ] **Step 2: Run the launch test and confirm the new assertions fail.**

Run: `npx tsx --test tests/local-launch.integration.ts`
Expected: duplicate-port handling or startup-path assertions fail.

- [ ] **Step 3: Add setup and start scripts with explicit checks.**

```bat
:: Setup-Fieldwork.cmd, from the project directory
@echo off
cd /d "%~dp0"
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)" || (echo Node.js 22 or newer is required.& exit /b 1)
call npm ci || exit /b 1
call npx playwright install chromium || exit /b 1
echo Setup complete. Run Start-Fieldwork.cmd.
```

```bat
:: Start-Fieldwork.cmd, from the project directory
@echo off
cd /d "%~dp0"
if not defined LOCALAPPDATA (echo LOCALAPPDATA is unavailable.& exit /b 1)
if not defined FIELDWORK_DATA_DIR set "FIELDWORK_DATA_DIR=%LOCALAPPDATA%\Fieldwork"
if not exist node_modules\tsx (echo Run Setup-Fieldwork.cmd first.& exit /b 1)
node -e "const fs=require('fs'),p=require('playwright');if(!fs.existsSync(p.chromium.executablePath()))process.exit(1)" || (echo Chromium is missing. Run Setup-Fieldwork.cmd.& exit /b 1)
set "FIELDWORK_OPEN_BROWSER=1"
call npm run ui
```

In `server/main.ts`, open `http://127.0.0.1:<port>/` through the Windows default browser only after the server listens, when `FIELDWORK_OPEN_BROWSER=1`. Always print the URL first, so a browser-opening error still leaves a usable local address. On `EADDRINUSE`, request `/api/dashboard` at that loopback address and verify the expected Fieldwork payload (`token`, `companies`, `stats`) before opening it; otherwise print a port-conflict error. Never bind to a non-loopback address.

- [ ] **Step 4: Run the launch test and setup smoke check.**

Run: `npx tsx --test tests/local-launch.integration.ts`
Run: `Setup-Fieldwork.cmd` on the development machine only when setup dependencies are missing; otherwise check `node --version`, `npm ci --dry-run`, and the Playwright browser installation before `Start-Fieldwork.cmd` with a temporary `FIELDWORK_DATA_DIR`.
Expected: local UI and API load; no second writer; missing `LOCALAPPDATA`, dependencies, or Chromium names the failed step. A non-Fieldwork port conflict never opens a browser.

- [ ] **Step 5: Document updates and verify the existing workspace.**

Add to `Deployment.md`: first-time setup, daily start, `%LOCALAPPDATA%\Fieldwork`, explicit legacy `FIELDWORK_DATA_DIR`, code-only updates, and a warning that each Windows account has private data. Run the live legacy dashboard read-only and confirm its imported company count and dated deliveries are unchanged.

- [ ] **Step 6: Commit only Task 2 files.**

Run: `git commit --only -m "feat: add Windows local setup and launcher" -- web_scrapper_project/Setup-Fieldwork.cmd web_scrapper_project/Start-Fieldwork.cmd web_scrapper_project/server/main.ts web_scrapper_project/tests/local-launch.integration.ts web_scrapper_project/Deployment.md`

### Task 3: Verify release behavior

**Files:**
- Modify: `PROJECT_CONTEXT.md`, `Changelog.md`, `Sessions/2026-09-28.md` — record the final verified state only.

**Interfaces:**
- Consumes: all Task 1 and Task 2 startup paths.
- Produces: a release-ready local install procedure and evidence for the 20-user rollout.

- [ ] **Step 1: Run focused automated checks.**

Run: `npm test`
Run: `npm run test:browser`
Expected: new isolation/launcher checks and existing scraper/dashboard checks pass.

- [ ] **Step 2: Run a fresh-profile smoke test.**

Start with a temporary `FIELDWORK_DATA_DIR`, upload a small fixture workbook, restart the app, and verify the same companies and outputs return. Confirm the existing legacy launch still shows its prior data. Do not modify existing dated deliveries.

- [ ] **Step 3: Inspect the rollout diff and update project context.**

Check that only runtime, launcher, test, and deployment files changed for this feature; record the tested commands and any remaining limitation in the project notes. Do not broaden this task to unrelated typecheck errors in historical scripts.
