# Fieldwork UI API

The loopback server provides company/catalog, import preview/commit, run/history, result/download and dated-delivery endpoints. Mutations require a workspace token and same-origin checks. Contracts are in server/app.ts and server/import-types.ts.

Workers read public careers sources through shared API/static/DOM adapters and return progress, reports and the 15 export fields. No paid service, LLM or private account is required.
