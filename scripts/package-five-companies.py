"""Independently validate the five CSVs and package their standalone code/data."""
import csv
import hashlib
import json
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output"
batch = json.loads((OUTPUT / "_tracking/completed-companies.json").read_text(encoding="utf-8"))
assert len(batch["summaries"]) == 5 and not batch["failures"]
columns = [
    "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
    "company", "salaryRange", "employmentType", "worktype",
    "location", "city", "state", "country", "ats",
]
validation = []
for summary in batch["summaries"]:
    folder = OUTPUT / summary["slug"]
    with (folder / "jobs.csv").open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        assert reader.fieldnames == columns
    expected = json.loads((folder / "export-rows.json").read_text(encoding="utf-8"))
    report = json.loads((folder / "scrape-report.json").read_text(encoding="utf-8"))
    safe = lambda value: "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r")) else value
    assert rows == [{key: safe(value) for key, value in row.items()} for row in expected]
    assert all(None not in row and len(row) == 15 and all(value not in (None, "NULL") for value in row.values()) for row in rows)
    real_jobs = [row for row in rows if row["jobId"]]
    assert len(real_jobs) == report["rows"] == summary["locationRows"]
    assert all(row["country"] == "UK" and report["window"]["from"] <= row["postedDate"] <= report["window"]["to"] for row in real_jobs)
    fallback_keys = {(item["jobId"], item["jobUrl"]) for item in report["dateFallbacks"]}
    note_keys = {(item["jobId"], item["jobUrl"]): item["reason"] for item in report.get("dataNotes", [])}
    for row in real_jobs:
        if (row["jobId"], row["jobUrl"]) in fallback_keys:
            assert row["postedDate"] == report["window"]["to"]
        assert row["ats"] == "Custom"
    for job_id in {row["jobId"] for row in real_jobs}:
        locations = [row for row in real_jobs if row["jobId"] == job_id]
        shared = [tuple((k, v) for k, v in row.items() if k not in ("location", "city", "state")) for row in locations]
        assert len(set(shared)) == 1, f"Shared fields changed across locations: {job_id}"
    # Preserve each delivery's extraction implementation; refresh only the export contract.
    for source in [ROOT / "src/output.ts", ROOT / "src/normalize.ts"]:
        assert source.read_bytes() == (folder / "code/src" / source.name).read_bytes()
    assert (folder / "code/package-lock.json").is_file()
    assert (folder / "code/scrape.ts").is_file()
    validation.append({
        "company": summary["company"],
        "rows": len(real_jobs),
        "posting_date_fallbacks": len(fallback_keys),
        "location_review_notes": len(note_keys),
        "columns": 15,
        "csv_json_roundtrip": "exact",
        "export_code_source_match": True,
        "sha256": hashlib.sha256((folder / "jobs.csv").read_bytes()).hexdigest(),
    })

day = json.loads((OUTPUT / batch["summaries"][0]["slug"] / "scrape-report.json").read_text())["window"]["to"]
archive = OUTPUT / f"five-companies-corrected-code-and-csv-{day}.zip"
with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as bundle:
    for summary in batch["summaries"]:
        folder = OUTPUT / summary["slug"]
        for file in folder.rglob("*"):
            if not file.is_file() or "node_modules" in file.parts:
                continue
            if file.name.startswith("MWH_Treatment_UK_Jobs_"):
                continue  # Legacy download alias; jobs.csv is the current standard.
            bundle.write(file, file.relative_to(OUTPUT))
    for name in ("README.md", "completed-companies.csv", "CORRECTION_REPORT.md"):
        bundle.write(OUTPUT / name, name)
    for name in ("selected-companies.json", "completed-companies.json", "taken-companies.json"):
        bundle.write(OUTPUT / "_tracking" / name, f"_tracking/{name}")
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for summary in batch["summaries"]:
        assert f'{summary["slug"]}/jobs.csv' in bundle.namelist()
        assert f'{summary["slug"]}/code/scrape.ts' in bundle.namelist()
        assert f'{summary["slug"]}/code/src/normalize.ts' in bundle.namelist()
        assert f'{summary["slug"]}/code/package-lock.json' in bundle.namelist()
(OUTPUT / "_tracking/validation.json").write_text(json.dumps(validation, indent=2), encoding="utf-8")
shutil.copyfile(archive, OUTPUT / f"five-companies-code-and-csv-{day}.zip")
print(json.dumps({"validation": validation, "archive": str(archive), "archive_bytes": archive.stat().st_size}, indent=2))
