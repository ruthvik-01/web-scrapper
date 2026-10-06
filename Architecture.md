# Fieldwork architecture

`ui/` calls the loopback API in `server/app.ts`. Isolated workers parse uploads and scrape selected companies. Only mapped spreadsheet data persists; imports, settings, runs and export history stay in the private data root.

Dashboard workers and `scraper.ts` use `src/strategy.ts` for API, sitemap/static HTML and browser DOM extraction. ATS adapters, robots restrictions, pagination, geography and normalization are shared. `src/request-runtime.ts` provides retries, pacing, cancellation and caching. `src/final-dataset.ts` consolidates dashboard/URL rows and gates CSV downloads with quality checks.

`batch.ts` uses user manifests with sequential checkpoints, employer/title scope filters and per-source location rows. `scripts/package-batch.ts` packages saved exports with company wrappers and shared generic code.

No fixed employer catalog, external code library, database, LLM or paid API is required. Existing saved-delivery discovery remains for compatibility. See [restoration verification](docs/fieldwork-restoration.md).
