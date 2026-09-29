#!/usr/bin/env python3
"""Fix Proactive extraction: dedupe, fix jobId/title, use correct location."""
import json, re, csv
from pathlib import Path
from collections import defaultdict

def extract_ref_from_url(url):
    """Extract job reference from URL."""
    # Pattern 1: ends with -NUMBER+LETTERS+NUMBER (e.g., -11761sr5)
    match = re.search(r'-(\d+[a-z]+\d*)/$', url, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    
    # Pattern 2: ends with -NUMBER (e.g., -11851)
    match = re.search(r'-(\d+)/$', url)
    if match:
        return match.group(1)
    
    # Pattern 3: ends with -LETTERS+NUMBER (e.g., -ac11854)
    match = re.search(r'-([a-z]+\d+)/$', url, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    
    # Fallback: use entire last segment
    match = re.search(r'/([^/]+)/$', url)
    return match.group(1) if match else url

def extract_title_from_desc(desc):
    """Extract actual title from description."""
    lines = [l.strip() for l in desc.split('\n') if l.strip()]
    
    # Find reference number, then look for title in next few lines
    for i, line in enumerate(lines):
        # Match reference patterns: alphanumeric OR pure numbers (length 5-12)
        # Examples: 11761SR5, AC11854, 11851, 11804HSDEV
        is_ref = re.match(r'^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{6,}$', line, re.IGNORECASE) or \
                 re.match(r'^\d{5,7}$', line)
        
        if is_ref:
            # Check next few lines for title
            for j in range(i+1, min(i+6, len(lines))):
                next_line = lines[j]
                # Skip salary and metadata lines
                if any(skip in next_line for skip in ['£', 'Posted', 'Website', 'Proactive IT', 'SPECIALIST', '| Hybrid', '| Remote']):
                    continue
                # This should be the title
                return next_line
    
    return "Unknown"

def fix_proactive(json_path):
    """Fix Proactive scrape-result.json."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Group by URL to dedupe
    by_url = defaultdict(list)
    for job in data['rows']:
        by_url[job['jobUrl']].append(job)
    
    fixed_rows = []
    for url, duplicates in by_url.items():
        # Pick the best entry (the one with actual job location, not Bristol office)
        job_location = None
        best_job = None
        
        for job in duplicates:
            loc = job.get('location', '')
            # Prefer actual locations (Leeds, London) over Bristol office
            if loc and 'Bristol' not in loc and job.get('city'):
                job_location = loc
                best_job = job
        
        # If all have Bristol (or none have proper location), use first
        if not best_job:
            best_job = duplicates[0]
        
        # Fix fields
        best_job['jobId'] = extract_ref_from_url(url)
        best_job['title'] = extract_title_from_desc(best_job.get('description', ''))
        
        # Ensure proper location data
        if job_location:
            best_job['location'] = job_location
        
        fixed_rows.append(best_job)
    
    data['rows'] = fixed_rows
    
    # Save
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return len(fixed_rows)

def regenerate_csv(json_path):
    """Regenerate CSV and export-rows from fixed JSON."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    rows = data.get('rows', [])
    
    # Write export-rows.json
    export_file = json_path.parent / 'export-rows.json'
    with open(export_file, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    
    # Write jobs.csv
    csv_file = json_path.parent / 'jobs.csv'
    fieldnames = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline',
                  'company', 'salaryRange', 'employmentType', 'worktype', 'location',
                  'city', 'state', 'country', 'ats']
    
    with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            csv_row = {k: row.get(k, '') for k in fieldnames}
            writer.writerow(csv_row)

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python fix-proactive.py <company-dir>")
        sys.exit(1)
    
    company_dir = Path(sys.argv[1])
    json_file = company_dir / 'scrape-result.json'
    
    if not json_file.exists():
        print(f"No scrape-result.json in {company_dir}")
        sys.exit(1)
    
    count = fix_proactive(json_file)
    print(f"Fixed {count} unique jobs")
    
    regenerate_csv(json_file)
    print(f"Regenerated CSV and export-rows.json")