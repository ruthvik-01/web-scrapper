import concurrent.futures
import csv
import json
import pathlib
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup


ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "output/ppg-health-in-justice-24-9-26/ppg-health-in-justice/export-rows.json"
OUT = ROOT / "output/main 24-9-26"
FIELDS = ["jobId", "title", "jobUrl", "company", "location", "salary", "jobType", "description", "source", "scrapedAt"]


def enrich(row):
    try:
        response = requests.get(row["jobUrl"], timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        location = soup.select_one("#div_VacV_AllLocations .content")
        location = location.get_text(" ", strip=True) if location else ""
        return row, location, ""
    except Exception as exc:
        return row, "", str(exc)


def main():
    rows = json.loads(SOURCE.read_text(encoding="utf-8"))
    audit_file = OUT / "ppg-location-audit.json"
    if audit_file.exists():
        audit = json.loads(audit_file.read_text(encoding="utf-8"))
        by_url = {item["jobUrl"]: item for item in audit}
        details = [(row, by_url[row["jobUrl"]]["location"], by_url[row["jobUrl"]]["error"]) for row in rows]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            details = list(pool.map(enrich, rows))
    locations = {}
    failures = []
    for row, location, error in details:
        if error:
            failures.append((row["jobId"], error))
        locations.setdefault(location, 0)
        locations[location] += 1
    print("Candidates:", len(rows), "Unique IDs:", len({r["jobId"] for r in rows}))
    print("Locations:", json.dumps(locations, ensure_ascii=False))
    print("Failures:", failures[:10])
    # The location audit is a required review step before final export.
    (OUT / "ppg-location-audit.json").write_text(
        json.dumps([{"jobId": r["jobId"], "jobUrl": r["jobUrl"], "location": loc, "error": err} for r, loc, err in details], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    location_fallbacks = {
        "14468": "West Yorkshire HMP Leeds, HMP Wakefield, HMP Wealstun, UK",
        "15466": "West Midlands HMP Dovegate, HMP Stafford, HMP Featherstone, HMP YOI Drake Hall, UK",
        "15473": "Leeds, West Yorkshire, UK",
    }
    observed = {row["jobId"]: location for row, location, error in details if not error}
    if any(not observed.get(row["jobId"]) for row in rows):
        raise RuntimeError("Some vacancy pages could not be verified")
    exported = []
    excluded = []
    seen = set()
    scraped = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for row in rows:
        job_id = row["jobId"]
        if job_id in seen:
            excluded.append({"jobId": job_id, "reason": "duplicate"})
            continue
        seen.add(job_id)
        location = observed[job_id]
        if location == "Not Specified":
            location = location_fallbacks.get(job_id, "")
        if location == "Fully Remote / Home Based" or not location:
            excluded.append({"jobId": job_id, "reason": "UK_job_base_unconfirmed"})
            continue
        if not location.endswith("UK"):
            location += ", UK"
        exported.append({
            "jobId": job_id,
            "title": row["title"],
            "jobUrl": row["jobUrl"],
            "company": "PPG Health In Justice",
            "location": location,
            "salary": row["salaryRange"],
            "jobType": row["employmentType"],
            "description": row["description"],
            "source": "https://ppghealthinjusticeweb.eploy.net/vacancies/vacancy-search-results.aspx",
            "scrapedAt": scraped,
        })
    folder = OUT / "ppg-health-in-justice"
    folder.mkdir(parents=True, exist_ok=True)
    prefix = "ppg_health_in_justice"
    with (folder / f"{prefix}_jobs.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(exported)
    (OUT / f"{prefix}_jobs.json").write_text(json.dumps(exported, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "source-report.json").write_text(json.dumps({"candidates": len(rows), "exported": len(exported), "excluded": excluded, "locationFallbacks": location_fallbacks, "postedDate": "Not shown on vacancy pages", "deadline": "Not shown on vacancy pages"}, ensure_ascii=False, indent=2), encoding="utf-8")
    titles = "\n".join(f"- {r['title']}" for r in exported)
    (folder / f"{prefix}_summary.md").write_text(f"""# PPG Health In Justice - Job Scraping Summary

**Company**: PPG Health In Justice / Practice Plus Group
**Website**: https://practiceplushij.com/
**Careers Page**: https://ppghealthinjusticeweb.eploy.net/vacancies/vacancy-search-results.aspx
**Sector**: Healthcare & Social Care
**Location**: United Kingdom; individual site labels in each record
**Date Scraped**: {scraped}
**Jobs Extracted**: {len(exported)}

## Job Titles

{titles}

## Notes

The private employer's Eploy site yielded {len(rows)} candidate records. One duplicate and one role without a confirmed UK base were excluded. Three roles had no site in the location field; their descriptions explicitly identify UK sites, recorded in source-report.json. The vacancy pages did not show posting dates or deadlines. No posting dates were invented.
""", encoding="utf-8")
    print("Exported:", len(exported), "Excluded:", excluded)


if __name__ == "__main__":
    main()
