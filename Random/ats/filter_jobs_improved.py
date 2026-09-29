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

    # Store original for comparison
    original = title

    # Remove trailing site/location suffixes like ", Careers At Eddy County New Mexico"
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

    # Store original for comparison
    original = desc

    # Remove repeated site headers (only first occurrence)
    desc = re.sub(r'Career Opportunities with Eddy County, New Mexico', '', desc, count=1)
    desc = re.sub(r'Careers At Eddy County, New Mexico', '', desc, count=1)
    desc = re.sub(r'Current job opportunities are posted here as they become available\.', '', desc, count=1)
    desc = re.sub(r'Back To Openings', '', desc, count=1)

    # Remove structural labels
    desc = re.sub(r'START YOUR APPLICATION', '', desc, count=1)
    desc = re.sub(r'BRIEF DESCRIPTION', '', desc, count=1)

    # Remove footer boilerplate
    desc = re.sub(r'Visit Our Home Page.*$', '', desc, flags=re.IGNORECASE, count=1)
    desc = re.sub(r'Applicant Tracking System Powered by.*$', '', desc, flags=re.IGNORECASE, count=1)
    desc = re.sub(r'\d{4} Eddy County, New Mexico.*$', '', desc, count=1)

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
            "Careers At Eddy County New Mexico",
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
        # If the description doesn't contain job-specific keywords, it might be boilerplate
        job_specific_indicators = [
            "brief description", "responsibilities", "requirements", "qualifications",
            "duties", "position", "salary", "pay"
        ]

        # Listing page indicators (common in search results)
        listing_indicators = [
            "filter jobs", "all areas of interest", "all cities", "all states",
            "department position title city state"
        ]

        listing_score = sum(1 for indicator in listing_indicators if indicator in desc_lower)
        job_content_score = sum(1 for indicator in job_specific_indicators if indicator in desc_lower)

        # If it's mostly listing indicators and no job content, it's likely a listing
        if listing_score >= 3 and job_content_score < 2 and len(desc_lower) < 300:
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
        "maintain", "perform", "conduct", "supervise", "manage", "operate"
    ]

    content_count = sum(1 for indicator in content_indicators if indicator in desc_lower)

    # If we have some job-specific content indicators and reasonable length, it's likely real
    return content_count >= 2 or len(desc_lower) > 100

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
        'salary_in_desc_empty_range': 0
    }

    # Step 0: Remove listing/search pages
    filtered_jobs = []
    for job in jobs_data:
        if is_listing_page(job):
            stats['removed_step0'] += 1
            continue
        filtered_jobs.append(job)

    # Clean jobs and track duplicates by jobId
    seen_job_ids = set()
    final_jobs = []

    for job in filtered_jobs:
        # Make a copy to avoid modifying original data during iteration
        job = job.copy()

        # Apply all cleaning steps

        # STEP 1: Clean title and description
        original_title = job.get('title', '')
        original_desc = job.get('description', '')

        job['title'] = clean_title(job.get('title', ''))
        job['description'] = clean_description(job.get('description', ''))

        if job['title'] != original_title:
            stats['cleaned_titles'] += 1

        if job['description'] != original_desc:
            stats['cleaned_descriptions'] += 1

        # STEP 2: Fix extraction artifacts
        original_salary = job.get('salaryRange', '')
        job['salaryRange'] = fix_decimal_points(job.get('salaryRange', ''))
        if job.get('salaryRange') != original_salary:
            stats['fixed_artifacts'] += 1

        # STEP 3: Field-content sanity check
        fields_to_check = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country']
        for field in fields_to_check:
            original_value = job.get(field, '')
            if original_value is None:
                original_value = ''
            sanitized_value = sanitize_field(str(original_value))
            if sanitized_value != str(original_value):
                job[field] = sanitized_value
                stats['nulled_fields'][field] += 1

        # Normalize the ats field to "Custom"
        job['ats'] = "Custom"

        # STEP 4: Final validation checks
        # 1. Required fields are non-empty strings
        required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
        missing_required = any(not job.get(field) or str(job.get(field)).strip() == '' for field in required_fields)

        # 2. ats is exactly "Custom" (already set above)

        # 3. postedDate is a real, valid YYYY-MM-DD date
        posted_date_valid = is_valid_date(job.get('postedDate', ''))

        # 4. jdDeadline, if present, is a real YYYY-MM-DD date or ""/null
        jd_deadline = job.get('jdDeadline', '')
        deadline_valid = (jd_deadline in ['', None]) or is_valid_date(jd_deadline)
        if jd_deadline and not is_valid_date(jd_deadline):
            job['jdDeadline'] = ""

        # 5. After boilerplate stripping, description still contains genuine role-specific content
        has_real_content = job_has_real_content(job.get('description', ''))

        # 6. No duplicate jobId within the same company file
        job_id = str(job.get('jobId', '')).strip()
        is_duplicate = job_id in seen_job_ids
        if not is_duplicate and job_id:
            seen_job_ids.add(job_id)

        # 7. jobUrl is a valid, well-formed URL
        valid_url = validate_job_url(job.get('jobUrl', ''))

        # 8. Check if salary mentioned in description but salaryRange is empty
        desc_lower = job.get('description', '').lower() if job.get('description') else ''
        salary_in_desc = 'salary' in desc_lower or 'starting pay' in desc_lower or 'pay' in desc_lower
        salary_range_empty = not job.get('salaryRange') or str(job.get('salaryRange')).strip() == ''
        if salary_in_desc and salary_range_empty:
            stats['salary_in_desc_empty_range'] += 1

        # Print debugging info for jobs that fail
        if missing_required or not posted_date_valid or not has_real_content or is_duplicate or not valid_url:
            # This job will be removed
            stats['removed_step4'] += 1
        else:
            # This job passes all checks
            # Final format validation - ensure it matches the interface exactly
            interface_fields = [
                'jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline',
                'company', 'salaryRange', 'employmentType', 'worktype', 'location',
                'city', 'state', 'country', 'ats'
            ]

            # Create properly formatted job record
            formatted_job = {}
            for field in interface_fields:
                value = job.get(field, "")
                # Ensure all values are strings
                if value is None:
                    formatted_job[field] = ""
                else:
                    formatted_job[field] = str(value)

            final_jobs.append(formatted_job)
            stats['kept_jobs'] += 1

    return final_jobs, stats

