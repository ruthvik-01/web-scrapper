import json
import re
from datetime import datetime
from collections import defaultdict

def is_valid_date(date_str):
    """Check if date string is in valid YYYY-MM-DD format"""
    if not date_str:
        return False
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False

def is_listing_page(job):
    """Check if job is a listing/search page (STEP 0 filters)"""
    # Rule 1: jobId equals jobUrl or jobId is itself a full URL
    if job.get('jobId') == job.get('jobUrl') or (job.get('jobId') and job.get('jobId').startswith(('http://', 'https://'))):
        return True

    # Rule 2: jobUrl points to listing/search page
    job_url = job.get('jobUrl', '')
    listing_indicators = ['job-openings.php', '?sort=', '?search=true', 'search=', 'filter=', 'listing']
    if any(indicator in job_url for indicator in listing_indicators):
        return True

    # Rule 3: title is generic
    title = job.get('title', '').lower()
    generic_titles = ['careers at', 'job openings', 'current openings', 'employment opportunities']
    if any(generic in title for generic in generic_titles) and 'careers at eddy county' in title:
        return True

    # Rule 4: description is generic boilerplate
    desc = job.get('description', '').lower()
    if 'current job opportunities are posted here' in desc and 'career opportunities with eddy county' in desc:
        # Check if it's a listing page description (lots of job titles listed)
        if desc.count('job') > 10:  # Heuristic: lots of "job" mentions suggests listing page
            return True

    return False

def clean_description(desc):
    """Clean job description according to Step 1, rule 5"""
    if not desc:
        return desc

    # Remove repeated phrases - basic approach
    lines = desc.split('. ')
    unique_lines = []
    seen = set()

    for line in lines:
        line_clean = line.strip()
        if line_clean and line_clean not in seen:
            unique_lines.append(line_clean)
            seen.add(line_clean)

    cleaned_desc = '. '.join(unique_lines)
    if cleaned_desc and not cleaned_desc.endswith('.'):
        cleaned_desc += '.'

    # Remove pure navigation/apply boilerplate
    boilerplate_phrases = [
        'to view full job description, please click link below',
        'start your application',
        'visit our home page',
        'applicant tracking system powered by',
        'back to openings'
    ]

    for phrase in boilerplate_phrases:
        cleaned_desc = cleaned_desc.replace(phrase, '')

    # Clean up extra whitespace
    cleaned_desc = re.sub(r'\s+', ' ', cleaned_desc).strip()

    return cleaned_desc

def is_valid_job(job):
    """Check if job meets all STEP 1 criteria"""
    # Rule 1: Required fields are non-empty strings
    required_fields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company', 'ats']
    for field in required_fields:
        if not job.get(field) or not isinstance(job.get(field), str) or not job.get(field).strip():
            return False, f"Missing or empty required field: {field}"

    # Rule 2: ats is exactly "Custom" (we'll normalize this)
    # Rule 3: postedDate is valid YYYY-MM-DD format
    if not is_valid_date(job.get('postedDate')):
        return False, f"Invalid postedDate: {job.get('postedDate')}"

    # Rule 4: jdDeadline, if present, is either valid date or empty
    jd_deadline = job.get('jdDeadline')
    if jd_deadline and jd_deadline.strip() and not is_valid_date(jd_deadline):
        # Set to empty string as per specification
        job['jdDeadline'] = ""

    # Rule 5: description contains real job content (cleaned of noise)
    cleaned_desc = clean_description(job.get('description', ''))
    if not cleaned_desc or len(cleaned_desc.strip()) < 50:  # Arbitrary minimum length
        return False, "Description is too short or empty after cleaning"
    job['description'] = cleaned_desc

    # Rule 6: No duplicate jobId within company (handled externally)

    # Rule 7: jobUrl is valid URL
    job_url = job.get('jobUrl', '')
    if not job_url.startswith(('http://', 'https://')):
        return False, f"Invalid jobUrl: {job_url}"

    # Rule 8: salaryRange is explicit or empty (we don't remove jobs for this)

    return True, "Valid job"

def filter_jobs(input_file, output_file, report_file):
    """Main filtering function"""
    # Read input file
    with open(input_file, 'r', encoding='utf-8') as f:
        jobs = json.load(f)

    company = "Eddy County"
    original_count = len(jobs)

    print(f"Processing {original_count} jobs for {company}")

    # STEP 0: Remove listing/search pages
    valid_jobs_step0 = []
    removed_step0_count = 0

    for job in jobs:
        if is_listing_page(job):
            removed_step0_count += 1
        else:
            valid_jobs_step0.append(job)

    jobs_after_step0 = len(valid_jobs_step0)
    print(f"After STEP 0 - Removed {removed_step0_count} listing/search page entries")

    # STEP 1: Apply all filtering rules
    valid_jobs_final = []
    removed_reasons = defaultdict(int)

    # Track jobIds to detect duplicates (Rule 6)
    seen_jobids = set()

    for job in valid_jobs_step0:
        # Normalize ats field
        job['ats'] = "Custom"

        # Check for duplicate jobId
        job_id = job.get('jobId', '')
        if job_id in seen_jobids:
            removed_reasons['Duplicate jobId within company'] += 1
            continue
        seen_jobids.add(job_id)

        # Validate job
        is_valid, reason = is_valid_job(job)
        if is_valid:
            valid_jobs_final.append(job)
        else:
            removed_reasons[reason] += 1

    final_count = len(valid_jobs_final)

    # Generate report
    report_content = f"""Company: {company}
Jobs in original file: {original_count}
Removed as listing/search-page contamination (Step 0): {removed_step0_count}
Jobs evaluated as real postings: {jobs_after_step0}
Jobs kept: {final_count}
Jobs removed (Step 1, by rule violated):
"""

    for reason, count in removed_reasons.items():
        report_content += f"  {reason}: {count}\n"

    # Write filtered jobs to output file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(valid_jobs_final, f, indent=2, ensure_ascii=False)

    # Write report
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report_content)

    print(f"Filtering complete. Kept {final_count} valid jobs.")
    print(f"Filtered jobs written to: {output_file}")
    print(f"Report written to: {report_file}")

    return valid_jobs_final, report_content

if __name__ == "__main__":
    input_file = "d:\\Internship\\ats\\output\\Eddy County_jobs.json"
    output_file = "d:\\Internship\\ats\\output\\Eddy County_jobs_filtered.json"
    report_file = "d:\\Internship\\ats\\output\\Eddy County_filtering_report.txt"

    try:
        filtered_jobs, report = filter_jobs(input_file, output_file, report_file)
        print("SUCCESS: Filtering completed successfully!")
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()