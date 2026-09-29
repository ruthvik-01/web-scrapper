#!/usr/bin/env python3
"""Fix Proactive Appointments extraction: extract jobId from URL and proper title from h1/description."""
import json, re, csv, sys
from pathlib import Path

def extract_ref_from_url(url):
    """Extract job reference (e.g., 11761SR5) from URL."""
    match = re.search(r'/job/[^/]*-(\d{5}[A-Z]{2}\d?)/', url)
    return match.group(1) if match else url

def extract_title_from_description(desc):
    """Extract actual title from first lines of description.
    Format: REF_NUM\nSalary\nJob Title - Subtitle\nLocation\n"""
    lines = desc.split('\n')
    if len(lines) >= 3:
        # Line 3 typically has "Job Title – Subtitle" 
        title_line = lines[2].strip()
        # Remove location/contract info that might follow
        if ' | ' in title_line:
            title_line = title_line.split(' | ')[0]
        return title_line
    return "Unknown"

def fix_proactive_jobs(input_dir):
    """Fix all Proactive job CSV files."""
    input_path = Path(input_dir)
    
    # Fix scrape-result.json
    json_file = input_path / 'scrape-result.json'
    if not json_file.exists():
        print(f"No scrape-result.json found in {input_dir}")
        return
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    fixed = 0
    for row in data.get('rows', []):
        # Extract reference from URL
        ref = extract_ref_from_url(row['jobUrl'])
        
        # Extract proper title from description
        title = extract_title_from_description(row.get('description', ''))
        
        # Only fix if we found better values
        old_jobId = row.get('jobId', '')
        old_title = row.get('title', '')
        
        # Fix jobId if it's a full URL
        if old_jobId.startswith('http'):
            row['jobId'] = ref
            
        # Fix title if it looks like a reference number
        if re.match(r'^\d{5}[A-Z]{2}\d?$', old_title):
            row['title'] = title
            
        if row['jobId'] != old_jobId or row['title'] != old_title:
            fixed += 1
    
    # Save fixed JSON
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Fixed {fixed} Proactive jobs")
    return data

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python fix-proactive-extraction.py <output-dir>")
        sys.exit(1)
    
    fix_proactive_jobs(sys.argv[1])