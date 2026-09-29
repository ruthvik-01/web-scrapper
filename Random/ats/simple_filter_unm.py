import json
import re
from datetime import datetime

def simple_filter_jobs(jobs_data):
    """Simple filtering to get the jobs through"""

    filtered_jobs = []
    stats = {
        'original_count': len(jobs_data),
        'removed_search_pages': 0,
        'kept_jobs': 0
    }

    seen_job_ids = set()

    for i, job in enumerate(jobs_data):
        # Skip the first 5 jobs which are search pages
        if i < 5:
            stats['removed_search_pages'] += 1
            continue

        # Basic validation - check if this looks like a real job
        job_id = str(job.get('jobId', ''))
        job_url = str(job.get('jobUrl', ''))

        # Check if it's a real job (numeric jobId and proper URL)
        if (job_id.isdigit() and
            'job-opening.php?req=' in job_url and
            job.get('title') and
            job.get('description') and
            job.get('postedDate') and
            job.get('company')):

            # Create cleaned job
            cleaned_job = {k: v for k, v in job.items()}

            # Normalize ats field
            cleaned_job['ats'] = 'Custom'

            # Fix title (remove trailing site info)
            title = cleaned_job.get('title', '')
            if isinstance(title, str):
                title = re.sub(r',\s*Careers\s*At.*$', '', title, flags=re.IGNORECASE)
                title = re.sub(r'\s+', ' ', title).strip()
                cleaned_job['title'] = title

            # Fix description (basic cleaning)
            desc = cleaned_job.get('description', '')
            if isinstance(desc, str):
                # Remove some obvious boilerplate
                desc = re.sub(r'Careers At UNM Medical Group.*?(?=Department|\Z)', '', desc, flags=re.IGNORECASE)
                desc = re.sub(r'Notice of Equal Opportunity Employment.*$', '', desc, flags=re.IGNORECASE)
                desc = re.sub(r'Applicant Tracking System Powered by.*$', '', desc, flags=re.IGNORECASE)
                desc = re.sub(r'Visit Our Home Page.*$', '', desc, flags=re.IGNORECASE)
                desc = re.sub(r'\d{4} UNM Medical Group.*$', '', desc)
                desc = re.sub(r'\s+', ' ', desc).strip()
                cleaned_job['description'] = desc

            # Fix decimal points in salary range if needed
            salary = cleaned_job.get('salaryRange', '')
            if isinstance(salary, str):
                salary = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', salary)
                cleaned_job['salaryRange'] = salary

            # Validate date
            posted_date = cleaned_job.get('postedDate', '')
            try:
                datetime.strptime(posted_date, '%Y-%m-%d')
            except:
                # Skip if invalid date
                continue

            # Check for duplicates
            if job_id in seen_job_ids:
                continue
            seen_job_ids.add(job_id)

            # Keep the job
            filtered_jobs.append(cleaned_job)
            stats['kept_jobs'] += 1

    return filtered_jobs, stats

def main():
    input_file = 'D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json'
    output_file = 'D:\Internship\\ats\\filtered\\University of New Mexico Health System_jobs_filtered.json'

    try:
        # Read the JSON file
        with open(input_file, 'r', encoding='utf-8') as f:
            jobs_data = json.load(f)

        print(f"Processing {len(jobs_data)} jobs from {input_file}")

        # Filter the jobs
        filtered_jobs, stats = simple_filter_jobs(jobs_data)

        # Save the filtered results
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(filtered_jobs, f, indent=2, ensure_ascii=False)

        # Generate report
        print("\nFILTERING REPORT")
        print("=" * 50)
        print("Company: University of New Mexico Health System")
        print(f"Jobs in original file: {stats['original_count']}")
        print(f"Removed as listing/search-page contamination (Step 0): {stats['removed_search_pages']}")
        print(f"Jobs kept: {stats['kept_jobs']}")
        print("=" * 50)
        print(f"Filtered results saved to: {output_file}")

        # Show sample of kept jobs
        if filtered_jobs:
            print(f"\nSample of kept jobs:")
            for i, job in enumerate(filtered_jobs[:5]):
                print(f"  {i+1}. jobId: {job.get('jobId')}, title: {job.get('title')}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()