# Fieldwork repairs and limits

Fixed: portable dashboard/batch code inherited main/types paths for a compiled catalog entry absent from those packages. Removed the unrelated root metadata; regression tests now require any declared entry to exist.

Fixed: generated dashboard scraper code inferred mode as an unrestricted string and accessed exportReady through the source report type. The generator now types its configuration explicitly and reads readiness from the finalized report; a regression compiles the downloaded code.

Access restrictions, changed markup, unsupported feeds/pagination and ambiguous geography can still prevent extraction. Missing dates do not establish recency; failed/limited/empty runs do not prove zero vacancies. Review reports rather than inferring completeness.

Live sample comparison: [restoration report](docs/fieldwork-restoration.md).
