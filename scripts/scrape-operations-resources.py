"""Export current Operations Resources Limited jobs from its Haystack page."""

import csv
import json
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BOARD = "https://haystackapp.io/companies/operations-resources-limited"
OUT = Path(__file__).resolve().parents[1] / "output" / "operations-resources-limited-24-9-26"
COLUMNS = ["jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
           "company", "salaryRange", "employmentType", "worktype", "location",
           "city", "state", "country", "ats"]
TODAY = date(2026, 9, 24)


def page(url):
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.content, "html.parser")


def main():
    listing = page(BOARD)
    links = sorted({urljoin(BOARD, a["href"]) for a in listing.select('a[href^="/jobs/"]')
                    if a["href"].count("/") == 2 and a["href"] != "/jobs/browse"})
    if len(links) != 5:
        raise RuntimeError(f"Expected five advertised vacancies, found {len(links)}")
    rows, excluded = [], []
    for url in links:
        detail = page(url)
        postings = []
        for tag in detail.select('script[type="application/ld+json"]'):
            try:
                item = json.loads(tag.get_text())
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                postings.append(item)
        if len(postings) != 1:
            raise RuntimeError(f"Missing JobPosting: {url}")
        job = postings[0]
        employer = job.get("hiringOrganization", {}).get("name", "")
        address = job.get("jobLocation", {}).get("address", {})
        if employer != "Operations Resources Limited" or address.get("addressCountry") != "GB":
            raise RuntimeError(f"Employer or country mismatch: {url}")
        posted = job.get("datePosted", "")[:10]
        deadline = job.get("validThrough", "")[:10]
        if posted and posted < "2026-07-24":
            excluded.append({"url": url, "reason": "older_than_two_month_window", "datePosted": posted})
            continue
        if deadline and deadline < TODAY.isoformat():
            excluded.append({"url": url, "reason": "expired", "validThrough": deadline})
            continue
        description = BeautifulSoup(job.get("description", ""), "html.parser").get_text("\n", strip=True)
        if not description:
            raise RuntimeError(f"Missing description: {url}")
        value = (job.get("baseSalary") or {}).get("value") or {}
        if value.get("unitText") == "YEAR" and value.get("minValue"):
            low, high = int(value["minValue"]), int(value.get("maxValue") or value["minValue"])
            salary = f"£{low}" if low == high else f"£{low}-£{high}"
        else:
            salary = ""
        city = address.get("addressLocality", "")
        state = address.get("addressRegion", "")
        if state == "UK":
            state = ""
        location = ", ".join(x for x in (city, state, "United Kingdom") if x)
        rows.append(dict(jobId=url.rsplit("/", 1)[-1], title=job["title"], description=description,
                         jobUrl=url, postedDate=posted, jdDeadline=deadline, company=employer,
                         salaryRange=salary, employmentType=job.get("employmentType", "").replace("_", " ").title(),
                         worktype="Hybrid", location=location, city=city, state=state,
                         country="United Kingdom", ats="Custom"))
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "jobs.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (OUT / "jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "source-report.json").write_text(json.dumps({"source": BOARD, "linked": len(links),
        "exported": len(rows), "excluded": excluded, "dateChecked": TODAY.isoformat()}, indent=2), encoding="utf-8")
    print(json.dumps({"linked": len(links), "exported": len(rows), "excluded": excluded}))


if __name__ == "__main__":
    main()
