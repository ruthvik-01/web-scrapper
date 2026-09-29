#!/usr/bin/env python3
"""Regenerate jobs CSV and export-rows.json from fixed scrape-result.json."""
import json, csv
from pathlib import Path
import sys

def regenerate_outputs(input_dir):
    input_path = Path(input_dir)
    
    # Load fixed scrape-result.json
    json_file = input_path / 'scrape-result.json'
    if not json_file.exists():
        print(f"No scrape-result.json in {input_dir}")
        return
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    rows = data.get('rows', [])
    
    # Generate export-rows.json
    export_file = input_path / 'export-rows.json'
    with open(export_file, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    
    # Generate jobs.csv  
    csv_file = input_path / 'jobs.csv'
    fieldnames = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline',
                  'company', 'salaryRange', 'employmentType', 'worktype', 'location',
                  'city', 'state', 'country', 'ats']
    
    with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            # Ensure all fields exist
            csv_row = {k: row.get(k, '') for k in fieldnames}
            writer.writerow(csv_row)
    
    print(f"Regenerated {len(rows)} rows:")
    print(f"  - {export_file}")
    print(f"  - {csv_file}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python regenerate-from-scrape-result.py <company-output-dir>")
        sys.exit(1)
    
    regenerate_outputs(sys.argv[1])