def generate_report(stats, company):
    """Generate the required report"""
    report = f"""Company: {company}
Jobs in original file: {stats['original_count']}
Removed as listing/search-page contamination (Step 0): {stats['removed_step0']}
Jobs with title/description boilerplate stripped (Step 1): {stats['cleaned_titles']} titles, {stats['cleaned_descriptions']} descriptions
Jobs with extraction-artifact fixes applied (Step 2): {stats['fixed_artifacts']}
Fields nulled for content-sanity failure, by field (Step 3): {dict(stats['nulled_fields'])}
Jobs removed at final check (Step 4, by rule violated): {stats['removed_step4']}
Jobs kept: {stats['kept_jobs']}
Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {stats['salary_in_desc_empty_range']}
"""
    return report

# Main execution
if __name__ == "__main__":
    input_file = "D:\\Internship\\ats\\output\\Eddy County_jobs.json"
    output_file = "D:\\Internship\\ats\\filtered\\Eddy County_jobs_filtered.json"

    # Read input file
    with open(input_file, 'r', encoding='utf-8') as f:
        jobs_data = json.load(f)

    # Filter jobs
    filtered_jobs, stats = filter_jobs(jobs_data)

    # Write filtered output
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(filtered_jobs, f, indent=2, ensure_ascii=False)

    # Generate and print report
    report = generate_report(stats, "Eddy County")
    print(report)

    # Also write report to file
    report_file = "D:\\Internship\\ats\\filtered\\Eddy County_filter_report.txt"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)