import json
import re
from datetime import datetime
from collections import defaultdict

def is_valid_date(date_str):
    """Check if a string is a valid YYYY-MM-DD date"""
    if not isinstance(date_str, str) or not date_str.strip():
        return False
    try:
        datetime.strptime(date_str.strip(), '%Y-%m-%d')
        return True
    except ValueError:
        return False

def is_listing_page(job):
    """Check if job is a listing/search page (Step 0)"""
    job_id = str(job.get('jobId', ''))
    job_url = str(job.get('jobUrl', ''))

    # 1. jobId equals jobUrl, or jobId is itself a URL (for search pages)
    if job_id == job_url or ('search=true' in job_id) or ('sort=' in job_id):
        return True

    # 2. jobUrl points to a listing/search page
    listing_indicators = ['job-openings.php', '?sort=', '?search=true', 'search-results']
    if any(indicator in job_url for indicator in listing_indicators):
        return True

    # 3. title is a generic site/page title
    title = str(job.get('title', '')).strip()
    generic_titles = [
        "Careers At UNM Medical Group Inc",
        "Job Openings",
        "Current Openings"
    ]
    if title in generic_titles:
        return True

    return False

def clean_title(title):
    """Remove site/location suffixes and pay-rate text from title"""
    if not isinstance(title, str):
        return title

    # Store original for comparison
    original = title

    # Remove trailing site/location suffixes like ", Careers At ..."
    title = re.sub(r',\s*Careers\s*At.*$', '', title, flags=re.IGNORECASE)

    # Remove pay rate phrases
    title = re.sub(r'\bSTARTING\s*PAY\b.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bPER\s*(HOUR|HR)\b.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bDOE\s*$', '', title, flags=re.IGNORECASE)

    # Fix broken decimal points
    title = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', title)

    # Clean up extra whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    return title

def clean_description(desc):
    """Remove boilerplate from description"""
    if not isinstance(desc, str):
        return desc

    original = desc

    # Remove common boilerplate sections
    boilerplate_patterns = [
        r'Career Opportunities with.*?(?=\n\S|\Z)',
        r'Careers At.*?(?=\n\S|\Z)',
        r'Current job opportunities are posted here as they become available\.',
        r'Back To Openings',
        r'START YOUR APPLICATION',
        r'BRIEF DESCRIPTION',
        r'Notice of Equal Opportunity Employment.*?(?=\n\n|\Z)',
        r'Equal Employment Opportunity Statement.*?(?=\n\n|\Z)',
        r'Legal Documents.*?(?=\n\n|\Z)',
        r'E-Verify Poster.*?(?=\n\n|\Z)',
        r'Visit Our Home Page.*?(?=\n\n|\Z)',
        r'Applicant Tracking System Powered by.*?(?=\n\n|\Z)',
        r'\d{4} UNM Medical Group.*?(?=\n\n|\Z)',
        r'TO VIEW FULL JOB DESCRIPTION.*?CLICK LINK BELOW.*?(?=\n\n|\Z)'
    ]

    for pattern in boilerplate_patterns:
        desc = re.sub(pattern, '', desc, flags=re.IGNORECASE | re.DOTALL)

    # Fix broken decimal points
    desc = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', desc)

    # Clean up extra whitespace
    desc = re.sub(r'\n\s*\n', '\n\n', desc)
    desc = re.sub(r'\s+', ' ', desc).strip()

    return desc

def sanitize_field(field_value):
    """Sanitize corrupted fields"""
    if not isinstance(field_value, str):
        return ""

    # Check for corruption indicators (sentence fragments from descriptions)
    corruption_indicators = [
        "employee will", "position will", "must have", "responsible for",
        "required to", "attend job", "perform all duties", "conducting"
    ]

    field_lower = field_value.lower().strip()

    # If very long and sentence-like, likely corrupted
    if len(field_lower) > 50 and ('.' in field_lower or ' and ' in field_lower):
        return ""

    # If contains description fragments, likely corrupted
    if any(indicator in field_lower for indicator in corruption_indicators):
        return ""

    return field_value.strip()

