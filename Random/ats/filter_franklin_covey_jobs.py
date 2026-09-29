import json
import re
from datetime import datetime
from collections import defaultdict

def is_valid_date(date_str):
    """Check if the date string is in YYYY-MM-DD format"""
    if not date_str or date_str in ["Open Until Filled", "TBD", "N/A"]:
        return False
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False

def is_listing_page(job_url):
    """Check if the job URL points to a listing/search page"""
    listing_patterns = [
        "job-openings.php",
        "?sort=",
        "?search=true",
        "search%3Dtrue"
    ]
    for pattern in listing_patterns:
        if pattern in job_url:
            return True
    return False

def is_generic_title(title):
    """Check if title is generic"""
    generic_titles = [
        "Careers At",
        "Job Openings",
        "Current Openings",
        "Facebook",
        "LinkedIn",
        "Happening now"
    ]
    for pattern in generic_titles:
        if pattern in title:
            return True
    return False

def fix_decimal_points(text):
    """Fix broken decimal points (e.g., '22. 06' -> '22.06')"""
    if not text:
        return text
    # Pattern: digit, period, space, digit
    return re.sub(r'(\d)\.\s+(\d)', r'\1.\2', text)

def strip_boilerplate_from_title(title):
    """Strip boilerplate from title"""
    if not title:
        return title

    # Remove site/location suffixes like ", Careers At <Company>..."
    title = re.sub(r',\s*Careers\s*At.*$', '', title)

    # Remove pay rate text embedded in title
    title = re.sub(r'STARTING\s*PAY.*?(?=,|$)', '', title, flags=re.IGNORECASE)
    title = re.sub(r'PER\s*HOUR\s*DOE.*?(?=,|$)', '', title, flags=re.IGNORECASE)

    # Remove digit runs that are clearly pay rates
    title = re.sub(r'\d+\s*\.\s*\d+', '', title)  # This might be too aggressive, so we'll be careful

    # Clean up any extra spaces
    title = re.sub(r'\s+', ' ', title).strip()

    return title

def strip_boilerplate_from_description(description):
    """Strip boilerplate from description"""
    if not description:
        return description

    # Remove repeated site-name header lines
    boilerplate_patterns = [
        r"Career Opportunities with .*?",
        r"Careers At .*?",
        r"Current job opportunities are posted here as they become available\.",
        r"Back To Openings",
        r"START YOUR APPLICATION",
        r"BRIEF DESCRIPTION",
        r"Department",
        r"Location",
        r"Visit Our Home Page",
        r"Applicant Tracking System Powered by",
        r"TO VIEW FULL JOB DESCRIPTION.*?CLICK LINK BELOW",
        r"\d{4} FranklinCovey"  # Copyright line
    ]

    # Remove duplicated phrases appearing twice in succession
    description = re.sub(r'(\b\w+\b.*?)\1', r'\1', description, flags=re.DOTALL)

    # Remove each boilerplate pattern
    for pattern in boilerplate_patterns:
        description = re.sub(pattern, '', description, flags=re.IGNORECASE)

    # Clean up extra whitespace
    description = re.sub(r'\n\s*\n', '\n\n', description)
    description = re.sub(r'^\s*\n', '', description, flags=re.MULTILINE)
    description = description.strip()

    return description

def sanitize_field_value(field_value, field_name):
    """Check if field value is corrupted (too long or looks like description fragment)"""
    if not field_value:
        return ""

    # Fields that should be short categories
    short_category_fields = ["employmentType", "worktype"]
    if field_name in short_category_fields:
        if len(field_value) > 40 or " " in field_value and len(field_value.split()) > 5:
            # Looks like a sentence fragment, not a category
            return ""

    # Location fields should be short place names
    location_fields = ["salaryRange", "location", "city", "state", "country"]
    if field_name in location_fields:
        if len(field_value) > 100 or " " in field_value and len(field_value.split()) > 10:
            # Likely a paragraph fragment
            return ""

    return field_value

