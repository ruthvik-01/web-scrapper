import json

# Read the JSON file
with open('D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json', 'r', encoding='utf-8') as f:
    jobs_data = json.load(f)

print(f"Total jobs: {len(jobs_data)}")

# Examine the structure of the first few jobs
for i, job in enumerate(jobs_data[:5]):
    print(f"\nJob {i+1}:")
    print(f"  jobId: {repr(job.get('jobId', 'MISSING'))}")
    print(f"  title: {repr(job.get('title', 'MISSING'))}")
    print(f"  description length: {len(str(job.get('description', ''))) if job.get('description') else 'EMPTY'}")
    print(f"  jobUrl: {repr(job.get('jobUrl', 'MISSING'))}")
    print(f"  postedDate: {repr(job.get('postedDate', 'MISSING'))}")
    print(f"  company: {repr(job.get('company', 'MISSING'))}")

    # Check for missing required fields
    required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
    missing = [field for field in required_fields if not job.get(field) or not str(job.get(field)).strip()]
    if missing:
        print(f"  MISSING REQUIRED FIELDS: {missing}")