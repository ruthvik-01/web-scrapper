"""Export the four roles linked from PERM Recruitment's candidates page."""

import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[2] / "output" / "main 24-9-26"
FOLDER = ROOT / "perm-recruitment-limited"
CAREERS = "https://permrecruitment.co.uk/candidates/"
HEADERS = ["jobId", "title", "jobUrl", "company", "location", "salary", "jobType", "description", "source", "scrapedAt"]
LOCATIONS = {
    "on-site-housing-officer": "Basildon, Essex, UK",
    "business-support-assistant": "Stonebridge Park, London, UK",
    "finance-assistant": "Watford, UK",
}
SALARIES = {
    "on-site-housing-officer": "£26000-£28000",
    "business-support-assistant": "£30000",
    "finance-assistant": "£35000",
}
JOB_TYPES = {"business-support-assistant": "Permanent, full-time"}


def get(url):
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.content, "html.parser")


def main():
    listing = get(CAREERS)
    urls = sorted({urljoin(CAREERS, a["href"]) for a in listing.find_all("a", href=True)
                   if "/jobs/" in a["href"]})
    if not urls:
        raise RuntimeError("No job links on the candidates page")
    rows = []
    excluded = []
    date = datetime.now().astimezone().isoformat(timespec="seconds")
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        page = get(url)
        title = page.find("h1").get_text(" ", strip=True)
        content = "\n".join(block.get_text(" ", strip=True) for block in page.select(".et_pb_text")[:2])
        if slug not in LOCATIONS:
            excluded.append({"title": title, "jobUrl": url, "reason": "no_confirmed_job_location"})
            continue
        if not content or not title:
            raise RuntimeError(f"Missing detail for {url}")
        rows.append({
            "jobId": "generated-" + hashlib.sha1(url.encode()).hexdigest()[:12],
            "title": title,
            "jobUrl": url,
            "company": "PERM RECRUITMENT LIMITED",
            "location": LOCATIONS[slug],
            "salary": SALARIES[slug],
            "jobType": JOB_TYPES.get(slug, ""),
            "description": content,
            "source": CAREERS,
            "scrapedAt": date,
        })
    FOLDER.mkdir(parents=True, exist_ok=True)
    with (FOLDER / "perm_recruitment_limited_jobs.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    (ROOT / "perm_recruitment_limited_jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    titles = "\n".join(f"- {row['title']}" for row in rows)
    summary = f"""# PERM RECRUITMENT LIMITED - Job Scraping Summary

**Company**: PERM RECRUITMENT LIMITED
**Website**: https://permrecruitment.co.uk/
**Careers Page**: {CAREERS}
**Sector**: Recruitment & Staffing
**Location**: London, Greater London, United Kingdom (company metadata; job locations taken from each job page)
**Date Scraped**: {date}
**Jobs Extracted**: {len(rows)}

## Job Titles

{titles}

## Notes

The candidates page linked {len(urls)} job pages. The Cleaner/Maintenance Worker page gives no job location, so it was excluded from the UK-location export. No posting or deadline dates were stated on the exported pages.
"""
    (FOLDER / "perm_recruitment_limited_summary.md").write_text(summary, encoding="utf-8")
    (FOLDER / "source-report.json").write_text(json.dumps({"listingUrl": CAREERS, "links": urls, "excluded": excluded}, indent=2), encoding="utf-8")
    print(json.dumps({"linked": len(urls), "exported": len(rows), "excluded": excluded}))


if __name__ == "__main__":
    main()
