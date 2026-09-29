#!/usr/bin/env python3
"""
Batch scrape runner for main 24-9-26.
- Reads company manifest from stdin or a JSON file path.
- Calls the TypeScript engine via npm run batch for each company.
- Normalizes engine output into the per-company folder layout under output/main 24-9-26/.
- Builds and updates aggregated README.md and job_scraping_summary.md.
"""
import csv, json, subprocess, sys, re, shutil, hashlib
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Any, Optional

ROOT = Path(r"D:\Internship\MAIN\UK SCRAPPER")
OUT_ROOT = ROOT / "output" / "main 24-9-26"
ENGINE_ROOT = ROOT / "web_scrapper_project"
BATCH_MANIFEST_PATH = ENGINE_ROOT / "companies-main-24-9-26.json"

def load_manifest(p: Path) -> List[Dict[str, Any]]:
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def run_batch(company: Dict[str, Any]) -> bool:
    slug = company.get("slug")
    if not slug:
        return False
    manifest_path = ENGINE_ROOT / f"run-{slug}.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump([company], f, ensure_ascii=False)
    cmd = ["npm.cmd", "run", "batch", "--", str(manifest_path), "--out", str(ROOT / "output" / f"temp-{slug}")]
    result = subprocess.run(cmd, cwd=str(ENGINE_ROOT), capture_output=True, text=True, shell=True)
    if result.returncode != 0:
        print(f"Batch failed for {slug}:\n{result.stderr}", file=sys.stderr)
        return False
    return True

def move_to_target(src_dir: Path, slug: str, company: Dict[str, Any]) -> int:
    target_dir = OUT_ROOT / slug
    target_dir.mkdir(parents=True, exist_ok=True)

    src_csv = src_dir / "jobs.csv"
    src_json = src_dir / "jobs.json"
    dst_csv = target_dir / f"{slug}_jobs.csv"
    dst_json = target_dir / f"{slug}_jobs.json"
    dst_summary = target_dir / f"{slug}_summary.md"
    dst_company_json = target_dir / "company.json"

    row_count = 0
    if src_csv.exists():
        rows = []
        with open(src_csv, "r", encoding="utf-8-sig", newline="") as f:
            r = csv.DictReader(f)
            fieldnames = r.fieldnames or []
            for row in r:
                rows.append(row)
        row_count = len(rows)
        with open(dst_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)

    if src_json.exists():
        shutil.copy(src_json, dst_json)
    else:
        with open(dst_json, "w", encoding="utf-8") as f:
            json.dump([], f)

    summary_lines = [
        f"# {company.get('name', slug)} - Job Scraping Summary",
        "",
        f"**Company**: {company.get('name', '')}",
        f"**Website**: {company.get('website', '')}",
        f"**Careers Page**: {company.get('careersUrl', '')}",
        f"**Sector**: {company.get('sector', '')}",
        f"**Location**: {company.get('region', '')}, {company.get('city', '')}, {company.get('country', '')}",
        "",
        "## Scraping Details",
        f"- **Date Scraped**: {date.today().isoformat()}",
        f"- **Jobs Extracted**: {row_count}",
        "",
        "## Notes",
        ""
    ]
    if company.get("careersUrl","").startswith("https://www.reed.co.uk") or "reed.co.uk" in company.get("careersUrl",""):
        summary_lines.append("- Source: Reed aggregator (secondary source)")
    if "milkround.com" in company.get("careersUrl",""):
        summary_lines.append("- Source: Milkround aggregator (secondary source)")
    if "jobs.nhs.uk" in company.get("careersUrl",""):
        summary_lines.append("- Source: NHS Jobs (official board)")

    summary_lines.append(f"\n---\n*Last Updated: {date.today().isoformat()}*")
    with open(dst_summary, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines))

    company_info = {
        "name": company.get("name", ""),
        "slug": slug,
        "website": company.get("website", ""),
        "careersUrl": company.get("careersUrl", ""),
        "sector": company.get("sector", ""),
        "location": {
            "city": company.get("city", ""),
            "region": company.get("region", ""),
            "country": company.get("country", "")
        },
        "scrapedAt": datetime.now().isoformat(),
        "jobsCount": row_count
    }
    with open(dst_company_json, "w", encoding="utf-8") as f:
        json.dump(company_info, f, indent=2)

    root_json = OUT_ROOT / f"{slug}_jobs.json"
    if dst_json.exists():
        shutil.copy(dst_json, root_json)
    else:
        with open(root_json, "w", encoding="utf-8") as f:
            json.dump([], f)

    return row_count

