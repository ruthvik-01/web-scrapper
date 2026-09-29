import json

# Read the JSON file
with open('D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json', 'r', encoding='utf-8') as f:
    jobs_data = json.load(f)

print(f"Total jobs: {len(jobs_data)}")

# Check a legitimate job to see why it might be failing
for i, job in enumerate(jobs_data):
    if i < 5:  # Skip search page jobs
        continue

    # Check this specific job
    print(f"\nJob Index {i}:")
    print(f"  jobId: {repr(job.get('jobId'))}")
    print(f"  title: {repr(job.get('title'))}")
    print(f"  description length: {len(str(job.get('description', '')))}")
    print(f"  jobUrl: {repr(job.get('jobUrl'))}")
    print(f"  postedDate: {repr(job.get('postedDate'))}")
    print(f"  company: {repr(job.get('company'))}")

    # Check required fields specifically
    required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
    missing_fields = []
    for field in required_fields:
        value = job.get(field)
        print(f"  {field}: {repr(value)} (type: {type(value)})")
        if value is None or (isinstance(value, str) and not value.strip()):
            missing_fields.append(field)
            print(f"    ^^^ MISSING/EMPTY")

    if missing_fields:
        print(f"  Missing fields: {missing_fields}")
    else:
        print(f"  All required fields present!")

    # Stop after first legitimate job
    if i >= 7:
        break