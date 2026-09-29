#!/usr/bin/env python3
"""
Fix EW Recruitment extraction:
- Replace "URGENT" titles with actual job titles from description
- Extract the first job title mentioned in description
"""

import json
import re
from pathlib import Path

def extract_title_from_description(description: str) -> str:
    """Extract job title from description."""
    
    # Pattern 1: "My client is looking for a/an X to join their team"
    match = re.search(r'(?:My client is looking for a|We are looking for a|I am looking for a)n?\s+([^.]+?)\s+to join', description, re.IGNORECASE)
    if match:
        title = match.group(1).strip()
        # Clean up
        title = re.sub(r'\s+', ' ', title)
        return title
    
    # Pattern 2: "My client is looking for X to"
    match = re.search(r'My client is looking for\s+([^.]+?)\s+to\s+join', description, re.IGNORECASE)
    if match:
        title = match.group(1).strip()
        title = re.sub(r'\s+', ' ', title)
        return title
    
    # Pattern 3: Extract from first line that mentions role type
    lines = description.split('\n')
    for line in lines[:5]:
        line = line.strip()
        # Skip generic intros
        if any(x in line.lower() for x in ['my client', 'salary', 'duties', 'we are', 'purpose']):
            continue
        # If it's a job title-like phrase
        if len(line) > 10 and len(line) < 100:
            # Remove common prefixes
            line = re.sub(r'^(My client is looking for a|We are looking for a|Looking for a)\s*', '', line, flags=re.IGNORECASE)
            if line:
                return line.strip()
    
    return None

def fix_ew_recruitment(base_path: Path):
    """Fix EW Recruitment data."""
    
    json_file = base_path / "scrape-result.json"
    
    if not json_file.exists():
        print(f"ERROR: {json_file} not found")
        return
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    rows = data.get('rows', [])
    fixed_count = 0
    
    for row in rows:
        title = row.get('title', '')
        
        # Fix URGENT titles
        if title.upper() == 'URGENT':
            description = row.get('description', '')
            new_title = extract_title_from_description(description)
            
            if new_title:
                row['title'] = new_title
                print(f"Fixed: '{title}' -> '{new_title}'")
                fixed_count += 1
            else:
                print(f"WARNING: Could not fix job {row.get('jobId')} - title remains '{title}'")
    
    # Save fixed JSON
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    # Regenerate CSV
    import csv
    
    csv_file = base_path / "jobs.csv"
    fieldnames = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline', 
                  'company', 'salaryRange', 'employmentType', 'worktype', 'location', 
                  'city', 'state', 'country', 'ats']
    
    with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"\n✅ Fixed {fixed_count} jobs")
    print(f"✅ Updated {json_file.name}")
    print(f"✅ Regenerated {csv_file.name}")

if __name__ == "__main__":
    base_path = Path("D:/Internship/MAIN/UK SCRAPPER/output/ruhvik-batch-3-2026-09-22/ew-recruitment")
    fix_ew_recruitment(base_path)
