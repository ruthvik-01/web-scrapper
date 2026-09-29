#!/usr/bin/env python3
"""Combine PRDC and Prince of Wales jobs into one file."""

import json
import csv
from pathlib import Path

def main():
    output_path = Path('output/24-9-26-batch')
    output_path.mkdir(parents=True, exist_ok=True)
    
    columns = ['jobId', 'title', 'location', 'company', 'salary', 'jobType', 
               'description', 'closingDate', 'url', 'industry', 'city', 
               'state', 'country', 'postedDate', 'experienceLevel']
    
    rows = []
    
    # Load PRDC jobs
    prdc_path = Path('output/prdc-dental-24-9-26/prdc-dental-jobs.csv')
    if prdc_path.exists():
        with open(prdc_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
        print(f"Loaded {len(rows)} jobs from PRDC Dental")
    
    # Load Prince of Wales jobs
    pwh_path = Path('output/prince-of-wales-24-9-26/prince-of-wales-jobs.csv')
    if pwh_path.exists():
        pwh_count = 0
        with open(pwh_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
                pwh_count += 1
        print(f"Loaded {pwh_count} jobs from Prince of Wales")
    
    # Write combined CSV
    combined_path = output_path / 'companies.csv'
    with open(combined_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    
    # Write combined JSON
    combined_json = output_path / 'companies.json'
    with open(combined_json, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2)
    
    # Summary
    summary = {
        'totalJobs': len(rows),
        'companies': {
            'PRDC Dental': sum(1 for r in rows if r['company'] == 'PRDC Dental'),
            'Prince of Wales Medical Centre': sum(1 for r in rows if r['company'] == 'Prince of Wales Medical Centre')
        },
        'scrapedAt': '2026-09-24'
    }
    
    summary_path = output_path / 'summary.json'
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nCombined total: {len(rows)} jobs")
    print(f"Saved to {combined_path}")

if __name__ == '__main__':
    main()
