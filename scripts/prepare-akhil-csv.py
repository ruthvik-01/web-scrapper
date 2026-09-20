"""Build a fresh, source-audited manifest from the replacement CSV."""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"D:\Programs\Java\downloads\Akhil team - ruthvik.csv")
OUT = ROOT / "output/akhil-ruthvik-2026-09-18"
HOLDS = {
    "mha": "Company URL mha.com.br conflicts with careers URL mha.com; confirm intended employer.",
    "stellantis": "OP/Opel points to the group-wide Stellantis board; confirm employer scope.",
    "tcfm": "Company URL tcfmagazine.com conflicts with careers URL tcfm.co.uk.",
    "ewrecruitment": "Company URL ewrecruitmentservices.co.uk conflicts with ewrecruitment.co.uk.",
    "theindependentschool": "First Rung company URL conflicts with theindependentschool.com careers URL.",
}
OUT.mkdir(parents=True, exist_ok=True)
rows = list(csv.DictReader(SOURCE.open(encoding="utf-8-sig", newline="")))
assert len(rows) == 47
manifest, audit = [], []
for number, row in enumerate(rows, 1):
    name = row["company"].strip()
    slug = row["slug"].strip() or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    career = re.match(r"https?://[^\s]+", row["career_url"].strip())
    reason = HOLDS.get(slug, "")
    if not career:
        reason = f'No usable careers URL: {row["career_url"]}'
    audit.append({
        "csvDataRow": number, "source": row, "slug": slug,
        "careersUrl": career.group() if career else "", "holdReason": reason,
    })
    if reason:
        continue
    manifest.append({
        "name": name, "slug": slug, "careersUrl": career.group(),
        "sourceNote": (
            f"Source: Akhil team - ruthvik.csv, data row {number}; supersedes the PDF. "
            "Headquarters cells are not vacancy-location evidence. "
            "Use the supplied careers page, without silently switching agency "
            "internal vacancies to client job boards. Full source row retained in csv-source-audit.json."
        ),
        "options": {"mode": "auto", "maxPages": 1000, "delayMs": 1000, "timeoutMs": 30000},
    })
assert len(manifest) == 39
assert len({c["slug"] for c in manifest}) == len(manifest)
path = ROOT / "companies-akhil-ruthvik-2026-09-18.json"
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT / "csv-source-audit.json").write_text(json.dumps({
    "source": str(SOURCE), "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    "rows": audit,
}, ensure_ascii=False, indent=2), encoding="utf-8")
held = [r for r in audit if r["holdReason"]]
(OUT / "INPUT_REVIEW.md").write_text(
    "# Replacement CSV input review\n\n"
    "This batch uses Akhil team - ruthvik.csv, not the earlier PDF. "
    "47 input rows: 39 queued; 8 held for missing URLs or conflicting identity. "
    "Full names and slugs come from the CSV. The parenthetical label on Kent's "
    "careers URL is removed; no other careers URLs are changed.\n\n"
    + "\n".join(f'- {r["source"]["company"]}: {r["holdReason"]}' for r in held)
    + "\n\nHeld entries are not zero-job results. Failed/unsupported extraction "
    "does not establish that an employer has no vacancies. "
    "The interrupted PDF-based batch is superseded and must not be combined with this run.\n",
    encoding="utf-8",
)
print(json.dumps({"manifest": str(path), "queued": len(manifest), "held": len(held)}))
