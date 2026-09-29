"""Assemble the eight requested employers using source-verified September 24 exports."""

import csv
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "2026-09-24-main-uk-scrape" / "source-cache" / "eight-conversion"
DAILY = ROOT / "output" / "2026-09-24-main-uk-scrape" / "source-cache" / "daily"
COLUMNS = ["jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
           "company", "salaryRange", "employmentType", "worktype", "location",
           "city", "state", "country", "ats"]
SOURCES = {
    "p-ducker-systems-ltd": "p_ducker_systems_ltd",
    "partnering-health-ltd": "partnering_health_ltd",
    "pgs-ltd": "pgs_ltd",
    "pinpoint-resourcing-ltd": "pinpoint_resourcing_ltd",
    "ppghealthinjusticeweb": "ppg_health_in_justice",
}
SOURCE_IDS = {
    "commercial-contract-manager": "11455",  # PDS page-id
    "advanced-nurse-practitioner-advanced-clinical-practitioner-anp-acp": "12237",
    "forensic-healthcare-professinal-durham": "12470",
    "forensic-healthcare-professional-portsmouth": "12339",
    "forensic-healthcare-professional-scarborough": "12408",
    "general-practitioner-gp-out-of-hours-ooh-staffordshire-stoke-on-trent": "12547",
}


def location_parts(value):
    parts = [part.strip() for part in value.split(",")]
    if parts and parts[-1] in ("UK", "United Kingdom"):
        parts.pop()
    city = parts[0] if len(parts) >= 1 and not parts[0].startswith("HMP ") else ""
    state = parts[1] if len(parts) >= 2 and city else ""
    return city, state


def from_daily(slug, prefix):
    path = DAILY / ("ppg-health-in-justice" if slug == "ppghealthinjusticeweb" else slug) / f"{prefix}_jobs.csv"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        source = list(csv.DictReader(handle))
    rows = []
    for item in source:
        city, state = location_parts(item["location"])
        salary = item["salary"] if re.fullmatch(r"£\d+(?:-£\d+)?", item["salary"]) else ""
        rows.append(dict(jobId=SOURCE_IDS.get(item["jobId"], item["jobId"]), title=item["title"], description=item["description"],
                         jobUrl=item["jobUrl"], postedDate="", jdDeadline="", company=item["company"],
                         salaryRange=salary, employmentType=item["jobType"], worktype="",
                         location=item["location"], city=city, state=state,
                         country="United Kingdom", ats="Custom"))
    return rows


def pinpoint_group():
    board = "https://www.pinpointgrp.co.uk/vacancies"
    response = requests.get(board, timeout=30)
    response.raise_for_status()
    listing = BeautifulSoup(response.content, "html.parser")
    links = sorted({urljoin(board, a["href"]) for a in listing.select('a[href^="/vacancies/"]')})
    rows, excluded = [], []
    for url in links:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        page = BeautifulSoup(response.content, "html.parser")
        article = page.select_one("article.h-entry")
        title = page.select_one("h1")
        date = page.select_one("time.dt-published")
        if not article or not title or not date:
            raise RuntimeError(f"Incomplete vacancy page: {url}")
        month = date.get("datetime", "").split()[0]
        if month not in ("Jul", "Aug", "Sep"):
            excluded.append({"url": url, "reason": "outside current two-month window or date unclear"})
            continue
        description = article.get_text("\n", strip=True)
        match = re.search(r"Job Ref:\s*([A-Za-z0-9-]+)", description)
        identifier = match.group(1) if match else urlparse(url).path.rstrip("/").split("/")[-1]
        role_title = title.get_text(" ", strip=True)
        if "Essex" in role_title:
            location, city, state = "Essex, United Kingdom", "", "Essex"
        elif "contracts around London" in description:
            location, city, state = "London, Greater London, United Kingdom", "London", "Greater London"
        else:
            location, city, state = "", "", ""
        rows.append(dict(jobId=identifier, title=title.get_text(" ", strip=True), description=description,
                         jobUrl=url, postedDate="", jdDeadline="", company="Pinpoint Group Recruitment Ltd",
                         salaryRange="", employmentType="", worktype="", location=location,
                         city=city, state=state, country="United Kingdom", ats="Custom"))
    return rows, {"board": board, "linked": len(links), "excluded": excluded,
                  "note": "Visible date labels omit year; postedDate is blank. Four roles lack a precise job location, so location fields are blank. Supplied company website pin-point.co.uk belongs to a separately branded recruitment firm; these jobs are from the supplied pinpointgrp.co.uk board."}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    combined, report = [], {}
    for slug, prefix in SOURCES.items():
        rows = from_daily(slug, prefix)
        report[slug] = {"count": len(rows), "source": str(DAILY / slug)}
        write_company(slug, rows)
        combined.extend(rows)
    rows, detail = pinpoint_group()
    slug = "pinpoint-group-recruitment-ltd"
    write_company(slug, rows)
    combined.extend(rows)
    report[slug] = {"count": len(rows), **detail}
    for slug, reason in {
        "prdc-dental": "Supplied Rodericks board hires for Rodericks Dental Partners, not PR Dental Recruitment; the latter's official /jobs/ page is JavaScript rendered and was not verified here.",
        "prince-of-wales-medical-centre": "Supplied careers.pwh.org.uk board hires for Prince of Wales Hospice, not the named medical centre; the supplied website returned HTTP 403.",
    }.items():
        write_company(slug, [])
        report[slug] = {"count": 0, "status": "identity_mismatch_or_unverified", "reason": reason}
    write_csv(OUT / "companies.csv", combined)
    (OUT / "companies.json").write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "source-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v["count"] for k, v in report.items()}))


def write_csv(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_company(slug, rows):
    folder = OUT / slug
    folder.mkdir(exist_ok=True)
    write_csv(folder / "jobs.csv", rows)
    (folder / "jobs.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
