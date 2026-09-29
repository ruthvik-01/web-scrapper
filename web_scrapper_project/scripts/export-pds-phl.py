"""Export source-verified PDS and PHL vacancies for the September 24 batch."""

import csv
import json
import pathlib
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


ROOT = pathlib.Path(__file__).resolve().parents[2] / "output/main 24-9-26"
FIELDS = ["jobId", "title", "jobUrl", "company", "location", "salary", "jobType", "description", "source", "scrapedAt"]
STAMP = datetime.now(timezone.utc).isoformat(timespec="seconds")


def get(url):
    for attempt in range(3):
        try:
            response = requests.get(url, timeout=35)
            response.raise_for_status()
            return BeautifulSoup(response.content, "html.parser")
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def save(slug, name, website, board, sector, rows, notes, audit):
    folder = ROOT / slug
    folder.mkdir(parents=True, exist_ok=True)
    prefix = slug.replace("-", "_")
    with (folder / f"{prefix}_jobs.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    (ROOT / f"{prefix}_jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "source-report.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    titles = "\n".join(f"- {r['title']}" for r in rows) or "- No qualifying vacancies"
    (folder / f"{prefix}_summary.md").write_text(f"""# {name} - Job Scraping Summary

**Company**: {name}
**Website**: {website}
**Careers Page**: {board}
**Sector**: {sector}
**Location**: United Kingdom; individual locations in records
**Date Scraped**: {STAMP}
**Jobs Extracted**: {len(rows)}

## Job Titles

{titles}

## Notes

{notes}
""", encoding="utf-8")
    print(name, len(rows), "jobs")


def pds():
    board = "https://pdslimited.co.uk/careers/vacancies/"
    listing = get(board)
    links = sorted({a["href"] for a in listing.find_all("a", href=True) if a["href"].startswith(board) and a["href"] != board})
    rows = []
    excluded = []
    for url in links:
        page = get(url)
        title = page.find("h1").get_text(" ", strip=True)
        text = page.get_text(" ", strip=True)
        marker = f"{title} What we need from you"
        start = text.rfind(marker)
        end = text.find("Apply Now", start)
        description = text[start:end].strip() if start >= 0 and end >= 0 else ""
        if not description:
            raise RuntimeError(f"Missing description: {url}")
        if "Commercial & Contract Manager" not in title:
            excluded.append({"title": title, "url": url, "reason": "UK base unconfirmed; UK and Republic of Ireland travel required"})
            continue
        if "primarily office-based from our Derby office" not in description:
            raise RuntimeError("Derby location evidence changed")
        salary_match = re.search(r"Salary:\s*([^+]+)", description)
        rows.append({"jobId": urlparse(url).path.rstrip("/").split("/")[-1], "title": title, "jobUrl": url,
                     "company": "P Ducker Systems Ltd", "location": "Derby, UK",
                     "salary": salary_match.group(1).strip() if salary_match else "", "jobType": "",
                     "description": description, "source": board, "scrapedAt": STAMP})
    save("p-ducker-systems-ltd", "P Ducker Systems Ltd", "https://pdslimited.co.uk/", board,
         "Other Services", rows, "One role explicitly states a Derby office base. Two engineering roles require travel across both the UK and Republic of Ireland but do not name a UK base; they were excluded. No posting date or deadline is shown on the vacancy pages.",
         {"links": links, "excluded": excluded})


def phl():
    board = "https://phlgroup.co.uk/careers-home/"
    listing = get(board)
    links = sorted({a["href"] for a in listing.find_all("a", href=True) if a["href"].startswith("https://phlgroup.co.uk/job/")})
    rows = []
    excluded = []
    for url in links:
        page = get(url)
        details = page.select_one(".single_job_listing")
        if details is None:
            raise RuntimeError(f"Missing vacancy detail: {url}")
        title = page.find("h1").get_text(" ", strip=True)
        location = details.select_one(".job-listing-meta .location")
        location = location.get_text(" ", strip=True) if location else ""
        posted = details.select_one(".job-listing-meta .date-posted time")
        posted = posted.get("datetime", "") if posted else ""
        if not posted:
            raise RuntimeError(f"Missing posting date: {url}")
        if posted[:10] < "2026-07-24":
            excluded.append({"title": title, "url": url, "reason": "older than two-month window", "posted": posted})
            continue
        if location == "Guernsey":
            excluded.append({"title": title, "url": url, "reason": "Guernsey is outside UK"})
            continue
        if not location:
            excluded.append({"title": title, "url": url, "reason": "no confirmed location"})
            continue
        description_tag = details.select_one(".job_description")
        description = description_tag.get_text("\n", strip=True) if description_tag else ""
        if not description:
            raise RuntimeError(f"Missing description: {url}")
        salary_tag = details.select_one(".job-listing-meta .salary")
        salary = salary_tag.get_text(" ", strip=True) if salary_tag else ""
        types = [e.get_text(" ", strip=True) for e in details.select(".job-listing-meta .job-type")]
        rows.append({"jobId": urlparse(url).path.rstrip("/").split("/")[-1], "title": title, "jobUrl": url,
                     "company": "Partnering Health Ltd", "location": f"{location}, UK", "salary": salary,
                     "jobType": ", ".join(types), "description": description, "source": board, "scrapedAt": STAMP})
    save("partnering-health-ltd", "Partnering Health Ltd", "https://phlgroup.co.uk/", board,
         "Healthcare & Social Care", rows, "The current employer careers page lists seven role pages. One Guernsey role and one old posting were excluded. The remaining posting dates and UK places are shown on the vacancy pages.",
         {"links": links, "excluded": excluded})


if __name__ == "__main__":
    if len(sys.argv) == 1 or sys.argv[1] == "pds":
        pds()
    if len(sys.argv) == 1 or sys.argv[1] == "phl":
        phl()
