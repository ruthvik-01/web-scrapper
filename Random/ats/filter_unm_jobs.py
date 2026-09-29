import json
import re
from datetime import datetime
from collections import defaultdict

def is_valid_date(date_str):
    """Check if a string is a valid YYYY-MM-DD date"""
    if not isinstance(date_str, str):
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def fix_decimal_points(text):
    """Fix broken decimal points: digit, period, space, digit -> digit.perioddigit"""
    if not isinstance(text, str):
        return text
    # Pattern: digit, period, space, digit
    pattern = r'(\d)\.\s+(\d)'
    return re.sub(pattern, r'\1.\2', text)

def clean_title(title):
    """Remove site/location suffixes and pay-rate text from title"""
    if not isinstance(title, str):
        return title

    # Remove trailing site/location suffixes like ", Careers At UNM Medical Group Inc"
    title = re.sub(r',\s*Careers\s*At.*$', '', title, flags=re.IGNORECASE)

    # Remove pay rate phrases
    title = re.sub(r'\bSTARTING\s*PAY\b.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bPER\s*HOUR\b.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bDOE\s*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bANNUAL\s*SALARY\b.*$', '', title, flags=re.IGNORECASE)

    # Fix broken decimal points in title
    title = fix_decimal_points(title)

    # Clean up extra whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    return title

def clean_description(desc):
    """Remove boilerplate from description"""
    if not isinstance(desc, str):
        return desc

    # Remove repeated site headers
    desc = re.sub(r'Career Opportunities with.*$', '', desc, count=1)
    desc = re.sub(r'Careers At.*$', '', desc, count=1)
    desc = re.sub(r'Current job opportunities are posted here as they become available\.', '', desc, count=1)
    desc = re.sub(r'Back To Openings', '', desc, count=1)

    # Remove structural labels
    desc = re.sub(r'START YOUR APPLICATION', '', desc, count=1)
    desc = re.sub(r'BRIEF DESCRIPTION', '', desc, count=1)

    # Remove footer boilerplate
    desc = re.sub(r'Visit Our Home Page.*$', '', desc, flags=re.IGNORECASE, count=1)
    desc = re.sub(r'Applicant Tracking System Powered by.*$', '', desc, flags=re.IGNORECASE, count=1)
    desc = re.sub(r'\d{4} UNM Medical Group.*$', '', desc, count=1)

    # Remove "TO VIEW FULL JOB DESCRIPTION" phrases
    desc = re.sub(r'TO VIEW FULL JOB DESCRIPTION,?.*?(?=START YOUR APPLICATION|BRIEF DESCRIPTION|\Z)', '', desc, flags=re.IGNORECASE)

    # Fix broken decimal points in description
    desc = fix_decimal_points(desc)

    # Clean up extra whitespace and newlines
    desc = re.sub(r'\n\s*\n', '\n', desc)
    desc = re.sub(r'\s+', ' ', desc).strip()

    return desc

def is_listing_page(job):
    """Check if job is a listing/search page (Step 0)"""
    # 1. jobId equals jobUrl, or jobId is itself a URL (for search pages)
    if str(job.get('jobId')) == str(job.get('jobUrl')):
        return True
    if isinstance(job.get('jobId'), str) and ('search=true' in job['jobId'] or 'sort=' in job['jobId']):
        return True

    # 2. jobUrl points to a listing/search page
    if isinstance(job.get('jobUrl'), str):
        listing_indicators = ['job-openings.php', '?sort=', '?search=true', 'search-results']
        if any(indicator in job['jobUrl'] for indicator in listing_indicators):
            return True

    # 3. title is a generic site/page title
    if isinstance(job.get('title'), str):
        generic_titles = [
            "Careers At UNM Medical Group Inc",
            "Job Openings",
            "Current Openings"
        ]
        title_clean = job['title'].strip()
        if title_clean in generic_titles:
            return True

    # 4. description is generic site boilerplate only
    if isinstance(job.get('description'), str):
        # Check if description is mostly boilerplate with no job-specific content
        desc_lower = job['description'].lower().strip()

        # Listing page indicators (common in search results)
        listing_indicators = [
            "filter jobs", "all areas of interest", "all cities", "all states",
            "department position title city state"
        ]

        listing_score = sum(1 for indicator in listing_indicators if indicator in desc_lower)

        # If it's mostly listing indicators, it's likely a listing
        if listing_score >= 3 and len(desc_lower) < 300:
            return True

    return False

