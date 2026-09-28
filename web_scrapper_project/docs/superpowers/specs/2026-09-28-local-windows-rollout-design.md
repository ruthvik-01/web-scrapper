# Fieldwork local Windows rollout design

Date: 2026-09-28
Status: proposed for user review

## Goal

Make Fieldwork practical for about 20 people, each using a private copy on a Windows computer. Each person's backend and frontend run on that computer. Imports, settings, runs, logs, and exports remain under that Windows account. Preserve the existing workspace and its dated deliveries on the current computer.

## Scope and constraints

- Keep the existing Node server and browser frontend. The server serves both the UI and API from `127.0.0.1`; no central Fieldwork service is introduced.
- Require a one-time setup with internet access to install Node dependencies and Playwright Chromium. Node.js 22 or newer must already be installed; setup reports how to obtain it if absent.
- Keep one active batch per local instance and the default company concurrency of one. Twenty independent computers do not share a process or scrape queue.
- Keep the existing JSON state and per-company output layout for each local instance. A shared database and application login are outside this local-only design.
- Do not expose the server beyond loopback or through a reverse proxy. Windows account separation protects each user's local data; this design does not add encryption or access control between people sharing one Windows account.

## Options considered

1. **Chosen: local browser app per Windows user.** Smallest change to the working product. The existing server serves the frontend, and each user has an independent data directory.
2. Desktop wrapper around the local server. Provides a dedicated window but adds packaging, update, and browser-runtime work without changing extraction behavior.
3. Shared hosted server. Needs authentication, tenant isolation, durable shared storage, and a global worker queue, and conflicts with the requested local execution.

## Components and data flow

### Data root

`server/main.ts` accepts an explicit `FIELDWORK_DATA_DIR`. The new Windows launcher defaults it to `%LOCALAPPDATA%\Fieldwork` for the current Windows account and creates that directory before startup. The dashboard continues to read and write `output/_tracking/ui-state.json`, `output/_imports`, and `output/<company>/runs/...` beneath its data root. A fresh data root starts with an empty company directory; users import their workbook through the existing UI.

Direct `npm run ui` without `FIELDWORK_DATA_DIR` keeps today's parent-workspace data root so this computer's 37 imported companies and previous deliveries do not move or disappear. The launcher supports an explicit data-root override for an existing workspace. No automatic migration or deletion occurs.

### Setup and start

A Windows setup script runs from the project folder, checks Node.js version, installs locked dependencies with `npm ci`, and installs Playwright Chromium. It stops with a specific message if a step fails. A Windows start script chooses the per-user data root, starts the existing server on loopback, waits for a successful local response, and opens the URL in the default browser. A duplicate start on the same port reports the existing local address instead of starting another writer.

The source folder can be updated independently of `%LOCALAPPDATA%\Fieldwork`; updates must not overwrite user data. Setup can be rerun after an update. The UI's existing upload and scrape features remain unchanged.

### Resource use

Each machine runs only its own scraper workers. The default one-company concurrency remains, preventing a single local batch from launching multiple browsers unless explicitly configured. Existing import size limits, request limits, per-company log caps, and 50-run history cap remain in place. The local UI's polling does not create load on another user's machine.

## Failure behavior

- Missing or old Node.js, failed dependency installation, or missing Chromium: setup or start reports the specific missing requirement and stops.
- Port already in use by Fieldwork: open the running local UI. Port in use by another program: report the port conflict without changing data.
- Data directory unavailable or unwritable: stop before starting the server and name the directory.
- Browser fails to open: print the local URL so the user can open it manually; the backend remains available.
- A scrape or import fails: retain existing dashboard behavior and per-company reports. One user's failure has no effect on another machine.

## Verification

1. Use two temporary data roots. Import a workbook into one and verify the other stays empty.
2. Restart the first local app and verify its imports, settings, and run history persist.
3. Check that the current legacy launch still shows the existing company directory and dated deliveries without moving files.
4. Exercise the Windows setup/start path with a fresh temporary data root; confirm the UI and API load on loopback, workbook upload works, and a fixture scrape completes.
5. Run focused dashboard/import/worker browser tests and ensure the UI remains within the viewport at existing desktop and mobile test sizes.

## Rollout

Distribute the same project release to each Windows user. Each user runs setup once and then starts Fieldwork locally. Give users an update package that replaces code while leaving `%LOCALAPPDATA%\Fieldwork` alone. Existing data on the current computer stays at its present path until the owner explicitly chooses to migrate it.
