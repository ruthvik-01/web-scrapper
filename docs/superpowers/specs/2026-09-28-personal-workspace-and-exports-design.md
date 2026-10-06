# Personal workspace and export cleanup

Date: 2026-09-28

## Purpose

Fieldwork is an individual Windows scraper. Each user chooses where all of their imports, run history, and exports live. The directory remains private to that Windows account and survives code updates. The Companies and Exports screens should reflect individual work rather than shared assignments.

## Data location

Keep the existing `FIELDWORK_DATA_DIR` runtime boundary. Add a Windows folder-picker command beside the launcher. The chooser runs while Fieldwork is stopped, shows the current data folder, and lets the user choose a different empty folder. It copies the current data tree to the new folder, verifies the copy, retains the old tree, then saves a small per-user location setting under `%LOCALAPPDATA%\Fieldwork`. The everyday launcher reads this setting and passes the selected folder to `FIELDWORK_DATA_DIR`; first-time installs still default to `%LOCALAPPDATA%\Fieldwork`. A canceled picker leaves the setting and data untouched. Reject the same/nested folder, an occupied destination, a failed copy, or a running local Fieldwork instance before switching. The selected path is displayed when starting. Direct developer `npm run ui` continues to use the legacy parent workspace unless `FIELDWORK_DATA_DIR` is explicitly set.

The browser remains a localhost frontend. It does not attempt to read arbitrary Windows folders or change the live data root while the server is running. The launcher exposes the choice through a native Windows folder picker, so a restart is implicit.

## Companies and sources

Remove the Taken filter, assignment hints, Taken badges, and mark-as-taken controls. All companies remain eligible for selection, including those with a historical `taken` flag. Historical state may remain on disk for compatibility but is ignored by current selection/status logic. Keep existing runs and exports.

The source-delete button must handle a click. It continues to request confirmation and call the existing protected `/api/sources/:id` route. The server removes that import record and companies exclusive to it while retaining shared companies, runs, and files. The current source filter resets to All sources after success. The default workbook source remains non-deletable.

## Exports

Build one list of company CSV exports and saved dated delivery CSVs, then sort all entries together for Newest first/Oldest first. Company entries use their latest run's `scrapedAt`. Dated deliveries use their date-prefixed folder name, with a stable name tie-breaker. Search filtering applies to both kinds before sorting. Downloads still point to their existing routes and files.

## Salary contract

`salaryRange` contains a numeric GBP amount/range only when the source explicitly marks it per year (annual, annually, yearly, per annum, per year, `/year`, `pa`, or structured `YEAR`). Hourly, daily, weekly, monthly, DOE, and unclear-unit pay leave `salaryRange` empty. When source pay is hourly or daily, append a `Salary: <source pay>` line to the bottom of the description without dropping the original role text. Avoid an identical duplicate line when it is already the final description line. Existing files are preserved; new runs use the rule.

## Verification

1. A Windows user changes location with the picker: data, imports, runs, and exports appear after restart; the prior folder remains intact. Cancel, nonempty target, nested target, running server, and failed-copy cases do not switch the setting.
2. A previously Taken company can be selected and scraped; no friend/assignment language remains in the UI.
3. A browser click deletes an uploaded source, removes only exclusive companies, and leaves shared companies and past outputs. Default source cannot be deleted.
4. Newest sorting places the most recently scraped company CSV ahead of older dated deliveries; Oldest reverses the order.
5. Hourly and daily fixture pay appears at the bottom of descriptions and never in `salaryRange`; explicit annual GBP stays in `salaryRange`; ambiguous pay stays empty.
