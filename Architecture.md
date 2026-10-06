# Fieldwork UI architecture

Browser JavaScript/CSS in ui/ calls the loopback server/app.ts API. Isolated workers parse uploads and scrape selected companies; only mapped data persists in the private data root.

server/worker.ts uses src/strategy.ts for supported public API, sitemap/static and DOM extraction. Shared modules handle ATS parsing, robots restrictions, pacing/retries, UK evidence, date normalization and export quality. Generated company code includes these same modules and an independent dependency manifest.

The UI manages company selection, progress, reports, downloads and history. No separate command-line product or external source-code library is required.
