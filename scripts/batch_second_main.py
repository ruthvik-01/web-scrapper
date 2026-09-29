#!/usr/bin/env python3
"""Batch scrape runner - saves to output/second main 24-9-26/"""
import csv, json, subprocess, sys, shutil, os
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Any

ROOT = Path(r"D:\Internship\MAIN\UK SCRAPPER")
OUT_ROOT = ROOT / "output" / "second main 24-9-26"
ENGINE_ROOT = ROOT / "web_scrapper_project"
MANIFEST = ENGINE_ROOT / "companies-main-24-9-26.json"

def load_manifest():
    with open(MANIFEST, "r", encoding="utf-8") as f:
        return json.load(f)

def run_batch(company):
    slug = company.get("slug")
    if not slug: return False
    # Write manifest without BOM
    manifest_path = ENGINE_ROOT / f"run-{slug}.json"
    with open(manifest_path, "w", encoding="utf-8", newline="") as f:
        json.dump([company], f, ensure_ascii=False)
    out_dir = ROOT / "output" / f"temp-{slug}"
    cmd = f'npx tsx batch.ts run-{slug}.json --out "../output/temp-{slug}"'
    env = os.environ.copy()
    env["NODE_NO_WARNINGS"] = "1"
    result = subprocess.run(cmd, cwd=str(ENGINE_ROOT), shell=True, capture_output=True, text=True, env=env)
    if result.returncode not in (0, 2):  # 0=success, 2=partial
        print(f"Batch issue for {slug}: {result.stderr[:200]}", file=sys.stderr)
        return False
    return True

def move_to_target(src_dir, slug, company):
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
    # Summary
    summary = [f"# {company.get('name',slug)} - Job Scraping Summary", "",
        f"**Company**: {company.get('name','')}", f"**Website**: {company.get('website','')}",
        f"**Careers Page**: {company.get('careersUrl','')}", f"**Sector**: {company.get('sector','')}",
        f"**Location**: {company.get('region','')}, {company.get('city','')}, {company.get('country','')}", "",
        "## Scraping Details", f"- **Date Scraped**: {date.today().isoformat()}", f"- **Jobs Extracted**: {row_count}", "", "## Notes", ""]
    if "reed.co.uk" in company.get("careersUrl",""): summary.append("- Source: Reed (secondary)")
    if "milkround.com" in company.get("careersUrl",""): summary.append("- Source: Milkround (secondary)")
    if "jobs.nhs.uk" in company.get("careersUrl",""): summary.append("- Source: NHS Jobs")
    summary.append(f"\n---\n*Last Updated: {date.today().isoformat()}*")
    (target_dir / f"{slug}_summary.md").write_text("\n".join(summary), encoding="utf-8")
    # company.json
    company_info = {"name": company.get("name",""), "slug": slug, "website": company.get("website",""),
        "careersUrl": company.get("careersUrl",""), "sector": company.get("sector",""),
        "location": {"city": company.get("city",""), "region": company.get("region",""), "country": company.get("country","")},
        "scrapedAt": datetime.now().isoformat(), "jobsCount": row_count}
    (target_dir / "company.json").write_text(json.dumps(company_info, indent=2), encoding="utf-8")
    # Root JSON
    shutil.copy(dst_json, OUT_ROOT / f"{slug}_jobs.json")
    return row_count

def rebuild_aggregated():
    entries = []
    for d in sorted(OUT_ROOT.iterdir()):
        if not d.is_dir(): continue
        slug = d.name
        csv_path = d / f"{slug}_jobs.csv"
        row_count = sum(1 for _ in open(csv_path, "r", encoding="utf-8-sig")) - 1 if csv_path.exists() else 0
        entries.append({"slug": slug, "count": row_count})
    total = sum(e["count"] for e in entries)
    # README
    readme = ["# Second Main Scraped Companies - 24/9/26", "", "Verified scraped data.", "", "## Companies", ""]
    for e in entries:
        slug, count = e["slug"], e["count"]
        readme.extend([f"### {slug.replace('-',' ').title()} {'✅' if count>0 else '⚠️'}", f"- **Jobs**: {count}",
            f"- Files: `{slug}_jobs.csv`, `{slug}_jobs.json`, `{slug}_summary.md`", ""])
    readme.extend(["## Summary", f"- **Total Companies**: {len(entries)}", f"- **Total Jobs**: {total}", "", "---", "*Updated: 2026-09-24*"])
    (OUT_ROOT / "README.md").write_text("\n".join(readme), encoding="utf-8")
    # job_scraping_summary.md
    summary = ["# Job Scraping Summary Report", f"Generated: {datetime.now().isoformat()}", "", "## Summary",
        f"- **Total Companies**: {len(entries)}", f"- **Total Jobs Scraped**: {total}", "", "## Companies", ""]
    for e in entries: summary.append(f"- **{e['slug']}**: {e['count']} jobs")
    summary.extend(["", "---", f"*Updated: {date.today().isoformat()}*"])
    (OUT_ROOT / "job_scraping_summary.md").write_text("\n".join(summary), encoding="utf-8")

def main():
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    for company in manifest:
        slug = company.get("slug")
        print(f"\n Scraping {company.get('name','')} ({slug})...", flush=True)
        run_batch(company)
        src_dir = ROOT / "output" / f"temp-{slug}"
        row_count = move_to_target(src_dir, slug, company)
        # Cleanup temp
        if src_dir.exists(): shutil.rmtree(src_dir, ignore_errors=True)
        print(f" Saved {row_count} rows.", flush=True)
    rebuild_aggregated()
    print("\n Done!", flush=True)

if __name__ == "__main__": main()
