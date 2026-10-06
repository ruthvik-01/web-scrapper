"""Independent standard-library verification of batch CSV/JSON and delivery ZIP."""
import csv
import io
import json
import re
import sys
from datetime import date
from pathlib import Path
from zipfile import ZipFile

root = Path(sys.argv[1] if len(sys.argv) > 1 else "output/batch-2026-09-16")
manifest_path = Path(sys.argv[2] if len(sys.argv) > 2 else "companies-next-five.json")
manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
columns = [
    "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
    "company", "salaryRange", "employmentType", "worktype",
    "location", "city", "state", "country", "ats",
]

def escaped(value):
    if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r")):
        return "'" + value
    return value

def parse(contents):
    reader = csv.DictReader(io.StringIO(contents.lstrip("\ufeff"), newline=""))
    assert reader.fieldnames == columns
    rows = list(reader)
    assert all(None not in row and len(row) == 15 for row in rows)
    return rows

combined = []
checks = []
company_folders = {}
for company in manifest:
    folder = root / "jobs company wise" / company["slug"]
    if not folder.is_dir():
        folder = root / company["slug"]
    company_folders[company["slug"]] = folder
    expected = json.loads((folder / "export-rows.json").read_text(encoding="utf-8"))
    rows = parse((folder / "jobs.csv").read_text(encoding="utf-8-sig"))
    assert rows == [{key: escaped(value) for key, value in row.items()} for row in expected]
    report = json.loads((folder / "scrape-report.json").read_text(encoding="utf-8"))
    jobs = expected
    assert all(list(row) == columns and all(isinstance(v, str) and v != "NULL" for v in row.values()) for row in jobs)
    assert all(row["jobId"] and row["title"] and row["description"] and row["company"] and row["jobUrl"] for row in jobs)
    assert len(jobs) == report["rows"]
    assert all(row["ats"] == "Custom" and row["country"] == "UK" for row in jobs)
    for row in jobs:
        assert row["location"] == ", ".join(row[k] for k in ["city", "state", "country"] if row[k])
        assert not row["salaryRange"] or re.fullmatch(r"£\d+(?:\.\d+)?(?:-£\d+(?:\.\d+)?)?", row["salaryRange"])
        if row["postedDate"]:
            assert date.fromisoformat(row["postedDate"]).isoformat() == row["postedDate"]
            assert report["window"]["from"] <= row["postedDate"] <= report["window"]["to"]
        else:
            assert row["jdDeadline"]
        if row["jdDeadline"]:
            assert date.fromisoformat(row["jdDeadline"]).isoformat() == row["jdDeadline"]
        if company.get("titlePrefixes") is not None:
            assert any(re.match(re.escape(prefix.strip()) + r"(?:$|[\s:–—-])", row["title"].strip(), re.I)
                       for prefix in company["titlePrefixes"])
        if company.get("exportCompanyName"):
            assert row["company"] == company["exportCompanyName"]
    assert len({json.dumps(row, sort_keys=True) for row in jobs}) == len(jobs)
    if company.get("employerNames"):
        names = report["exportCompanyIdentity"]["sourceNames"] if company.get("exportCompanyName") else [row["company"] for row in jobs]
        assert all(name.lower() in [n.lower() for n in company["employerNames"]] for name in names)
    for fallback in report["dateFallbacks"]:
        matching = [row for row in jobs if row["jobId"] == fallback["jobId"] and row["jobUrl"] == fallback["jobUrl"]]
        assert matching and all(row["postedDate"] == fallback["assignedDate"] == report["window"]["to"] for row in matching)
    ids = {}
    for row in jobs:
        assert row["jobId"] not in ids or ids[row["jobId"]] == row["jobUrl"]
        ids[row["jobId"]] = row["jobUrl"]
    combined.extend(rows)
    checks.append({"company": company["name"], "rows": len(jobs), "roundtrip": "exact"})

assert parse((root / "companies.csv").read_text(encoding="utf-8-sig")) == combined
with ZipFile(root / "final.zip") as archive:
    assert (root / "final.zip").read_bytes()[:2] == b"PK"
    assert archive.testzip() is None
    names = archive.namelist()
    assert len(names) == len(set(names))
    assert {name.split("/")[0] for name in names} == {"companies.csv", "code", "jobs company wise"}
    folders = {name.split("/")[1] for name in names if name.startswith("code/")}
    assert folders == {company["slug"] for company in manifest} | {"universal_scraper"}
    assert {name.split("/")[1] for name in names if name.startswith("jobs company wise/")} == {company["slug"] for company in manifest}
    assert archive.read("companies.csv") == (root / "companies.csv").read_bytes()
    for company in manifest:
        prefix = f'code/{company["slug"]}/'
        for name in ["package.json", "company.json", "scrape.ts", "README.md"]:
            assert prefix + name in names
        results = f'jobs company wise/{company["slug"]}/'
        for name in ["jobs.csv", "export-rows.json", "scrape-report.json", "scrape-result.json"]:
            assert archive.read(results + name) == (company_folders[company["slug"]] / name).read_bytes()
    for name in ["package-lock.json", "src/strategy.ts", "src/api.ts", "src/batch.ts"]:
        assert "code/universal_scraper/" + name in names
    forbidden = {"node_modules", "runs", "__pycache__", ".cache", "dist", "test-results"}
    assert not any(forbidden.intersection(name.split("/")) or name.endswith((".log", ".tmp", ".pyc")) for name in names)
    assert not any(re.match(r"code/(?!universal_scraper/)[^/]+/src/", name) for name in names)
result = {"csvRows": len(combined), "checks": checks, "zipIntegrity": "PK and CRC passed", "layout": "exactly companies.csv, code/ and jobs company wise/"}
(root / "independent-validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
