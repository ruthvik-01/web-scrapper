"""Read-only field audit of the corrected batch master CSV; no dataset mutation."""
import collections
import csv
import json
from pathlib import Path

BASE = Path(r"D:\Internship\MAIN\UK SCRAPPER\output\batch 17-9-2026\company-names-corrected")
FIELDS = ["employmentType", "location", "city", "state"]
EXPECTED = "jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats".split(",")
with (BASE / "companies.csv").open(encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    assert reader.fieldnames == EXPECTED, "Unexpected master schema"
    records = list(reader)

jobs = [r for r in records if r["jobId"]]
assert len(jobs) == 188, "Snapshot changed; review before auditing"
checks = []
summary = {}
for row in jobs:
    flags = ["missing_" + key for key in FIELDS if not row[key].strip()]
    if not row["location"].endswith("UK"):
        flags.append("location_not_ending_UK")
    if row["country"] != "UK":
        flags.append("country_not_UK")
    composed = ", ".join(row[key] for key in ["city", "state", "country"] if row[key])
    if row["location"] != composed:
        flags.append("location_composition_mismatch")
    # Administrative areas are not cities, even when incorrectly labelled by a source.
    if row["city"] in {"Bedfordshire", "Isle of Wight", "England", "Scotland", "Wales", "Northern Ireland"}:
        flags.append("administrative_area_in_city_review")
    check = {key: row[key] for key in ["company", "jobId", "jobUrl", *FIELDS]}
    check["flags"] = "; ".join(flags)
    checks.append(check)
    counts = summary.setdefault(row["company"], {"jobs": 0, "flagged_rows": 0, **{ "missing_" + f: 0 for f in FIELDS }})
    counts["jobs"] += 1
    counts["flagged_rows"] += bool(flags)
    for f in FIELDS:
        counts["missing_" + f] += not row[f].strip()
    print(json.dumps(check, ensure_ascii=True))

with (BASE / "field-audit.csv").open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(checks[0]))
    writer.writeheader()
    writer.writerows(checks)
result = {
    "input": str(BASE / "companies.csv"), "job_rows": len(jobs),
    "diagnostic_rows_excluded": len(records) - len(jobs),
    "flagged_rows": sum(bool(r["flags"]) for r in checks),
    "flag_counts": dict(collections.Counter(flag for r in checks for flag in r["flags"].split("; ") if flag)),
    "by_company": summary,
    "scope": "Structural/missing-field audit of the exact corrected master snapshot. Flags are not automatic corrections. Original-page verification is required for factual completeness; a missing value can be legitimate. No source pages fetched by this script.",
}
(BASE / "field-audit-summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