def filter_jobs(jobs_data):
    """Filter jobs according to all steps in the prompt"""

    # Report counters
    stats = {
        'original_count': len(jobs_data),
        'removed_step0': 0,
        'cleaned_titles': 0,
        'cleaned_descriptions': 0,
        'fixed_artifacts': 0,
        'nulled_fields': defaultdict(int),
        'removed_step4': defaultdict(int),
        'kept_jobs': 0,
        'salary_flagged': 0
    }

    filtered_jobs = []
    seen_job_ids = set()

    for job in jobs_data:
        # Step 0: Remove listing/search pages
        if is_listing_page(job):
            stats['removed_step0'] += 1
            continue

        # Create a copy for modifications
        cleaned_job = {k: v for k, v in job.items()}

        # Step 1: Strip embedded site boilerplate
        original_title = cleaned_job.get('title', '')
        cleaned_title = clean_title(original_title)
        if cleaned_title != original_title:
            cleaned_job['title'] = cleaned_title
            stats['cleaned_titles'] += 1

        original_desc = cleaned_job.get('description', '')
        cleaned_desc = clean_description(original_desc)
        if cleaned_desc != original_desc:
            cleaned_job['description'] = cleaned_desc
            stats['cleaned_descriptions'] += 1

        # Step 2: Fix extraction artifacts
        # Fix decimal points
        for field in ['salaryRange', 'title', 'description']:
            if field in cleaned_job and isinstance(cleaned_job[field], str):
                original = cleaned_job[field]
                fixed = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', original)
                if fixed != original:
                    cleaned_job[field] = fixed
                    stats['fixed_artifacts'] += 1

        # Step 3: Field-content sanity check
        fields_to_check = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country']
        for field in fields_to_check:
            if field in cleaned_job:
                original_value = cleaned_job[field]
                sanitized_value = sanitize_field(original_value)
                if sanitized_value != original_value:
                    cleaned_job[field] = sanitized_value
                    stats['nulled_fields'][field] += 1

        # Step 4: Final validation
        # 1. Required fields are non-empty strings
        required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
        missing_required = [field for field in required_fields
                          if field not in cleaned_job or
                             not cleaned_job[field] or
                             not str(cleaned_job[field]).strip()]

        if missing_required:
            stats['removed_step4']['missing_required_fields'] += 1
            continue

        # 2. ats normalization
        cleaned_job['ats'] = 'Custom'

        # 3. postedDate validation
        if not is_valid_date(cleaned_job.get('postedDate', '')):
            stats['removed_step4']['invalid_posted_date'] += 1
            continue

        # 4. jdDeadline validation
        if 'jdDeadline' in cleaned_job and cleaned_job['jdDeadline']:
            if not is_valid_date(cleaned_job['jdDeadline']):
                cleaned_job['jdDeadline'] = ''

        # 5. Description content check
        desc_content = cleaned_job.get('description', '')
        if not isinstance(desc_content, str) or len(desc_content.strip()) < 100:
            stats['removed_step4']['insufficient_content'] += 1
            continue

        # 6. Duplicate jobId check
        job_id = str(cleaned_job.get('jobId', ''))
        if job_id in seen_job_ids:
            stats['removed_step4']['duplicate_job_id'] += 1
            continue
        seen_job_ids.add(job_id)

        # 7. jobUrl validation
        job_url = cleaned_job.get('jobUrl', '')
        if not isinstance(job_url, str) or not job_url.strip():
            stats['removed_step4']['invalid_url'] += 1
            continue

        # 8. Salary range flag check
        salary_range = cleaned_job.get('salaryRange', '')
        desc_content = cleaned_job.get('description', '')
        desc_mentions_salary = ('salary' in desc_content.lower() or
                               'pay' in desc_content.lower() or
                               '$' in desc_content or
                               'Minimum' in desc_content or
                               'Midpoint' in desc_content)

        if desc_mentions_salary and (not salary_range or not salary_range.strip()):
            stats['salary_flagged'] += 1

        # If we passed all checks, keep the job
        filtered_jobs.append(cleaned_job)
        stats['kept_jobs'] += 1

    return filtered_jobs, stats

def main():
    input_file = 'D:\\Internship\\ats\\output\\University of New Mexico Health System_jobs.json'
    output_file = 'D:\\Internship\\ats\\filtered\\University of New Mexico Health System_jobs_filtered.json'

    try:
        # Read the JSON file
        with open(input_file, 'r', encoding='utf-8') as f:
            jobs_data = json.load(f)

        print(f"Processing {len(jobs_data)} jobs from {input_file}")

        # Filter the jobs
        filtered_jobs, stats = filter_jobs(jobs_data)

        # Save the filtered results
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(filtered_jobs, f, indent=2, ensure_ascii=False)

        # Generate report
        print("\nFILTERING REPORT")
        print("=" * 50)
        print("Company: University of New Mexico Health System")
        print(f"Jobs in original file: {stats['original_count']}")
        print(f"Removed as listing/search-page contamination (Step 0): {stats['removed_step0']}")
        print(f"Jobs with title/description boilerplate stripped (Step 1): {stats['cleaned_titles'] + stats['cleaned_descriptions']}")
        print(f"Jobs with extraction-artifact fixes applied (Step 2): {stats['fixed_artifacts']}")
        print("Fields nulled for content-sanity failure, by field (Step 3):")
        for field, count in stats['nulled_fields'].items():
            print(f"  {field}: {count}")
        print("Jobs removed at final check (Step 4, by rule violated):")
        for rule, count in stats['removed_step4'].items():
            print(f"  {rule}: {count}")
        print(f"Jobs kept: {stats['kept_jobs']}")
        print(f"Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {stats['salary_flagged']}")
        print("=" * 50)
        print(f"Filtered results saved to: {output_file}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()