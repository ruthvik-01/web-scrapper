"""Create an auditable batch from the supplied PDF without guessing clipped cells."""
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"D:\Programs\Java\downloads\Akhil team - Google Sheets.pdf")
OUT = ROOT / "output/akhil-team-2026-09-18"
OUT.mkdir(parents=True, exist_ok=True)
# These rows cannot safely identify a careers source from the supplied pair.
HOLDS = {
    8: "Company URL mha.com.br and careers URL mha.com may identify different employers.",
    17: "OP/Opel points to the group-wide Stellantis board; employer scope needs confirmation.",
    33: "PDF says Unable to verify and supplies no careers URL.",
    36: "PDF says Unable to verify and supplies no careers URL.",
    37: "Company URL tcfmagazine.com conflicts with careers URL tcfm.co.uk.",
    39: "PDF says This site can't be reached and supplies no careers URL.",
    40: "Company URL ewrecruitmentservices.co.uk conflicts with ewrecruitment.co.uk.",
    42: "First Rung company URL conflicts with theindependentschool.com careers URL.",
}
with pdfplumber.open(SOURCE) as pdf:
    page = pdf.pages[0]
    table = page.extract_tables()[0]
    assert len(table) == 48
    page.to_image(resolution=180).save(OUT / "source-preview.png")
    records = []
    companies = []
    for number, cells in enumerate(table[1:], 1):
        name = (cells[0] or "").strip()
        website = re.search(r"https?://\S+", cells[1] or "")
        career = re.search(r"https?://\S+", cells[2] or "")
        slug = re.sub(r"[^a-z0-9]+", "-", (cells[4] or name).lower()).strip("-")
        record = {
            "pdfRow": number, "sourceName": name, "cells": cells,
            "companyUrl": website.group() if website else "",
            "careersUrl": career.group() if career else "",
            "holdReason": HOLDS.get(number, ""),
        }
        records.append(record)
        if number in HOLDS:
            continue
        assert career, record
        companies.append({
            "name": name, "slug": slug, "careersUrl": career.group(),
            "sourceNote": (
                f"Source: Akhil team - Google Sheets.pdf, data row {number}. "
                "Company label is retained as printed; PDF cells may be clipped. "
                "Spreadsheet headquarters are not evidence of a vacancy's UK location. "
                "Recruitment agencies' supplied careers pages are used without silently "
                "switching between internal vacancies and client job boards."
            ),
            "options": {"mode": "auto", "maxPages": 1000, "delayMs": 1000, "timeoutMs": 30000},
        })
    assert len(companies) == 39
    assert len({c["slug"] for c in companies}) == len(companies)
    (OUT / "pdf-source-audit.json").write_text(
        json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    manifest = ROOT / "companies-akhil-team-2026-09-18.json"
    manifest.write_text(json.dumps(companies, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUT / "INPUT_REVIEW.md").write_text(
        "# Akhil team input review\n\n"
        "47 PDF rows: 39 queued, 8 held for missing URLs or conflicting identity. "
        "Clipped names are preserved, not expanded by guesswork. "
        "Source cells and row numbers are retained in pdf-source-audit.json.\n\n"
        + "\n".join(f"- Row {n}: {reason}" for n, reason in HOLDS.items())
        + "\n\nA failed extraction is not evidence of zero vacancies. "
        "Existing outputs and the source PDF remain unchanged.\n", encoding="utf-8")
    print(json.dumps({"manifest": str(manifest), "queued": len(companies), "held": len(HOLDS)}))
