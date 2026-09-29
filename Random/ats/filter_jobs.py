import json
import re
from datetime import datetime
from collections import defaultdict

def load_jobs(file_path):
    """Load jobs from JSON file"""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def is_valid_date(date_str):
    """Check if string is a valid YYYY-MM-DD date"""
    if not date_str or not isinstance(date_str, str):
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def remove_listing_pages(jobs):
    """STEP 0: Remove listing/search pages"""
    valid_jobs = []
    removed_count = 0

    for job in jobs:
        # Check removal conditions
        remove = False

        # 1. jobId equals jobUrl, or jobId is itself a URL (but not a valid job URL)
        if str(job.get('jobId')) == str(job.get('jobUrl')):
            remove = True
        elif isinstance(job.get('jobId'), str) and job.get('jobId').startswith(('http://', 'https://')) and 'job-opening.php?req=' not in job.get('jobId', ''):
            remove = True

        # 2. jobUrl points to listing/search page
        elif isinstance(job.get('jobUrl'), str) and ('job-openings.php' in job['jobUrl'] and 'search=true' in job['jobUrl']):
            remove = True

        # 3. title is generic
        elif isinstance(job.get('title'), str) and job['title'].strip().lower() in ['careers at now optics', 'job openings', 'current openings']:
            remove = True

        # 4. description is generic boilerplate (very short)
        elif isinstance(job.get('description'), str) and len(job['description'].strip()) < 50:
            remove = True

        if remove:
            removed_count += 1
        else:
            valid_jobs.append(job)

    return valid_jobs, removed_count