def filter_jobs(jobs_data):
    """Filter jobs according to the rules"""

    # Statistics for reporting
    stats = {
        "original_count": len(jobs_data),
        "removed_step0": 0,
        "title_desc_stripped": 0,
        "artifact_fixes": 0,
        "fields_nulled": defaultdict(int),
        "removed_step4": defaultdict(int),
        "kept": 0,
        "salary_mentioned_empty": 0
    }

    filtered_jobs = []

    # Keep track of job IDs to detect duplicates
    seen_job_ids = set()

    for job in jobs_data:
        # Step 0: Remove listing/search pages mixed in as fake "jobs"
        remove_job = False

        # Check 1: jobId equals jobUrl, or jobId is itself a URL
        if job.get("jobId") == job.get("jobUrl") or (job.get("jobId") and job.get("jobId").startswith(("http://", "https://"))):
            stats["removed_step0"] += 1
            continue

        # Check 2: jobUrl points to a listing/search page
        if job.get("jobUrl") and is_listing_page(job.get("jobUrl")):
            stats["removed_step0"] += 1
            continue

        # Check 3: title is generic
        if job.get("title") and is_generic_title(job.get("title")):
            stats["removed_step0"] += 1
            continue

        # Check 4: description is generic site boilerplate only
        if not job.get("description") or len(job.get("description").strip()) < 50:
            # Very short descriptions are likely boilerplate
            if not any(keyword in job.get("description", "") for keyword in ["responsibilities", "requirements", "duties", "qualifications"]):
                stats["removed_step0"] += 1
                continue

        # Check 5: Duplicate title + description + salaryRange
        # (We'll check this later after cleaning)

        # If we passed Step 0 checks, continue with cleaning
        original_title = job.get("title", "")
        original_description = job.get("description", "")

        # Step 1: Strip embedded site boilerplate
        job["title"] = strip_boilerplate_from_title(job.get("title", ""))
        job["description"] = strip_boilerplate_from_description(job.get("description", ""))

        # Track if we made changes
        if job["title"] != original_title or job["description"] != original_description:
            stats["title_desc_stripped"] += 1

        # Step 2: Fix extraction artifacts
        original_salary = job.get("salaryRange", "")
        original_title_fixed = job.get("title", "")
        original_desc_fixed = job.get("description", "")

        job["salaryRange"] = fix_decimal_points(job.get("salaryRange", ""))
        job["title"] = fix_decimal_points(job.get("title", ""))
        job["description"] = fix_decimal_points(job.get("description", ""))

        # Track if we made changes
        if (job["salaryRange"] != original_salary or
            job["title"] != original_title_fixed or
            job["description"] != original_desc_fixed):
            stats["artifact_fixes"] += 1

        # Step 3: Field-content sanity check
        fields_to_check = ["employmentType", "worktype", "salaryRange", "location", "city", "state", "country"]
        for field in fields_to_check:
            original_value = job.get(field, "")
            cleaned_value = sanitize_field_value(original_value, field)
            if cleaned_value != original_value:
                job[field] = cleaned_value
                stats["fields_nulled"][field] += 1

        # Step 4: Final checks
        # Check 1: Required fields are non-empty
        required_fields = ["jobId", "title", "description", "jobUrl", "postedDate", "company"]
        missing_required = False
        for field in required_fields:
            if not job.get(field) or not job.get(field).strip():
                missing_required = True
                stats["removed_step4"]["missing_required_fields"] += 1
                break

        if missing_required:
            continue

        # Check 2: ats must be exactly "Custom"
        job["ats"] = "Custom"  # Normalize as per instructions

        # Check 3: postedDate is a real, valid YYYY-MM-DD date
        if not is_valid_date(job.get("postedDate", "")):
            stats["removed_step4"]["invalid_posted_date"] += 1
            continue

        # Check 4: jdDeadline, if present, is a real YYYY-MM-DD date or ""/null
        if job.get("jdDeadline") and not is_valid_date(job.get("jdDeadline")):
            job["jdDeadline"] = ""  # Null it instead of removing the job

        # Check 5: After boilerplate stripping, description still contains genuine content
        if not job.get("description") or len(job.get("description").strip()) < 50:
            # Still very short after cleaning - likely no real content
            stats["removed_step4"]["no_genuine_content"] += 1
            continue

        # Check 6: No duplicate jobId within the same company file
        if job.get("jobId") in seen_job_ids:
            stats["removed_step4"]["duplicate_job_id"] += 1
            continue
        seen_job_ids.add(job.get("jobId"))

        # Check 7: jobUrl is a valid, well-formed single-job detail URL
        if not job.get("jobUrl") or not job.get("jobUrl").startswith(("http://", "https://")):
            stats["removed_step4"]["invalid_job_url"] += 1
            continue

        # Check 8: Flag jobs with salary mentioned in description but salaryRange empty
        if (not job.get("salaryRange") and
            job.get("description") and
            any(keyword in job.get("description") for keyword in ["salary", "compensation", "pay", "OTE"])):
            stats["salary_mentioned_empty"] += 1

        # If we got here, the job passes all filters
        stats["kept"] += 1
        filtered_jobs.append(job)

    return filtered_jobs, stats

def main():
    # Read the input file
    with open("D:/Internship/ats/output/FranklinCovey_jobs.json", "r", encoding="utf-8") as f:
        jobs_data = json.load(f)

    # Filter the jobs
    filtered_jobs, stats = filter_jobs(jobs_data)

    # Write the filtered jobs to output file
    with open("D:/Internship/ats/filtered/FranklinCovey_jobs_filtered.json", "w", encoding="utf-8") as f:
        json.dump(filtered_jobs, f, indent=2, ensure_ascii=False)

    # Print the report
    print("Company: FranklinCovey")
    print(f"Jobs in original file: {stats['original_count']}")
    print(f"Removed as listing/search-page contamination (Step 0): {stats['removed_step0']}")
    print(f"Jobs with title/description boilerplate stripped (Step 1): {stats['title_desc_stripped']}")
    print(f"Jobs with extraction-artifact fixes applied (Step 2): {stats['artifact_fixes']}")

    if stats['fields_nulled']:
        print("Fields nulled for content-sanity failure, by field (Step 3):")
        for field, count in stats['fields_nulled'].items():
            print(f"  {field}: {count}")
    else:
        print("Fields nulled for content-sanity failure, by field (Step 3): None")

    if stats['removed_step4']:
        print("Jobs removed at final check (Step 4, by rule violated):")
        for reason, count in stats['removed_step4'].items():
            print(f"  {reason}: {count}")
    else:
        print("Jobs removed at final check (Step 4, by rule violated): None")

    print(f"Jobs kept: {stats['kept']}")
    print(f"Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): {stats['salary_mentioned_empty']}")

if __name__ == "__main__":
    main()