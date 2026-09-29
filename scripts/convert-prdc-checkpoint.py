#!/usr/bin/env python3
"""Convert PRDC checkpoint JSON to proper CSV format."""

import json
import csv
import re
from pathlib import Path
from datetime import datetime

def parse_location(location):
    """Parse location string into town, county."""
    if not location:
        return '', ''
    loc = location.replace(', United Kingdom', '').replace(',United Kingdom', '').strip()
    loc = re.sub(r',\s*Flexible\s*$', '', loc, flags=re.IGNORECASE).strip()
    parts = [p.strip() for p in loc.split(',') if p.strip()]
    if not parts:
        return '', ''
    town = parts[0]
    county = parts[-1] if len(parts) > 1 else ''
    return town, county

def parse_salary(salary_text):
    """Normalize salary to proper format."""
    if not salary_text:
        return ''
    salary_text = salary_text.strip()
    if salary_text.lower() == 'competitive' or salary_text.lower() == 'competitive salary':
        return ''
    match = re.search(r'£?([\d,]+)\s*(?:-\s*£?([\d,]+))?', salary_text)
    if match:
        low = match.group(1).replace(',', '')
        high = match.group(2).replace(',', '') if match.group(2) else low
        return f'£{low}-£{high}'
    return ''

def main():
    checkpoint_path = Path('web_scrapper_project/output/prdc-dental-2026-09-24/checkpoint.json')
    output_path = Path('output/prdc-dental-24-9-26')
    output_path.mkdir(parents=True, exist_ok=True)
    
    with open(checkpoint_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    jobs = data.get('jobs', [])
    print(f"Processing {len(jobs)} jobs...")
    
    columns = ['jobId', 'title', 'location', 'company', 'salary', 'jobType', 
               'description', 'closingDate', 'url', 'industry', 'city', 
               'state', 'country', 'postedDate', 'experienceLevel']
    
    rows = []
    today = datetime.now().strftime('%Y-%m-%d')
    
    for job in jobs:
        town, county = parse_location(job.get('location', ''))
        salary = parse_salary(job.get('salary', ''))
        location = f"{town}, {county}, UK" if county else f"{town}, UK"
        
        row = {
            'jobId': job.get('jobId', ''),
            'title': job.get('title', ''),
            'location': location,
            'company': 'PRDC Dental',
            'salary': salary,
            'jobType': job.get('contractType', ''),
            'description': '',
            'closingDate': '',
            'url': job.get('url', ''),
            'industry': 'Healthcare & Social Care',
            'city': town,
            'state': county,
            'country': 'United Kingdom',
            'postedDate': today,
            'experienceLevel': ''
        }
        rows.append(row)
    
    csv_path = output_path / 'prdc-dental-jobs.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    
    json_path = output_path / 'prdc-dental-jobs.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2)
    
    company_path = output_path / 'company.json'
    company_data = {
        'company': 'PRDC Dental',
        'slug': 'prdc-dental',
        'url': 'https://prdentalrecruitment.co.uk/',
        'careersUrl': 'https://careers.rodericksdentalpartners.co.uk/jobs/search',
        'industry': 'Healthcare & Social Care',
        'city': 'London',
        'state': 'Greater London',
        'country': 'United Kingdom',
        'jobsCount': len(rows),
        'scrapedAt': today,
        'totalPagesChecked': data.get('last_page', 70)
    }
    with open(company_path, 'w', encoding='utf-8') as f:
        json.dump(company_data, f, indent=2)
    
    print(f"Saved {len(rows)} jobs to {csv_path}")
    print(f"Saved JSON to {json_path}")
    print(f"Saved company.json to {company_path}")

if __name__ == '__main__':
    main()
