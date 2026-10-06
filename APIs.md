# Fieldwork interfaces

The loopback dashboard API provides company/catalog, import preview/commit, run execution/history, result/download and saved-delivery routes. Mutations require the workspace token and same-origin checks. Contracts live in server/app.ts and server/import-types.ts.

The shared strategy reads public ATS/API, sitemap/static and DOM sources with robots/UK/NHS/request safeguards. No private account, paid API, LLM or fixed employer catalog is required. Exports use the 15-column contract in README; diagnostics remain separate.

Tests use local HTTP and mocked source fixtures. Live samples are documented in [restoration verification](docs/fieldwork-restoration.md).