def delete_temp_dir(slug: str):
    p = ROOT / "output" / f"temp-{slug}"
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)

def rebuild_aggregated():
    entries = []
    for company_dir in sorted(OUT_ROOT.iterdir()):
        if not company_dir.is_dir():
            continue
        slug = company_dir.name
        csv_path = company_dir / f"{slug}_jobs.csv"
        if csv_path.exists():
            row_count = sum(1 for _ in open(csv_path, "r", encoding="utf-8-sig")) - 1
        else:
            row_count = 0
        entries.append({"slug": slug, "count": row_count})
    total = sum(e["count"] for e in entries)

    readme_lines = [
        "# Main Scraped Companies - 24/9/26",
        "",
        "This folder contains verified scraped data for companies with successful scrapes.",
        "",
        "## Companies Included",
        ""
    ]
    for e in entries:
        slug = e["slug"]
        count = e["count"]
        json_path = OUT_ROOT / f"{slug}_jobs.json"
        try:
            data = json.load(open(json_path, "r", encoding="utf-8"))
            industry = data[0].get("industry","") if isinstance(data, list) and data else ""
        except Exception:
            industry = ""
        file_block = (f"- `{slug}/{slug}_jobs.csv` - {count} job records\n"
                       f"- `{slug}/{slug}_jobs.json` - JSON format backup\n"
                       f"- `{slug}/{slug}_summary.md` - Summary report\n")
        readme_lines.append(f"### {slug.replace('-',' ').title()} {'✅' if count>0 else '⚠️'}")
        readme_lines.append(f"- **Jobs Scraped**: {count}")
        readme_lines.append("- **Files**:")
        readme_lines.append(file_block)
        readme_lines.append("")

    readme_lines.append("## Summary")
    readme_lines.append(f"- **Total Companies**: {len(entries)}")
    readme_lines.append(f"- **Total Jobs Scraped**: {total}")
    readme_lines.append(f"- **Date**: September 24, 2026")
    readme_lines.append("")
    readme_lines.append("---")
    readme_lines.append("*Last updated: 2026-09-24*")

    with open(OUT_ROOT / "README.md", "w", encoding="utf-8") as f:
        f.write("\n".join(readme_lines))

    summary_lines = [
        "# Job Scraping Summary Report",
        f"Generated: {datetime.now().isoformat()}",
        "",
        "## Summary",
        f"- **Total Companies**: {len(entries)}",
        f"- **Total Jobs Scraped**: {total}",
        "",
        "## Companies",
        ""
    ]
    for e in entries:
        slug = e["slug"]
        count = e["count"]
        summary_lines.append(f"- **{slug}**: {count} jobs")
    summary_lines.append("")
    summary_lines.append("---")
    summary_lines.append(f"*Last Updated: {date.today().isoformat()}*")

    with open(OUT_ROOT / "job_scraping_summary.md", "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines))


def main(manifest: List[Dict[str, Any]]):
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    for company in manifest:
        slug = company.get("slug")
        name = company.get("name", "").replace("-"," ").title()
        print(f"\n Scraping {name} ({slug})...", flush=True)
        success = run_batch(company)
        if not success:
            print(f" Batch failed for {slug}. Creating empty entry...", file=sys.stderr)
        src_dir = ROOT / "output" / f"temp-{slug}"
        row_count = move_to_target(src_dir, slug, company)
        delete_temp_dir(slug)
        print(f" Saved {row_count} rows for {slug}.", flush=True)
    rebuild_aggregated()
    print("\n Aggregated files rebuilt.", flush=True)


if __name__ == "__main__":
    manifest_path = ENGINE_ROOT / "companies-main-24-9-26.json"
    manifest = load_manifest(manifest_path)
    if not manifest:
        print("No manifest found.", file=sys.stderr)
        sys.exit(1)
    main(manifest)
