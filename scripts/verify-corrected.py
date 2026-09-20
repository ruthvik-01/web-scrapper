"""Verify the confirmed audit regressions against the regenerated CSV data."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
batch = json.loads((OUT / "_tracking/completed-companies.json").read_text(encoding="utf-8"))
data = {item["slug"]: json.loads((OUT / item["slug"] / "export-rows.json").read_text(encoding="utf-8")) for item in batch["summaries"]}
reports = {slug: json.loads((OUT / slug / "scrape-report.json").read_text(encoding="utf-8")) for slug in data}
job = lambda slug, identifier: [row for row in data[slug] if row["jobId"] == identifier]

for identifier in ("3440", "3492", "3493"):
    assert job("mwh-treatment", identifier)[0]["city"] == "Hattersley"
assert job("walkers-shortbread", "166")[0]["city"] == "Elgin"
assert job("alzheimers-society", "4153")[0]["city"] == "Merthyr Tydfil"
assert {row["city"] for row in job("guide-dogs", "1027")} == {"Leamington", "Reading"}
assert len(job("guide-dogs", "973")) == 1
assert job("guide-dogs", "973")[0]["city"] == "Atherton"
assert {row["location"] for row in job("mwh-treatment", "3026")} == {"Falmer", "Testwood WSW"}
assert {row["location"] for row in job("mwh-treatment", "3463")} == {"Peterborough", "Bristol", "Maple Lodge"}
assert job("mwh-treatment", "3462")[0]["country"] == "UK"
assert job("thinking-schools-academy-trust", "1848")[0]["country"] == "UK"
assert job("thinking-schools-academy-trust", "1573")[0]["city"] == "Portsmouth"
for identifier in ("1901", "1933", "1942", "1943"):
    assert len(job("thinking-schools-academy-trust", identifier)) == 1
    assert job("thinking-schools-academy-trust", identifier)[0]["city"] == "Strood"

# All role-specific hybrid omissions found by the original audit are fixed.
audit = json.loads((OUT / "_tracking/audit-2026-09-15/live-evidence.json").read_text(encoding="utf-8"))
hybrid_ids = {row["jobId"] for row in audit if "explicit_hybrid_wording_but_worktype_empty" in row.get("findings", [])}
assert len(hybrid_ids) == 23
for identifier in hybrid_ids:
    assert all(row["worktype"] == "Hybrid" for row in job("mwh-treatment", identifier))

checks = []
for summary in batch["summaries"]:
    slug = summary["slug"]
    report = reports[slug]
    assert not report["issues"] and not report["limited"]
    assert not any("verification failed" in item["reason"].lower() for item in report.get("dataNotes", []))
    checks.append({
        **summary,
        "known_regressions_pass": True,
        "hybrid_omissions_fixed": len(hybrid_ids) if slug == "mwh-treatment" else 0,
    })

result = {
    "pages": sum(item["pagesRead"] for item in checks),
    "jobs": sum(item["jobs"] for item in checks),
    "rows": sum(item["locationRows"] for item in checks),
    "fallback_dates": sum(item["postingDateFallbacks"] for item in checks),
    "review_notes": sum(item["reviewNotes"] for item in checks),
    "checks": checks,
}
(OUT / "_tracking/correction-validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
