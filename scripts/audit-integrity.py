"""Read-only independent CSV/source/code/archive checks; write only an audit result."""
import csv
import hashlib
import json
from datetime import date
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output"
batch = json.loads((OUTPUT / "_tracking/completed-companies.json").read_text(encoding="utf-8"))
columns = "jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats,process,reason".split(",")
results = []
archive = OUTPUT / "five-companies-code-and-csv-2026-09-15.zip"
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for company in batch["summaries"]:
        folder = OUTPUT / company["slug"]
        with (folder / "jobs.csv").open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            rows = list(reader)
            assert reader.fieldnames == columns
        raw = json.loads((folder / "scrape-result.json").read_text(encoding="utf-8"))
        data = json.loads((folder / "export-rows.json").read_text(encoding="utf-8"))
        assert rows == data  # Current dataset contains no formula-prefixed cells.
        assert len(rows) == company["locationRows"]
        assert len({tuple(row.items()) for row in rows}) == len(rows)
        assert all(len(row) == 17 and None not in row and all(value is not None and value != "NULL" for value in row.values()) for row in rows)
        fallbacks = {(item["jobId"], item["jobUrl"]) for item in raw["report"]["dateFallbacks"]}
        notes = {(item["jobId"], item["jobUrl"]): item["reason"] for item in raw["report"].get("dataNotes", [])}
        for row in rows:
            assert row["country"] == "UK" and row["process"] in ("STATIC", "STATIC + API")
            parsed = date.fromisoformat(row["postedDate"])
            assert date(2026, 7, 15) <= parsed <= date(2026, 9, 15)
            source = next(item for item in raw["rawJobs"] if item["jobId"] == row["jobId"] and item["jobUrl"] == row["jobUrl"])
            assert row["title"] == source["title"]
            if (row["jobId"], row["jobUrl"]) in fallbacks:
                assert not source.get("postedDate")
                assert row["postedDate"] == raw["report"]["window"]["to"]
                assert "Source posting date missing" in row["reason"]
            else:
                assert source["postedDate"][:10] == row["postedDate"]
                assert row["reason"] == notes.get((row["jobId"], row["jobUrl"]), "")
        for source in (ROOT / "src").glob("*.ts"):
            copy = folder / "code/src" / source.name
            assert source.read_bytes() == copy.read_bytes()
            assert bundle.read(f'{company["slug"]}/code/src/{source.name}') == copy.read_bytes()
        assert bundle.read(f'{company["slug"]}/jobs.csv') == (folder / "jobs.csv").read_bytes()
        excluded = {}
        for item in raw["report"]["skipped"]:
            excluded[item["reason"]] = excluded.get(item["reason"], 0) + 1
        results.append({
            "company": company["company"], "rows": len(rows), "dateFallbacks": len(fallbacks),
            "csv_structure_pass": True, "stored_source_dates_pass": True,
            "empty_fields_pass": True, "duplicates": 0, "copied_code_matches": True,
            "zip_matches": True, "exclusions": excluded,
            "sha256": hashlib.sha256((folder / "jobs.csv").read_bytes()).hexdigest(),
        })
target = OUTPUT / "_tracking/audit-2026-09-15"
target.mkdir(parents=True, exist_ok=True)
(target / "integrity.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
