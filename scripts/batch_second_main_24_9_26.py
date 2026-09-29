#!/usr/bin/env python3
"""Batch scrape runner for second main 24-9-26. Saves to: output/second main 24-9-26/"""
import csv, json, subprocess, sys, shutil
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Any

ROOT = Path(r"D:\Internship\MAIN\UK SCRAPPER")
OUT_ROOT = ROOT / "output" / "second main 24-9-26"
ENGINE_ROOT = ROOT / "web_scrapper_project"
BATCH_MANIFEST_PATH = ENGINE_ROOT / "companies-main-24-9-26.json"

def load_manifest(p: Path) -> List[Dict[str, Any]]:
    if not p.exists(): return []
    with open(p, "r", encoding="utf-8") as f: return json.load(f)

def run_batch(company: Dict[str, Any]) -> bool:
    slug = company.get("slug")
    if not slug: return False
    manifest_path = ENGINE_ROOT / f"run-{slug}.json"
    with open(manifest_path, "w", encoding="utf-8") as f: json.dump([company], f, ensure_ascii=False)
    cmd = f'cmd /c "cd /d {ENGINE_ROOT} && npm run batch -- {manifest_path} --out {ROOT}\\output\\temp-{slug}"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Batch failed for {slug}:\n{result.stderr}", file=sys.stderr)
        return False
    return True

def move_to_target(src_dir: Path, slug: str, company: Dict[str, Any]) -> int:
    target_dir = OUT_ROOT / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    src_csv, src_json = src_dir / "jobs.csv", src_dir / "jobs.json"
    dst_csv = target_dir / f"{slug}_jobs.csv"
    dst_json = target_dir / f"{slug}_jobs.json"
    row_count = 0
    if src_csv.exists():
        with open(src_csv, "r", encoding="utf-8-sig", newline="") as f:
            r = csv.DictReader(f); rows = list(r); row_count = len(rows); fn = r.fieldnames or []
        with open(dst_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fn); w.writeheader(); w.writerows(rows)
    if src_json.exists(): shutil.copy(src_json, dst_json)
    else: dst_json.write_text("[]", encoding="utf-8")
    
    summary = [
        f"# {company.get('name', slug)} - Job Scraping Summary", "",
        f"**Company**: {company.get('name','')}", f"**Website**: {company.get('website','')}",
        f"**Careers Page**: {company.get('careersUrl','')}", f"**Sector**: {company.get('sector','')}",
        f"**Location**: {company.get('region','')}, {company.get('city','')}, {company.get('country','')}", "",
        "## Scraping Details", f"- **Date Scraped**: {date.today().isoformat()}",
        f"- **Jobs Extracted**: {row_count}", "", "## Notes", ""
    ]
    if "reed.co.uk" in company.get("careersUrl",""): summary.append("- Source: Reed aggregator (secondary source)")
    if "milkround.com" in company.get("careersUrl",""): summary.append("- Source: Milkround aggregator (secondary source)")
    if "jobs.nhs.uk" in company.get("careersUrl",""): summary.append("- Source: NHS Jobs (official board)")
    summary.append(f"\n---\n*Last Updated: {date.today().isoformat()}*")
    (target_dir / f"{slug}_summary.md").write_text("\n".join(summary), encoding="utf-8")
    
    company_info = {
        "name": company.get("name",""), "slug": slug, "website": company.get("website",""),
        "careersUrl": company.get("careersUrl",""), "sector": company.get("sector",""),
        "location": {"city": company.get("city",""), "region": company.get("region",""), "country": company.get("country","")},
        "scrapedAt": datetime.now().isoformat(), "jobsCount": row_count
    }
    (target_dir / "company.json").write_text(json.dumps(company_info, indent=2), encoding="utf-8")
    
    root_json = OUT_ROOT / f"{slug}_jobs.json"
    root_json.write_text(dst_json.read_text(encoding="utf-8"), encoding="utf-8") if dst_json.exists() else "[]", encoding="utf-8")
    return row_count

def delete_temp_dir(slug: str):
    p = ROOT / "output" / f"temp-{slug}"
    if p.exists(): shutil.rmtree(p, ignore_errors=True)

def rebuild_aggregated():
    entries = []
    for company_dir in sorted(OUT_ROOT.iterdir()):
        if not company_dir.is_dir(): continue
        slug = company_dir.name
        csv_path = company_dir / f"{slug}_jobs.csv"
        row_count = sum(1 for _ in open(csv_path, "r", encoding="utf-8-sig")) - 1 if csv_path.exists() else 0
        entries.append({"slug": slug, "count": row_count})
    total = sum(e["count"] for e in entries)
    
    readme = ["# Second Main Scraped Companies - 24/9/26", "", "This folder contains verified scraped data.", "", "## Companies Included", ""]
    for e in entries:
        slug, count = e["slug"], e["count"]
        readme.extend([f"### {slug.replace('-',' ').title()} {'✅' if count>0 else '⚠️'}", f"- **Jobs Scraped**: {count}",
            "- **Files**:", f"  - `{slug}/{slug}_jobs.csv` - {count} job records", f"  - `{slug}/{slug}_jobs.json`", f"  - `{slug}/{slug}_summary.md`", ""])
    readme.extend(["## Summary", f"- **Total Companies**: {len(entries)}", f"- **Total Jobs Scraped**: {total}", "- **Date**: September 24, 2026", "", "---", "*Last updated: 2026-09-24*"])
    (OUT_ROOT / "README.md").write_text("\n".join(readme), encoding="utf-8")
    
    summary = ["# Job Scraping Summary Report", f"Generated: {datetime.now().isoformat()}", "", "## Summary", f"- **Total Companies**: {len(entries)}", f"- **Total Jobs Scraped**: {total}", "", "## Companies", ""]
    for e in entries: summary.append(f"- **{e['slug']}**: {e['count']} jobs")
    summary.extend(["", "---", f"*Last Updated: {date.today().isoformat()}*"])
    (OUT_ROOT / "job_scraping_summary.md").write_text("\n".join(summary), encoding="utf-8")

def main(manifest: List[Dict[str, Any]]):
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    for company in manifest:
        slug = company.get("slug")
        print(f"\n Scraping {company.get('name','')} ({slug})...", flush=True)
        success = run_batch(company)
        if not success: print(f" Batch failed for {slug}. Creating empty entry...", file=sys.stderr)
        src_dir = ROOT / "output" / f"temp-{slug}"
        row_count = move_to_target(src_dir, slug, company)
        delete_temp_dir(slug)
        print(f" Saved {row_count} rows for {slug}.", flush=True)
    rebuild_aggregated()
    print("\n Aggregated files rebuilt.", flush=True)

if __name__ == "__main__":
    manifest = load_manifest(BATCH_MANIFEST_PATH)
    if not manifest: print("No manifest found.", file=sys.stderr); sys.exit(1)
    main(manifest)
