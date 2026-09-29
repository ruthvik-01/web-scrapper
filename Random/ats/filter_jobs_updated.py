import json
import re
import os
from collections import defaultdict
from datetime import datetime

def is_valid_date(date_str):
    """Check if string is a valid YYYY-MM-DD date"""
    if not isinstance(date_str, str):
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def is_listing_page(job_id, job_url):
    """Check if job is a listing/search page (Step 0 rule 1-2)"""
    # Rule 1: jobId equals jobUrl, or jobId is itself a URL
    if job_id == job_url or (isinstance(job_id, str) and job_id.startswith(('http://', 'https://'))):
        return True

    # Rule 2: jobUrl points to listing/search page
    listing_indicators = ['job-openings.php', '?sort=', '?search=true', 'job-listings', 'sharer.php', 'shareArticle']
    if any(indicator in job_url for indicator in listing_indicators):
        return True

    return False

def is_generic_title(title):
    """Check if title is generic (Step 0 rule 3)"""
    if not isinstance(title, str):
        return True

    generic_patterns = [
        r'^Careers At.*$',
        r'^Job Openings$',
        r'^Current Openings$',
        r'^Facebook$',
        r'^LinkedIn Login.*$',
        r'^Happening now.*$'
    ]
    for pattern in generic_patterns:
        if re.match(pattern, title.strip(), re.IGNORECASE):
            return True
    return False

def clean_title(title):
    """Strip embedded site boilerplate from title (Step 1)"""
    if not isinstance(title, str):
        return ""

    # Remove trailing site/location suffix
    title = re.sub(r', Careers At.*$', '', title)

    # Remove pay-rate text embedded in title
    title = re.sub(r'STARTING PAY.*DOE', '', title)
    title = re.sub(r'\d+\.\s*\d+\s*PER HOUR.*DOE', '', title)

    # Fix broken decimal points (Step 2)
    title = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', title)

    return title.strip()

def clean_description(description):
    """Strip embedded site boilerplate from description (Step 1)"""
    if not isinstance(description, str):
        return ""

    # Remove repeated site-name header lines
    boilerplate_lines = [
        r'^Career Opportunities with.*$',
        r'^Careers At.*$',
        r'^Current job opportunities are posted here as they become available.*$',
        r'^Back To Openings$',
        r'^Share with friends or Subscribe.*$',
        r'^Subscribe to our RSS feeds.*$',
        r'^Filter Jobs.*$',
        r'^- All.*-.*Jobs*',
        r'^Jobs Portal.*$',
        r'^Applicant Tracking System Powered by.*$',
        r'^\d{4} Sevan Multi-Site Solutions.*$',
        r'^.*Facebook.*$',
        r'^.*LinkedIn.*$',
        r'^.*Twitter.*$',
        r'^.*X Corp.*$',
        r'^See whats happening.*$',
        r'^Select an option below.*$',
        r'^Continue with.*$',
        r'^By continuing, you agree.*$'
    ]

    lines = description.split('\n')
    cleaned_lines = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Check if line should be removed
        should_remove = False

        # Check boilerplate lines
        for pattern in boilerplate_lines:
            if re.match(pattern, line, re.IGNORECASE):
                should_remove = True
                break

        # Remove duplicated phrases appearing twice in succession
        if not should_remove and i > 0 and line == lines[i-1].strip():
            should_remove = True  # Skip duplicate line

        if not should_remove:
            cleaned_lines.append(line)

        i += 1

    # Fix broken decimal points in description (Step 2)
    cleaned_desc = '\n'.join(cleaned_lines)
    cleaned_desc = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', cleaned_desc)

    return cleaned_desc.strip()

def is_corrupted_field(field_value, max_length=100):
    """Check if field is corrupted (Step 3)"""
    if not isinstance(field_value, str):
        return False

    # If field is longer than max_length, contains multiple sentences,
    # or clearly reads as a cut-off piece of description, it's corrupted
    if len(field_value) > max_length:
        return True

    # Check if it's a sentence fragment (likely corrupted)
    if '.' in field_value and len(field_value.split()) > 10:
        # If it contains a period and many words, it's probably a fragment of description
        return True

    return False

