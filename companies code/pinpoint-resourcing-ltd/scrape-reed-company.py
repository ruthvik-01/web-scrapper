"""Export current UK jobs from a company's linked Reed vacancy pages."""

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[2] / "output" / "2026-09-24-main-uk-scrape" / "source-cache" / "daily"
HEADERS = ["jobId", "title", "jobUrl", "company", "location", "salary", "jobType", "description", "source", "scrapedAt"]
CONFIGS = {
    "pgs": {"slug": "pgs-ltd", "prefix": "pgs_ltd", "name": "PGS LTD",
            "website": "https://www.pgs-ltd.co.uk/", "board": "https://www.reed.co.uk/jobs/pgs-ltd-63908/p63908", "sector": "Other Services"},
    "pinpoint": {"slug": "pinpoint-resourcing-ltd", "prefix": "pinpoint_resourcing_ltd", "name": "Pinpoint Resourcing Ltd",
                 "website": "https://pinpointresourcing.co.uk/", "board": "https://pinpointresourcing.co.uk/latest-vacancies/", "sector": "Other Services"},
}


def fetch(url):
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.content, "html.parser")


def main(config):
    board = config["board"]
    folder = ROOT / config["slug"]
    listing = fetch(board)
    links = sorted({urljoin(board, a["href"]).split("?")[0]
                    for a in listing.find_all("a", href=True)
                    if re.search(r"/jobs/[^/]+/\d+", a["href"])})
    if not links:
        raise RuntimeError(f"No vacancies found on {board}")
    rows = []
    excluded = []
    scraped = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for url in links:
        page = fetch(url)
        postings = []
        for tag in page.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(tag.string or tag.get_text())
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                postings.append(data)
        if len(postings) != 1:
            raise RuntimeError(f"Expected one JobPosting on {url}, got {len(postings)}")
        job = postings[0]
        identifier = str(job.get("identifier", {}).get("value", ""))
        employer = job.get("hiringOrganization", {}).get("name", "")
        address = job.get("jobLocation", {}).get("address", {})
        country = address.get("addressCountry", "")
        posted = job.get("datePosted", "")
        if "relocate to spain" in job.get("title", "").casefold():
            excluded.append({"jobUrl": url, "reason": "role_is_based_in_spain_despite_uk_structured_address"})
            continue
        if employer.casefold() != config["name"].casefold() or country not in ("GB", "UK", "United Kingdom"):
            excluded.append({"jobUrl": url, "reason": "other_employer_or_non_uk", "employer": employer, "country": country})
            continue
        if posted and posted[:10] < "2026-07-24":
            excluded.append({"jobUrl": url, "reason": "older_than_two_month_window", "datePosted": posted})
            continue
        if not identifier or not job.get("title") or not job.get("description"):
            raise RuntimeError(f"Missing required JobPosting data on {url}")
        salary = job.get("baseSalary", {})
        amount = salary.get("value", {}) if isinstance(salary, dict) else {}
        if isinstance(amount, dict) and amount.get("unitText", "").upper() == "YEAR":
            low, high = amount.get("minValue"), amount.get("maxValue")
            pay = f"£{int(low)}-£{int(high)}" if low and high and low != high else f"£{int(low or high)}" if low or high else ""
        else:
            pay = ""
        place = ", ".join(dict.fromkeys(x for x in (address.get("addressLocality", ""), address.get("addressRegion", ""), "UK") if x))
        description = BeautifulSoup(job["description"], "html.parser").get_text("\n", strip=True)
        rows.append({"jobId": identifier, "title": job["title"], "jobUrl": url, "company": config["name"],
                     "location": place, "salary": pay, "jobType": str(job.get("employmentType", "")).replace("_", " ").title(),
                     "description": description, "source": board, "scrapedAt": scraped})
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / f"{config['prefix']}_jobs.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    (ROOT / f"{config['prefix']}_jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "source-report.json").write_text(json.dumps({"board": board, "links": links, "excluded": excluded}, indent=2), encoding="utf-8")
    titles = "\n".join(f"- {row['title']}" for row in rows)
    (folder / f"{config['prefix']}_summary.md").write_text(f"""# {config['name']} - Job Scraping Summary

**Company**: {config['name']}
**Website**: {config['website']}
**Careers Page**: {board}
**Sector**: {config['sector']}
**Location**: London, Greater London, United Kingdom (company metadata; exported locations come from each vacancy)
**Date Scraped**: {scraped}
**Jobs Extracted**: {len(rows)}

## Job Titles

{titles}

## Notes

The source page linked {len(links)} Reed vacancy pages. Source employer, country, posting date, and salary were checked in each page's JobPosting data. Exclusions: {len(excluded)}. See source-report.json.
""", encoding="utf-8")
    print(json.dumps({"linked": len(links), "exported": len(rows), "excluded": excluded}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("company", choices=CONFIGS)
    args = parser.parse_args()
    main(CONFIGS[args.company])