def clean_title(title):
    """STEP 1: Strip embedded site boilerplate from title"""
    if not isinstance(title, str):
        return title

    # Remove trailing site/location suffix
    title = re.sub(r',\s*Careers\s+At.*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r',\s*Careers.*$', '', title, flags=re.IGNORECASE)

    # Remove pay-rate text
    title = re.sub(r'\bSTARTING\s+PAY\b.*?(?=,|$)', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\bPER\s+[A-Z]+\s+DOE\b.*?(?=,|$)', '', title, flags=re.IGNORECASE)

    # Clean up extra commas
    title = re.sub(r',\s*$', '', title)
    title = title.strip()

    return title

def clean_description(desc):
    """STEP 1: Strip embedded site boilerplate from description"""
    if not isinstance(desc, str):
        return desc

    # The description is mostly one line with sentences concatenated
    # Look for boilerplate phrases to remove
    boilerplate_phrases = [
        r'Career Opportunities with Now Optics.*?available\.',
        r'Back To Openings',
        r'START YOUR APPLICATION',
        r'BRIEF DESCRIPTION',
        r'Visit Our Home Page',
        r'\d{4} Now Optics',
        r'Applicant Tracking System Powered by.*$',
        r'TO VIEW FULL JOB DESCRIPTION.*CLICK LINK BELOW',
    ]

    cleaned_desc = desc

    # Remove boilerplate phrases
    for pattern in boilerplate_phrases:
        cleaned_desc = re.sub(pattern, '', cleaned_desc, flags=re.IGNORECASE)

    # Remove lone field labels that don't contribute meaning
    field_labels = [
        r'\bDepartment\b\s*[A-Za-z\s,]+',
        r'\bLocation\b\s*[A-Za-z\s,]+',
        r'\bReports to\b[^.]*\.',
    ]

    for pattern in field_labels:
        cleaned_desc = re.sub(pattern, '', cleaned_desc, flags=re.IGNORECASE)

    # Clean up extra spaces and periods
    cleaned_desc = re.sub(r'\s+', ' ', cleaned_desc)  # Multiple spaces to single space
    cleaned_desc = re.sub(r'\.{2,}', '.', cleaned_desc)  # Multiple periods to single period
    cleaned_desc = re.sub(r'\s*\.\s*', '. ', cleaned_desc)  # Cleanup spacing around periods
    cleaned_desc = re.sub(r'\s*,\s*', ', ', cleaned_desc)  # Cleanup spacing around commas
    cleaned_desc = cleaned_desc.strip()

    # Remove leading/trailing junk
    cleaned_desc = re.sub(r'^[\.\s]*', '', cleaned_desc)
    cleaned_desc = re.sub(r'[\.\s]*$', '', cleaned_desc)

    return cleaned_desc

def fix_extraction_artifacts(jobs):
    """STEP 2: Fix extraction artifacts"""
    fixed_count = 0

    for job in jobs:
        job_changed = False

        # Fix broken decimal points
        for field in ['salaryRange', 'title', 'description']:
            if isinstance(job.get(field), str):
                original = job[field]
                # Fix digit.period.space.digit pattern
                job[field] = re.sub(r'(\d)\.\s+(\d)', r'\1.\2', job[field])
                if job[field] != original:
                    job_changed = True

        if job_changed:
            fixed_count += 1

    return jobs, fixed_count

def sanitize_fields(jobs):
    """STEP 3: Field-content sanity check"""
    sanitized_stats = defaultdict(int)

    for job in jobs:
        # Check employmentType and worktype
        for field in ['employmentType', 'worktype']:
            if isinstance(job.get(field), str) and len(job[field]) > 50:
                # Check if it looks like a sentence fragment (has many words)
                if len(job[field].split()) > 10:
                    job[field] = ""
                    sanitized_stats[field] += 1

        # Check other fields
        for field in ['salaryRange', 'location', 'city', 'state', 'country']:
            if isinstance(job.get(field), str) and len(job[field]) > 100:
                # Likely a paragraph fragment
                if len(job[field].split()) > 15:
                    job[field] = ""
                    sanitized_stats[field] += 1

    return jobs, dict(sanitized_stats)

def validate_and_clean_jobs(jobs):
    """STEP 4: Final validation and cleanup"""
    valid_jobs = []
    removed_reasons = defaultdict(int)
    salary_flags = 0

    job_ids_seen = set()

    for job in jobs:
        # Set ats to "Custom" as required
        job['ats'] = "Custom"

        # Check required fields
        required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company', 'ats']
        missing_or_empty = [field for field in required_fields if not job.get(field) or (isinstance(job.get(field), str) and not job.get(field).strip())]

        if missing_or_empty:
            removed_reasons[f'Missing required fields: {", ".join(missing_or_empty)}'] += 1
            continue

        # Check postedDate is valid
        if not is_valid_date(job['postedDate']):
            removed_reasons['Invalid postedDate'] += 1
            continue

        # Check jdDeadline if present
        if job.get('jdDeadline') and not is_valid_date(job['jdDeadline']) and job['jdDeadline'] not in ['', None]:
            job['jdDeadline'] = ''

        # Check jobUrl is valid (should be a single job page, not listing)
        if not isinstance(job.get('jobUrl'), str) or not job['jobUrl'].startswith(('http://', 'https://')) or 'job-opening.php?req=' not in job['jobUrl']:
            removed_reasons['Invalid jobUrl'] += 1
            continue

        # Check for duplicate jobId
        if job['jobId'] in job_ids_seen:
            removed_reasons['Duplicate jobId'] += 1
            continue

        # Check if description has real content after cleaning
        if len(job['description'].strip()) < 100:  # Increased threshold since real content should be substantial
            removed_reasons['Description too short after cleaning'] += 1
            continue

        # Check for salary mentioned in description but salaryRange empty
        if not job.get('salaryRange') and re.search(r'\$(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?', job.get('description', ''), re.IGNORECASE):
            salary_flags += 1

        job_ids_seen.add(job['jobId'])
        valid_jobs.append(job)

    return valid_jobs, dict(removed_reasons), salary_flags

def debug_cleaning():
    """Debug the cleaning process"""
    # Load a sample job
    input_file = 'D:/Internship/ats/output/Now Optics_jobs.json'
    jobs = load_jobs(input_file)

    # Find a real job entry
    for job in jobs:
        if isinstance(job.get('jobId'), str) and not job['jobId'].startswith('http') and '3723300' in job['jobId']:
            print("=== BEFORE CLEANING ===")
            print(f"JobId: {job.get('jobId')}")
            print(f"Title: {job.get('title')}")
            print(f"Description length: {len(job.get('description', ''))}")
            print("First 300 chars of description:")
            print(job.get('description', '')[:300])

            # Apply cleaning
            cleaned_title = clean_title(job.get('title', ''))
            cleaned_desc = clean_description(job.get('description', ''))

            print("\n=== AFTER CLEANING ===")
            print(f"Cleaned title: '{cleaned_title}'")
            print(f"Cleaned description length: {len(cleaned_desc)}")
            print("First 300 chars of cleaned description:")
            print(cleaned_desc[:300] if cleaned_desc else "EMPTY")
            print(f"Description empty: {not cleaned_desc}")
            break

def main():
    # Uncomment the next line to debug the cleaning process
    # debug_cleaning()

    input_file = 'D:/Internship/ats/output/Now Optics_jobs.json'
    output_file = 'D:/Internship/ats/filtered/Now Optics_jobs_filtered.json'
    report_file = 'D:/Internship/ats/filter_report.txt'

    # Load jobs
    jobs = load_jobs(input_file)
    original_count = len(jobs)

    print(f"Processing {original_count} jobs...")

    # STEP 0: Remove listing/search pages
    jobs_after_step0, removed_step0 = remove_listing_pages(jobs)
    print(f"After Step 0: {len(jobs_after_step0)} jobs remain")

    # Apply cleaning to remaining jobs
    jobs_cleaned = []
    titles_stripped = 0
    descriptions_cleaned = 0

    for i, job in enumerate(jobs_after_step0):
        # STEP 1: Strip boilerplate
        original_title = job.get('title', '')
        original_desc = job.get('description', '')

        job['title'] = clean_title(job.get('title', ''))
        job['description'] = clean_description(job.get('description', ''))

        if job['title'] != original_title:
            titles_stripped += 1
        if job['description'] != original_desc:
            descriptions_cleaned += 1

        jobs_cleaned.append(job)

    # STEP 2: Fix extraction artifacts
    jobs_after_step2, fixed_step2 = fix_extraction_artifacts(jobs_cleaned)

    # STEP 3: Field-content sanity check
    jobs_after_step3, sanitized_fields = sanitize_fields(jobs_after_step2)

    # STEP 4: Final validation
    final_jobs, removed_reasons, salary_flags = validate_and_clean_jobs(jobs_after_step3)

    print(f"Final count: {len(final_jobs)} jobs kept")

    # Save filtered jobs
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_jobs, f, indent=2, ensure_ascii=False)

    # Create report
    report = f"""Company: Now Optics
Jobs in original file: {original_count}
Removed as listing/search-page contamination (Step 0): {removed_step0}
Jobs with title/description boilerplate stripped (Step 1): Titles - {titles_stripped}, Descriptions - {descriptions_cleaned}
Jobs with extraction-artifact fixes applied (Step 2): {fixed_step2}
Fields nulled for content-sanity failure, by field (Step 3): {dict(sanitized_fields)}
Jobs removed at final check (Step 4, by rule violated): {dict(removed_reasons)}
Jobs kept: {len(final_jobs)}
Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {salary_flags}
"""

    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)

    print("Filtering complete!")
    print(report)

    return report

if __name__ == "__main__":
    main()