def sanitize_field(field_value):
    """Check if a field value looks like a valid categorical value"""
    if not isinstance(field_value, str):
        return ""

    # If field looks like a sentence fragment from description, likely corrupted
    # Common corrupted patterns we've seen
    corruption_indicators = [
        "employee will", "position will", "must have", "responsible for",
        "required to", "attend job", "perform all duties", "conducting", "responsible"
    ]

    field_lower = field_value.lower().strip()

    # If field is very long sentence-like content, likely corrupted
    if len(field_lower) > 100 and ('.' in field_lower or any(word in field_lower for word in ['and', 'with', 'the'])):
        return ""

    # If it contains sentence fragments from job descriptions, likely corrupted
    if any(indicator in field_lower for indicator in corruption_indicators):
        return ""

    # Valid field values should be short categories
    valid_values = [
        "Full-Time", "Part-Time", "Temporary", "Seasonal", "Contract",
        "Remote", "Hybrid", "Onsite", "Full Time", "Part Time"
    ]

    if field_lower in [v.lower() for v in valid_values] or field_lower == "":
        return field_value.strip()

    return field_value.strip()

def job_has_real_content(description):
    """Check if job description has real role-specific content"""
    if not isinstance(description, str) or len(description.strip()) == 0:
        return False

    desc_lower = description.lower()

    # Look for indicators of real job content
    content_indicators = [
        "brief description", "responsibilities", "requirements", "qualifications",
        "duties", "position", "will", "must", "responsible", "assist", "coordinate",
        "maintain", "perform", "conduct", "supervise", "manage", "operate",
        "summary", "minimum job requirements", "duties and responsibilities"
    ]

    content_count = sum(1 for indicator in content_indicators if indicator in desc_lower)

    # If we have some job-specific content indicators and reasonable length, it's likely real
    return content_count >= 3 or len(desc_lower) > 200

def validate_job_url(url):
    """Check if job URL is valid"""
    if not isinstance(url, str):
        return False
    return url.startswith(('http://', 'https://')) and ('job-opening.php' in url or 'job-openings.php' in url)

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
        'removed_step4': 0,
        'kept_jobs': 0,
        'salary_flagged': 0
    }

    filtered_jobs = []
    seen_job_ids = set()

    for job in jobs_data:
        # Step 0: Remove listing/search pages mixed in as fake "jobs"
        if is_listing_page(job):
            stats['removed_step0'] += 1
            continue

        # Create a copy for modifications
        cleaned_job = job.copy()

        # Step 1: Strip embedded site boilerplate from title and description
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

        # Step 2: Fix extraction artifacts (formatting only)
        fields_to_fix = ['salaryRange', 'title', 'description']
        for field in fields_to_fix:
            if field in cleaned_job and isinstance(cleaned_job[field], str):
                original_value = cleaned_job[field]
                fixed_value = fix_decimal_points(original_value)
                if fixed_value != original_value:
                    cleaned_job[field] = fixed_value
                    stats['fixed_artifacts'] += 1

        # Step 3: Fix extraction artifacts for URLs and missing punctuation
        # (Already handled in Step 2 for decimals)

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
                          if field not in cleaned_job or not cleaned_job[field] or not str(cleaned_job[field]).strip()]

        if missing_required:
            stats['removed_step4'] += 1
            continue

        # 2. ats must be exactly "Custom"
        cleaned_job['ats'] = 'Custom'

        # 3. postedDate is a real, valid YYYY-MM-DD date
        if not is_valid_date(cleaned_job.get('postedDate', '')):
            stats['removed_step4'] += 1
            continue

        # 4. jdDeadline, if present, is a real YYYY-MM-DD date or ""/null
        if 'jdDeadline' in cleaned_job and cleaned_job['jdDeadline']:
            if not is_valid_date(cleaned_job['jdDeadline']):
                cleaned_job['jdDeadline'] = ''

        # 5. After boilerplate stripping, description still contains genuine role-specific content
        if not job_has_real_content(cleaned_job.get('description', '')):
            stats['removed_step4'] += 1
            continue

        # 6. No duplicate jobId within the same company file
        job_id = str(cleaned_job.get('jobId', ''))
        if job_id in seen_job_ids:
            stats['removed_step4'] += 1
            continue
        seen_job_ids.add(job_id)

        # 7. jobUrl is a valid, well-formed single-job detail URL
        if not validate_job_url(cleaned_job.get('jobUrl', '')):
            stats['removed_step4'] += 1
            continue

        # 8. salaryRange check - flag but don't remove
        salary_range = cleaned_job.get('salaryRange', '')
        desc_content = cleaned_job.get('description', '')
        desc_mentions_salary = ('salary' in desc_content.lower() or
                               'pay' in desc_content.lower() or
                               '$' in desc_content or
                               'Minimum' in desc_content or
                               'Midpoint' in desc_content)

        if desc_mentions_salary and (not salary_range or salary_range.strip() == '' or
                                   'is determined based on years of total relevant experience' in salary_range):
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
        print(f"Jobs removed at final check (Step 4, by rule violated): {stats['removed_step4']}")
        print(f"Jobs kept: {stats['kept_jobs']}")
        print(f"Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {stats['salary_flagged']}")
        print("=" * 50)
        print(f"Filtered results saved to: {output_file}")

    except FileNotFoundError:
        print(f"Error: Could not find input file {input_file}")
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}")
    except Exception as e:
        print(f"Error processing jobs: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()