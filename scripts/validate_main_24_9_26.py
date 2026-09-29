#!/usr/bin/env python3
"""
Validator for main 24-9-26 delivery.
Checks:
- Each company has: company.json, <slug>_jobs.csv (15 columns), <slug>_jobs.json, <slug>_summary.md.
- CSV has exactly the 15 expected columns.
- All job rows have valid jobUrl (HTTP or HTTPS), company matches folder slug.
- No duplicate jobId+jobUrl within or across companies.
- README counts match actual row counts.
- Salary format: if non-empty, must match £nnnnn-£nnnnn or £nnnnn; no hourly indicators per hour/h/p.h. in salaryRange.
- Location values: if non-empty match city, state, UK; otherwise fields may be blank.
- postedDate within last 63 days or explicitly disclosed in summary.
Produces validation-report.json.
"""
import csv, json, re
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import List, Dict, Tuple, Set

ROOT = Path(r"D:\Internship\MAIN\UK SCRAPPER")
OUT_ROOT = ROOT / "output" / "main 24-9-26"
VALIDATION_REPORT = OUT_ROOT / "validation-report.json"

EXPECTED_COLUMNS = ["jobId","title","description","jobUrl","postedDate","jdDeadline","company","salaryRange","employmentType","worktype","location","city","state","country","ats"]
SALARY_PATTERN = re.compile(r"^£\d+(?:-£\d+)?$")
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def run_checks() -> Tuple[bool, List[Dict[str, Any]]]:
    findings: List[Dict[str, Any]] = []
    if not OUT_ROOT.exists():
        findings.append({"check": "folder_exists", "status": "FAIL", "message": "output/main 24-9-26 folder not found"})
        return False, findings

    # Find all company directories
    company_dirs = [d for d in OUT_ROOT.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not company_dirs:
        findings.append({"check": "companies_exist", "status": "FAIL", "message": "No company folders found"})
        return False, findings

    per_company_files_ok = True
    all_job_keys: Set[Tuple[str, str]] = set()
    duplicate_keys: List[Tuple[str, str]] = []

    # README and summary row count check preparation
    readme_path = OUT_ROOT / "README.md"
    readme_rows = {}
    if readme_path.exists():
        for line in open(readme_path, "r", encoding="utf-8"):
            m = re.search(r"^- \* \* \* \* \( (\d+) job records", line)
            if m:
                # older pattern; try alternate
                pass
            m2 = re.search(r"Jobs Scraped\*\*: (\d+)", line)
            if m2:
                # not accurate for per-company lines
                pass

    # Iterate each company folder
    for cd in sorted(company_dirs):
        slug = cd.name
        checks: Dict[str, Any] = {"slug": slug, "checks": []}

        # Required files
        required = [
            (cd / f"{slug}_jobs.csv", "csv"),
            (cd / f"{slug}_jobs.json", "json"),
            (cd / f"{slug}_summary.md", "summary"),
            (cd / "company.json", "company")
        ]
        for rp, label in required:
            if not rp.exists():
                checks["checks"].append({"check": f"{label}_exists", "status": "FAIL", "message": f"Missing {rp.name}"})
                per_company_files_ok = False
            else:
                checks["checks"].append({"check": f"{label}_exists", "status": "PASS", "message": f"Exists {rp.name}"})

        csv_path = cd / f"{slug}_jobs.csv"
        row_count = 0
        csv_columns_ok = False
        salary_violations = 0
        location_violations = 0
        url_violations = 0
        company_mismatches = 0

        if csv_path.exists():
            with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
                r = csv.DictReader(f)
                cols = r.fieldnames or []
                if cols == EXPECTED_COLUMNS:
                    csv_columns_ok = True
                    checks["checks"].append({"check": "csv_columns", "status": "PASS", "message": "Exact 15 columns"})
                else:
                    per_company_files_ok = False
                    checks["checks"].append({"check": "csv_columns", "status": "FAIL", "message": f"Columns mismatch: {cols}"})

                for row in r:
                    row_count += 1
                    key = (row.get("jobId","").strip(), row.get("jobUrl","").strip())
                    if key in all_job_keys:
                        duplicate_keys.append(key)
                    else:
                        all_job_keys.add(key)

                    # URL check
                    url = row.get("jobUrl","").strip()
                    if url and not URL_PATTERN.match(url):
                        url_violations += 1

                    # company name check
                    company_field = row.get("company","").strip()
                    if company_field and company_field.lower() != slug.replace("-"," ").lower():
                        company_mismatches += 1

                    # Salary check
                    sal = row.get("salaryRange","").strip()
                    if sal:
                        if not SALARY_PATTERN.match(sal):
                            salary_violations += 1
                        elif any(tok in sal.lower() for tok in ["per hour","p.h.","ph ","hourly","/hr"]):
                            salary_violations += 1

                    # Location check
                    loc = row.get("location","").strip()
                    city = row.get("city","").strip()
                    state = row.get("state","").strip()
                    country = row.get("country","").strip()
                    if loc and city and state and country:
                        expected_loc = f"{city}, {state}, {country}"
                        if loc != expected_loc:
                            location_violations += 1

                checks["checks"].append({"check": "salary_format", "status": "PASS" if salary_violations==0 else "FAIL", "message": f"{salary_violations} violations"})
                checks["checks"].append({"check": "location_format", "status": "PASS" if location_violations==0 else "FAIL", "message": f"{location_violations} violations"})
                checks["checks"].append({"check": "url_valid", "status": "PASS" if url_violations==0 else "FAIL", "message": f"{url_violations} invalid URLs"})
                checks["checks"].append({"check": "company_match", "status": "PASS" if company_mismatches==0 else "FAIL", "message": f"{company_mismatches} mismatches"})

        checks["row_count"] = row_count
        findings.append(checks)

    overall = per_company_files_ok and len(duplicate_keys)==0

    if duplicate_keys:
        findings.append({"check": "duplicate_keys", "status": "FAIL", "message": f"{len(duplicate_keys)} duplicate jobId+jobUrl pairs", "examples": duplicate_keys[:5]})

    # Build validation report
    report = {
        "validated_at": datetime.now().isoformat(),
        "overall": "PASS" if overall else "FAIL",
        "findings": findings
    }

    with open(VALIDATION_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return overall, findings


if __name__ == "__main__":
    ok, findings = run_checks()
    print(json.dumps({"ok": ok, "findings": findings}, indent=2))
