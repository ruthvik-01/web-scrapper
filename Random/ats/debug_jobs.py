import json

# Read the JSON file
with open('D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json', 'r', encoding='utf-8') as f:
    jobs_data = json.load(f)

print(f"Total jobs: {len(jobs_data)}")

# Examine a few legitimate jobs
legitimate_jobs = []
for i, job in enumerate(jobs_data):
    # Skip the search page jobs (first 5)
    if i < 5:
        continue

    # Check if this looks like a legitimate job
    if (isinstance(job.get('jobId'), str) and
        job['jobId'].isdigit() and
        'job-opening.php?req=' in str(job.get('jobUrl', ''))):
        legitimate_jobs.append((i, job))

# Show first 3 legitimate jobs
for i, (index, job) in enumerate(legitimate_jobs[:3]):
    print(f"\nLegitimate Job {i+1} (Index {index}):")
    print(f"  jobId: {repr(job.get('jobId'))}")
    print(f"  title: {repr(job.get('title'))}")
    print(f"  description length: {len(str(job.get('description', '')))}")
    print(f"  jobUrl: {repr(job.get('jobUrl'))}")
    print(f"  postedDate: {repr(job.get('postedDate'))}")
    print(f"  company: {repr(job.get('company'))}")

    # Check required fields
    required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
    for field in required_fields:
        value = job.get(field, None)
        print(f"  {field}: {repr(value)} ({'OK' if value and str(value).strip() else 'MISSING/EMPTY'})")

    # Check date validity
    from datetime import datetime
    def is_valid_date(date_str):
        if not isinstance(date_str, str):
            return False
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
            return True
        except ValueError:
            return False

    print(f"  postedDate valid: {is_valid_date(job.get('postedDate', ''))}")

    # Check job URL validity
    url = job.get('jobUrl', '')
    url_valid = isinstance(url, str) and url.startswith(('http://', 'https://')) and 'job-opening.php' in url
    print(f"  jobUrl valid: {url_valid}")

    # Check content
    desc = job.get('description', '')
    desc_has_content = isinstance(desc, str) and len(desc.strip()) > 200
    print(f"  description has content: {desc_has_content} (length: {len(desc) if isinstance(desc, str) else 0})")