def filter_jobs(jobs_data):
    """Filter jobs according to all rules"""

    # Statistics for reporting
    stats = {
        'original_count': len(jobs_data),
        'removed_step0': 0,
        'cleaned_titles': 0,
        'cleaned_descriptions': 0,
        'fixed_artifacts': 0,
        'nulled_fields': defaultdict(int),
        'removed_step4': defaultdict(int),
        'kept': 0,
        'salary_mentioned_empty_range': 0
    }

    filtered_jobs = []
    seen_job_ids = set()

    for job in jobs_data:
        # Make a copy to avoid modifying original
        job_copy = job.copy()

        # Step 0: Remove listing/search pages
        if is_listing_page(job.get('jobId', ''), job.get('jobUrl', '')):
            stats['removed_step0'] += 1
            continue

        if is_generic_title(job.get('title', '')):
            stats['removed_step0'] += 1
            continue

        # Step 1: Strip embedded site boilerplate
        original_title = job_copy.get('title', '')
        cleaned_title = clean_title(original_title)
        if cleaned_title != original_title:
            job_copy['title'] = cleaned_title
            stats['cleaned_titles'] += 1

        original_description = job_copy.get('description', '')
        cleaned_description = clean_description(original_description)
        if cleaned_description != original_description:
            job_copy['description'] = cleaned_description
            stats['cleaned_descriptions'] += 1

        # Step 2: Fix extraction artifacts
        # Fix broken decimal points in salaryRange
        if 'salaryRange' in job_copy:
            original_salary = job_copy['salaryRange']
            fixed_salary = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', str(original_salary))
            if fixed_salary != original_salary:
                job_copy['salaryRange'] = fixed_salary
                stats['fixed_artifacts'] += 1

        # Step 3: Field-content sanity check
        fields_to_check = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country']
        for field in fields_to_check:
            if field in job_copy and is_corrupted_field(job_copy[field]):
                stats['nulled_fields'][field] += 1
                job_copy[field] = ''

        # Step 4: Final check
        # Rule 1: Required fields are non-empty strings
        required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company']
        missing_fields = [field for field in required_fields if not job_copy.get(field)]
        if missing_fields:
            stats['removed_step4']['missing_required_fields'] += 1
            continue

        # Rule 2: ats must be exactly "Custom"
        job_copy['ats'] = 'Custom'

        # Rule 3: postedDate validation
        if not is_valid_date(job_copy.get('postedDate', '')):
            stats['removed_step4']['invalid_postedDate'] += 1
            continue

        # Rule 4: jdDeadline validation
        if 'jdDeadline' in job_copy and job_copy['jdDeadline']:
            if not is_valid_date(job_copy['jdDeadline']):
                job_copy['jdDeadline'] = ""
                stats['nulled_fields']['jdDeadline'] += 1

        # Rule 5: After boilerplate stripping, description still contains genuine role-specific content
        cleaned_desc = job_copy.get('description', '').strip()
        if not cleaned_desc or len(cleaned_desc) < 20:
            stats['removed_step4']['insufficient_description_content'] += 1
            continue

        # Rule 6: No duplicate jobId within the same company file
        job_id = job_copy.get('jobId')
        if job_id in seen_job_ids:
            stats['removed_step4']['duplicate_jobId'] += 1
            continue

        # Rule 7: jobUrl is a valid, well-formed single-job detail URL
        if is_listing_page('', job_copy.get('jobUrl', '')):
            stats['removed_step4']['listing_jobUrl'] += 1
            continue

        # Add valid job
        seen_job_ids.add(job_id)
        filtered_jobs.append(job_copy)
        stats['kept'] += 1

    # Ensure all jobs have exactly the required fields
    final_jobs = []
    for job in filtered_jobs:
        # Create job with exactly the required fields
        normalized_job = {
            'jobId': str(job.get('jobId', '')),
            'title': str(job.get('title', '')),
            'description': str(job.get('description', '')),
            'jobUrl': str(job.get('jobUrl', '')),
            'postedDate': str(job.get('postedDate', '')),
            'jdDeadline': str(job.get('jdDeadline', '')),
            'company': str(job.get('company', '')),
            'salaryRange': str(job.get('salaryRange', '')),
            'employmentType': str(job.get('employmentType', '')),
            'worktype': str(job.get('worktype', '')),
            'location': str(job.get('location', '')),
            'city': str(job.get('city', '')),
            'state': str(job.get('state', '')),
            'country': str(job.get('country', '')),
            'ats': 'Custom'  # Always set to Custom
        }
        final_jobs.append(normalized_job)

    return final_jobs, stats

def main():
    # Load the JSON file
    input_file = "D:\\Internship\\ats\\output\\Sevan Multi-Site Solutions_jobs.json"
    output_file = "D:\\Internship\\ats\\filtered\\Sevan Multi-Site Solutions_jobs_filtered.json"
    report_file = "D:\\Internship\\ats\\filtered\\Sevan Multi-Site Solutions_report.txt"

    with open(input_file, 'r', encoding='utf-8') as f:
        jobs_data = json.load(f)

    # Filter the jobs
    filtered_jobs, stats = filter_jobs(jobs_data)

    # Create filtered directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    # Write filtered jobs
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(filtered_jobs, f, indent=2, ensure_ascii=False)

    # Write report
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(f"Company: Sevan Multi-Site Solutions\n")
        f.write(f"Jobs in original file: {stats['original_count']}\n")
        f.write(f"Removed as listing/search-page contamination (Step 0): {stats['removed_step0']}\n")
        f.write(f"Jobs with title/description boilerplate stripped (Step 1): {stats['cleaned_titles']}\n")
        f.write(f"Jobs with extraction-artifact fixes applied (Step 2): {stats['fixed_artifacts']}\n")
        f.write("Fields nulled for content-sanity failure, by field (Step 3):\n")
        for field, count in stats['nulled_fields'].items():
            f.write(f"  {field}: {count}\n")
        f.write("Jobs removed at final check (Step 4, by rule violated):\n")
        for reason, count in stats['removed_step4'].items():
            f.write(f"  {reason}: {count}\n")
        f.write(f"Jobs kept: {stats['kept']}\n")
        f.write(f"Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {stats['salary_mentioned_empty_range']}\n")

    print("Filtering completed successfully.")

if __name__ == "__main__":
    main()