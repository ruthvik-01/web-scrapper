"""Scrape the live Rodericks Dental Partners board under its actual employer name."""

import csv
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE = "https://careers.rodericksdentalpartners.co.uk/jobs/search"
OUT = Path(__file__).resolve().parents[1] / "output" / "rodericks-dental-partners-24-9-26"
COLUMNS = ["jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
           "company", "salaryRange", "employmentType", "worktype", "location",
           "city", "state", "country", "ats"]
OLDER = Path(__file__).resolve().parents[1] / "output" / "prdc-dental-2026-09-24" / "prdc_dental_jobs.csv"
with OLDER.open(encoding="utf-8-sig", newline="") as file:
    PREVIOUS = {row["jobId"]: row for row in csv.DictReader(file)}


def get(url):
    for attempt in range(4):
        try:
            response = requests.get(url, timeout=35)
            response.raise_for_status()
            return BeautifulSoup(response.content, "html.parser")
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def listing(number):
    page = get(BASE if number == 1 else f"{BASE}/-1/{number}")
    links = {urljoin(BASE, a["href"]) for a in page.select('ul.jobs a[href*="/jobs/job/"]')}
    if not links:
        raise RuntimeError(f"No jobs on listing page {number}")
    return links


def detail(url):
    page = get(url)
    identifier = re.search(r"/(\d+)(?:/)?$", url)
    if not identifier:
        raise RuntimeError(f"Missing ID in {url}")
    job_id = identifier.group(1)
    jobs = []
    for tag in page.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(tag.get_text())
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("@type") == "JobPosting":
            jobs.append(data)
    if len(jobs) == 1:
        job = jobs[0]
    elif len(jobs) == 0 and job_id in PREVIOUS and "Rodericks Dental Partners" in page.title.get_text(" ", strip=True):
        old = PREVIOUS[job_id]
        job = {"title": old["title"], "hiringOrganization": {"name": "Rodericks Dental Partners"},
               "jobLocation": {"address": {"addressLocality": old["town"],
                   "addressRegion": old["county"], "addressCountry": old["country"]}},
               "datePosted": "", "validThrough": ""}
    else:
        raise RuntimeError(f"Expected one JobPosting on {url}: {len(jobs)}")
    employer = job.get("hiringOrganization", {}).get("name", "")
    if employer != "Rodericks Dental Partners":
        raise RuntimeError(f"Employer mismatch on {url}: {employer}")
    address = job.get("jobLocation", {}).get("address", {})
    country = address.get("addressCountry", "")
    postcode = address.get("postalCode", "").strip()
    if country not in ("United Kingdom", "UK", "GB") and not (not country and re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}", postcode, re.I)):
        raise RuntimeError(f"Non-UK job on {url}")
    main = page.select_one("main")
    heading = main.select_one("h1") if main else None
    if not main or not heading:
        raise RuntimeError(f"Missing detail body on {url}")
    description = main.get_text("\n", strip=True)
    city = address.get("addressLocality", "").strip()
    state = address.get("addressRegion", "").strip()
    location = ", ".join(x for x in (city, state, "United Kingdom") if x)
    return dict(jobId=job_id, title=job.get("title", "").strip(),
                description=description, jobUrl=url, postedDate=job.get("datePosted", "")[:10],
                jdDeadline=job.get("validThrough", "")[:10], company=employer,
                salaryRange="", employmentType="", worktype="", location=location,
                city=city, state=state, country="United Kingdom", ats="Custom")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if "--retry-failures" in sys.argv:
        prior_report = json.loads((OUT / "source-report.json").read_text(encoding="utf-8"))
        prior_rows = json.loads((OUT / "jobs.json").read_text(encoding="utf-8"))
        links = {item["url"] for item in prior_report["failures"]}
        total_pages = prior_report["listingPages"]
    else:
        first = get(BASE)
        pages = [int(x) for x in re.findall(r"/jobs/search/-1/(\d+)", str(first))]
        total_pages = max(pages, default=1)
        links = set(listing(1))
        with ThreadPoolExecutor(max_workers=6) as pool:
            for result in pool.map(listing, range(2, total_pages + 1)):
                links.update(result)
        prior_rows = []
    print(json.dumps({"listingPages": total_pages, "uniqueLinks": len(links)}), flush=True)
    rows, failures = prior_rows, []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(detail, url): url for url in sorted(links)}
        for future in as_completed(futures):
            try:
                rows.append(future.result())
            except Exception as error:
                failures.append({"url": futures[future], "error": str(error)})
    cutoff = "2026-07-24"
    excluded_old = sum(bool(row["postedDate"] and row["postedDate"] < cutoff) for row in rows)
    rows = [row for row in rows if not row["postedDate"] or row["postedDate"] >= cutoff]
    rows.sort(key=lambda row: int(row["jobId"]), reverse=True)
    with (OUT / "jobs.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (OUT / "jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "source-report.json").write_text(json.dumps({"source": BASE, "listingPages": total_pages,
        "uniqueLinks": len(links) + len(prior_rows), "exported": len(rows), "excludedOld": excluded_old,
        "unknownPostedDate": sum(not row["postedDate"] for row in rows), "cutoff": cutoff,
        "failures": failures,
        "employer": "Rodericks Dental Partners"}, indent=2), encoding="utf-8")
    print(json.dumps({"exported": len(rows), "failures": len(failures)}), flush=True)
    if failures:
        raise RuntimeError(f"{len(failures)} details failed; see source-report.json")


if __name__ == "__main__":
    main()
