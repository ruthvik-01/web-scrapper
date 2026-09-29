# Personal Workspace and Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Windows user a selectable persistent data folder and make the individual Companies/Exports workflow, source deletion, and salary output behave as requested.

**Architecture:** Retain the existing loopback server and `FIELDWORK_DATA_DIR`. Add a Windows folder-picker and migration script that runs before launch, then make narrow UI/server and normalization changes. Historical files are never deleted or rewritten by this change.

**Tech Stack:** Windows PowerShell/command scripts, Node.js/TypeScript, plain browser JavaScript, existing Node and Playwright tests.

**Spec:** `docs/superpowers/specs/2026-09-28-personal-workspace-and-exports-design.md`

## Global Constraints

- Keep the existing legacy direct `npm run ui` data root unless `FIELDWORK_DATA_DIR` is set.
- The Windows launcher must select one per-user data root before the server starts.
- Migration copies all imports, run history, and exports, verifies them, and retains the source folder.
- Never change a location while a local Fieldwork instance is running; never overwrite a nonempty destination.
- Historical `taken` values remain on disk but cannot block selection.
- Preserve prior CSV/ZIP files; apply new salary rules to future runs only.

## Review Focus

1. Unicode and spaced Windows paths: launcher must pass the exact selected path to the server.
2. Cancel or copy failure: location setting must remain unchanged and old files intact.
3. Destination inside source (or vice versa): reject before copying to avoid recursive or ambiguous storage.
4. Source shared by two imports: deleting one source must preserve the shared company and existing output.
5. Pay with no explicit period: leave `salaryRange` empty, even if a number looks like an annual salary.

---

### Task 1: Choose and migrate the Windows data folder

**Files:** Create `Choose-Fieldwork-Location.ps1` and `Choose-Fieldwork-Location.cmd`; modify `Start-Fieldwork.cmd` and `Deployment.md`; test with `tests/location.integration.ts`.

**Interfaces:** The PowerShell script supports a native folder-picker by default and a `-Destination` argument for unattended setup/tests. A `-Read` mode prints the configured path or `%LOCALAPPDATA%\Fieldwork`. `Start-Fieldwork.cmd` reads it into `FIELDWORK_DATA_DIR` before `npm run ui`.

- [ ] Write tests for default path, a location with spaces/Unicode, successful copy and retained source, cancel, occupied/nested target, and failed copy without switching config. Use a temporary `LOCALAPPDATA` for every test.
- [ ] Run the focused test and observe the missing chooser/incorrect launch behavior.
- [ ] Implement the chooser with `System.Windows.Forms.FolderBrowserDialog`, path validation, running-instance check, copy and file verification, and atomic location-setting update. Keep the old folder. Do not use `robocopy /MIR` or any delete of the source.
- [ ] Update the launcher to read the setting, print the selected path, and use it as `FIELDWORK_DATA_DIR`; document first use and later moves.
- [ ] Run the focused test and a manual temporary-folder launch. Check direct `npm run ui` still resolves to the parent workspace.

### Task 2: Remove assignment behavior and repair source deletion

**Files:** Modify `server/app.ts`, `ui/index.html`, `ui/app.js`; update `tests/dashboard.test.ts` and `tests/imports.integration.ts` or `tests/dashboard.integration.ts`.

**Interfaces:** Keep old `State.taken` readable for historical JSON but ignore it in status and run selection. Remove/hide the `/api/companies/:id/taken` mutation. The existing `/api/sources/:id` route remains protected and unchanged unless a server-side regression is proven.

- [ ] Write a failing browser test that clicks Delete source, confirms, then sees the source disappear and exclusive companies removed; verify shared companies/output stay. Write a failing API/UI test that previously taken companies are available.
- [ ] Run those tests to confirm the event and selection failures.
- [ ] Move source deletion from the `change` handler to the `click` handler. Remove Taken filter/buttons/badges/friend copy, and ignore legacy taken state in backend selection/status. Keep old data on disk.
- [ ] Run focused tests and inspect Companies/Import dialogs for any remaining assignment copy.

### Task 3: Sort all CSV exports by their date

**Files:** Modify `ui/app.js`; test in `tests/dashboard.integration.ts` or a focused export test.

**Interfaces:** Each company export uses `summary.scrapedAt`; each dated delivery uses its `YYYY-MM-DD` folder prefix. Sort a combined display model in one comparator; existing download routes stay unchanged.

- [ ] Write a failing browser test with an older saved delivery and a newer company export; Newest puts the company CSV first, Oldest reverses. Check search still filters both.
- [ ] Run it and confirm the old two-block layout fails the newest assertion.
- [ ] Build and sort one combined export array, retaining the two card templates and download links.
- [ ] Run the focused browser test.

### Task 4: Enforce annual-only salary output

**Files:** Modify `src/normalize.ts`; test in `tests/normalize.test.ts` and `tests/extract.test.ts` if structured schema salary needs coverage.

**Interfaces:** `normalizeJobs` still returns the same 15 columns. Only explicit annual GBP numeric pay is written to `salaryRange`; hourly/daily pay is appended to the bottom of `description` with the source value.

- [ ] Write failing fixture tests for per hour, per day, weekly/monthly, DOE, unclear unit, and explicit annual terms, including structured `YEAR` and duplicate bottom-line avoidance.
- [ ] Run the tests to establish the current daily/unclear-unit failures.
- [ ] Update the pay-period classification at the existing normalization point; do not infer annual from magnitude or change source extraction interfaces.
- [ ] Run focused normalization/extraction tests and compare non-salary fields.

### Task 5: Release verification and project state

**Files:** Update `PROJECT_CONTEXT.md`, `Changelog.md`, `Sessions/2026-09-28.md`, `Decisions.md` only for verified changes; update global `MEMORY.md` per project instructions.

- [ ] Run the unit suite and browser suite. Check TypeScript diagnostics in changed files; record the known historical baseline separately.
- [ ] Use a temporary data root for import → run/export → location change → restart smoke verification. Read the existing live 37-company/five-delivery workspace without changing it.
- [ ] Inspect the final diff and report any remaining limitation. Leave unrelated staged work and dated deliveries intact.
