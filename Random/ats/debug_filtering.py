import json
import re
from datetime import datetime
from collections import defaultdict

def debug_filter_jobs(jobs_data):
    """Debug version to see exactly what's happening"""

    filtered_jobs = []
    stats = {
        'original_count': len(jobs_data),
        'removed_step0': 0,
        'removed_step4': defaultdict(int),
        'kept_jobs': 0
    }

    seen_job_ids = set()

    for i, job in enumerate(jobs_data):
        if i < 5:  # Skip first 5 (search pages)
            stats['removed_step0'] += 1
            continue

        if i > 10:  # Just test first few legit jobs
            break

        print(f"\nDEBUGGING JOB {i}:")
        print(f"  jobId: {repr(job.get('jobId'))}")
        print(f"  title: {repr(job.get('title'))}")

        # Step 4 check - required fields
        required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
        missing_required = []
        for field in required_fields:
            value = job.get(field)
            print(f"    Checking {field}: {repr(value)}")
            if value is None or (isinstance(value, str) and not value.strip()):
                missing_required.append(field)
                print(f"      ^^^ MISSING!")

        if missing_required:
            print(f"  -> REJECTED: Missing required fields: {missing_required}")
            stats['removed_step4']['missing_required_fields'] += 1
            continue
        else:
            print(f"  -> PASSED: All required fields present")

        # Check date
        posted_date = job.get('postedDate', '')
        try:
            datetime.strptime(posted_date, '%Y-%m-%d')
            date_valid = True
            print(f"  -> PASSED: Date valid")
        except:
            date_valid = False
            print(f"  -> REJECTED: Invalid date")
            stats['removed_step4']['invalid_posted_date'] += 1
            continue

        # Check job URL
        job_url = job.get('jobUrl', '')
        url_valid = isinstance(job_url, str) and job_url.startswith('http') and 'job-opening.php' in job_url
        if url_valid:
            print(f"  -> PASSED: URL valid")
        else:
            print(f"  -> REJECTED: Invalid URL")
            stats['removed_step4']['invalid_url'] += 1
            continue

        # Check description content
        desc = job.get('description', '')
        desc_valid = isinstance(desc, str) and len(desc.strip()) > 100
        if desc_valid:
            print(f"  -> PASSED: Description has content ({len(desc)} chars)")
        else:
            print(f"  -> REJECTED: Description insufficient ({len(desc) if isinstance(desc, str) else 0} chars)")
            stats['removed_step4']['insufficient_content'] += 1
            continue

        # Check duplicate
        job_id = str(job.get('jobId', ''))
        if job_id in seen_job_ids:
            print(f"  -> REJECTED: Duplicate jobId")
            stats['removed_step4']['duplicate_job_id'] += 1
            continue
        else:
            print(f"  -> PASSED: Unique jobId")
            seen_job_ids.add(job_id)

        # If we get here, keep the job
        print(f"  -> KEPT: All checks passed!")
        filtered_jobs.append(job)
        stats['kept_jobs'] += 1

    return filtered_jobs, stats

def main():
    input_file = 'D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json'

    # Read the JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        jobs_data = json.load(f)

    print(f"Processing {len(jobs_data)} jobs from {input_file}")

    # Debug filter the jobs
    filtered_jobs, stats = debug_filter_jobs(jobs_data)

    # Generate report
    print("\nDEBUG FILTERING REPORT")
    print("=" * 50)
    print("Company: University of New Mexico Health System")
    print(f"Jobs in original file: {stats['original_count']}")
    print(f"Removed as listing/search-page contamination (Step 0): {stats['removed_step0']}")
    print("Jobs removed at final check (Step 4, by rule violated):")
    for rule, count in stats['removed_step4'].items():
        print(f"  {rule}: {count}")
    print(f"Jobs kept: {stats['kept_jobs']}")
    print("=" * 50)

    print(f"\nSample of kept jobs: {len(filtered_jobs)}")
    for i, job in enumerate(filtered_jobs):
        print(f"  {i+1}. jobId: {job.get('jobId')}, title: {job.get('title')}")

if __name__ == '__main__':
    main()