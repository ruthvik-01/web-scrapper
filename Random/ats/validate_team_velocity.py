import json
import requests
from bs4 import BeautifulSoup
import time
import re
from urllib.parse import urljoin, urlparse
import os

def extract_job_details_from_html(html_content, job_url):
    """Extract job details from the HTML content of a job posting page"""
    soup = BeautifulSoup(html_content, 'html.parser')

    # Initialize job details dictionary
    job_details = {
        'title': '',
        'department': '',
        'location': '',
        'city': '',
        'state': '',
        'country': 'US',  # Assuming US as default
        'salaryRange': '',
        'description': '',
        'employmentType': '',
        'worktype': '',
        'postedDate': '',  # We won't have this from live site
        'jdDeadline': '',
        'jobUrl': job_url,
        'jobId': '',  # Extract from URL if possible
        'company': 'Team Velocity',
        'ats': 'HRMDirect'
    }

    try:
        # Extract job ID from URL
        url_params = urlparse(job_url)
        query_params = dict(q.split('=') for q in url_params.query.split('&') if '=' in q)
        if 'req' in query_params:
            job_details['jobId'] = query_params['req']
        else:
            job_details['jobId'] = job_url

        # Look for title
        title_elem = soup.find('h1') or soup.find('h2') or soup.find('title')
        if title_elem:
            title_text = title_elem.get_text(strip=True)
            # Clean up title if it contains extra text
            if ' - ' in title_text:
                title_parts = title_text.split(' - ')
                job_details['title'] = title_parts[0].strip()
            else:
                job_details['title'] = title_text.replace('Back To Openings', '').strip()

        # Look for department
        dept_labels = soup.find_all(string=re.compile(r'Department', re.I))
        for label in dept_labels:
            parent = label.parent
            next_elem = parent.find_next_sibling() or parent.find_next()
            if next_elem:
                job_details['department'] = next_elem.get_text(strip=True)
                break

        # Alternative approach for department (look near "Department" text)
        dept_texts = soup.find_all(string=re.compile(r'Department\s*[A-Z][a-z]+', re.I))
        if not job_details['department'] and dept_texts:
            dept_match = re.search(r'Department\s+([A-Z][a-zA-Z\s]+)', dept_texts[0], re.I)
            if dept_match:
                job_details['department'] = dept_match.group(1).strip()

        # Look for location
        location_labels = soup.find_all(string=re.compile(r'Location', re.I))
        for label in location_labels:
            parent = label.parent
            next_elem = parent.find_next_sibling() or parent.find_next()
            if next_elem:
                location_text = next_elem.get_text(strip=True)
                job_details['location'] = location_text
                # Parse city and state from location
                if ',' in location_text:
                    parts = location_text.split(',')
                    job_details['city'] = parts[0].strip()
                    if len(parts) > 1:
                        state_parts = parts[1].strip().split()
                        if state_parts:
                            job_details['state'] = state_parts[0]
                break

        # Look for salary range
        salary_patterns = [
            r'\$?[\d,]+\.?\d*\s*-\s*\$?[\d,]+\.?\d*\s*(?:PER HOUR|per hour|hourly|Annually|annually)',
            r'(?:STARTING|HIRING)?\s*SALARY\s*RANGE\s*\$?[\d,]+\.?\d*\s*-\s*\$?[\d,]+\.?\d*',
            r'(?:ANNUAL SALARY|Annual Salary)\s*\$?[\d,]+\.?\d*\s*-\s*\$?[\d,]+\.?\d*'
        ]

        text_content = soup.get_text()
        for pattern in salary_patterns:
            matches = re.findall(pattern, text_content, re.IGNORECASE)
            if matches:
                # Clean up the match
                salary_text = re.sub(r'\s+', ' ', matches[0]).strip()
                job_details['salaryRange'] = salary_text
                break

        # If we didn't find with regex, try structured search
        if not job_details['salaryRange']:
            salary_labels = soup.find_all(string=re.compile(r'(?:Salary|Pay|Wage|Rate)', re.I))
            for label in salary_labels:
                parent = label.parent
                # Look for nearby text with numbers
                nearby_text = parent.get_text() + ' ' + ' '.join([sib.get_text() for sib in parent.next_siblings][:3])
                salary_matches = re.findall(r'[\d,]+\.?\d*\s*-\s*[\d,]+\.?\d*', nearby_text)
                if salary_matches:
                    # Find the complete salary phrase
                    start = max(0, nearby_text.find(salary_matches[0]) - 20)
                    end = min(len(nearby_text), nearby_text.find(salary_matches[0]) + len(salary_matches[0]) + 50)
                    salary_phrase = nearby_text[start:end]
                    job_details['salaryRange'] = salary_phrase.strip()
                    break

        # Get full description
        # Look for "BRIEF DESCRIPTION" or similar
        desc_headers = soup.find_all(string=re.compile(r'BRIEF DESCRIPTION|JOB DESCRIPTION|Description', re.I))
        if desc_headers:
            # Get content after the header
            header = desc_headers[0]
            parent = header.parent
            desc_parts = []

            # Collect text from next siblings up to a reasonable limit
            next_elem = parent.find_next()
            count = 0
            while next_elem and count < 20:
                text = next_elem.get_text(strip=True)
                if text and not any(keyword in text.lower() for keyword in ['apply', 'application', 'visit our home', 'powered by']):
                    desc_parts.append(text)
                if any(keyword in text.lower() for keyword in ['requirements', 'qualifications', 'responsibilities', 'duties']):
                    # Continue collecting for full description
                    pass
                elif len(text) > 50 and 'click' in text.lower():
                    # Likely a link to full description, stop here
                    break
                next_elem = next_elem.find_next()
                count += 1

            if desc_parts:
                job_details['description'] = ' '.join(desc_parts)[:2000]  # Limit length
        else:
            # Fallback: get general text content
            paragraphs = soup.find_all('p')
            if paragraphs:
                desc_parts = []
                for p in paragraphs[:10]:  # Limit to first 10 paragraphs
                    text = p.get_text(strip=True)
                    if text and len(text) > 20 and not any(skip in text.lower() for skip in ['home page', 'powered by', 'applicant tracking']):
                        desc_parts.append(text)
                if desc_parts:
                    job_details['description'] = ' '.join(desc_parts)[:2000]

        # Clean up the description to remove footer text
        desc = job_details['description']
        footer_patterns = [
            r'Visit Our Home Page.*Powered by.*$',
            r'Applicant Tracking System.*$',
            r'20\d{2}.*$',
            r'Start Your Application.*$'
        ]
        for pattern in footer_patterns:
            desc = re.sub(pattern, '', desc, flags=re.IGNORECASE | re.DOTALL)
        job_details['description'] = desc.strip()

        # Try to determine employment type from context clues
        if job_details['title'] and 'FULL-TIME' in job_details['title'].upper():
            job_details['employmentType'] = 'Full-time'
        elif 'FT' in job_details['title'] or 'FULL TIME' in job_details['title'].upper():
            job_details['employmentType'] = 'Full-time'

    except Exception as e:
        print(f"Error parsing job details: {str(e)}")

    return job_details

def compare_job_fields(original_job, validated_job):
    """Compare original job fields with validated fields and return discrepancies"""
    discrepancies = []

    fields_to_check = [
        'title', 'description', 'jobUrl', 'company', 'salaryRange',
        'employmentType', 'worktype', 'location', 'city', 'state',
        'country', 'ats'
    ]

    for field in fields_to_check:
        original_value = str(original_job.get(field, '')) if original_job.get(field) is not None else ''
        validated_value = str(validated_job.get(field, '')) if validated_job.get(field) is not None else ''

        # Special handling for certain fields
        if field == 'description':
            # For description, check if validated is a subset or significantly different
            if validated_value and len(validated_value) < len(original_value) * 0.5:
                discrepancies.append({
                    'field': field,
                    'original': original_value[:100] + '...' if len(original_value) > 100 else original_value,
                    'validated': validated_value[:100] + '...' if len(validated_value) > 100 else validated_value,
                    'issue': 'DESCRIPTION_TRUNCATED_OR_INCOMPLETE'
                })
        elif field == 'jobId':
            # Job ID might be different formats but should match if it's numeric
            orig_numeric = re.sub(r'[^\d]', '', original_value)
            valid_numeric = re.sub(r'[^\d]', '', validated_value)
            if orig_numeric and valid_numeric and orig_numeric != valid_numeric:
                discrepancies.append({
                    'field': field,
                    'original': original_value,
                    'validated': validated_value,
                    'issue': 'JOB_ID_MISMATCH'
                })
        else:
            # Standard comparison for other fields
            if original_value != validated_value:
                # Handle minor differences
                if field in ['title'] and original_value.replace(',', '').strip() == validated_value.strip():
                    # Just commas difference, not significant
                    continue

                if field in ['location', 'city', 'state'] and original_value.strip().lower() == validated_value.strip().lower():
                    # Case differences, not significant
                    continue

                if field == 'salaryRange':
                    # Check if one is more detailed than the other but same core info
                    orig_clean = re.sub(r'[^\d\.\-\s]', '', original_value).strip()
                    valid_clean = re.sub(r'[^\d\.\-\s]', '', validated_value).strip()
                    if orig_clean == valid_clean:
                        continue  # Same numerical values

                discrepancies.append({
                    'field': field,
                    'original': original_value,
                    'validated': validated_value,
                    'issue': 'VALUE_MISMATCH'
                })

    return discrepancies

def validate_job_record(job_record, session):
    """Validate a single job record by fetching live data"""
    job_url = job_record.get('jobUrl', '')
    if not job_url:
        return job_record, [{'field': 'jobUrl', 'original': '', 'validated': '', 'issue': 'MISSING_JOB_URL'}]

    try:
        # Fetch the live job page
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = session.get(job_url, headers=headers, timeout=30)
        response.raise_for_status()

        # Extract validated job details
        validated_job = extract_job_details_from_html(response.text, job_url)

        # Copy over fields that we don't validate from live data
        validated_job['postedDate'] = job_record.get('postedDate', '')
        validated_job['jdDeadline'] = job_record.get('jdDeadline', '')

        # Compare with original
        discrepancies = compare_job_fields(job_record, validated_job)

        return validated_job, discrepancies

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error: {str(e)}"
        discrepancy = {
            'field': 'network',
            'original': 'Accessible',
            'validated': error_msg,
            'issue': 'NETWORK_ERROR'
        }
        return job_record, [discrepancy]
    except Exception as e:
        error_msg = f"Parsing error: {str(e)}"
        discrepancy = {
            'field': 'parsing',
            'original': 'Parseable',
            'validated': error_msg,
            'issue': 'PARSING_ERROR'
        }
        return job_record, [discrepancy]

def fetch_actual_team_velocity_jobs(session):
    """Fetch actual job listings from Team Velocity"""
    try:
        url = "https://teamvelocitymarketing.hrmdirect.com/employment/job-openings.php?search=true"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = session.get(url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Find job listings
        job_listings = []

        # Look for job links in the page
        job_links = soup.find_all('a', href=re.compile(r'job-opening\.php'))

        for link in job_links:
            job_url = urljoin("https://teamvelocitymarketing.hrmdirect.com", link['href'])
            title = link.get_text(strip=True)

            # Skip if title is empty or just whitespace
            if not title or len(title.strip()) < 2:
                continue

            job_record = {
                'jobId': '',
                'title': title,
                'description': '',
                'jobUrl': job_url,
                'postedDate': '2026-08-14',  # Default date
                'jdDeadline': '',
                'company': 'Team Velocity',
                'salaryRange': '',
                'employmentType': '',
                'worktype': '',
                'location': '',
                'city': '',
                'state': '',
                'country': 'US',
                'ats': 'HRMDirect'
            }

            job_listings.append(job_record)

        # If no job links found, try alternative selectors
        if not job_listings:
            # Look for table rows or divs that might contain job listings
            job_elements = soup.find_all(['tr', 'div'], class_=re.compile(r'job|position|opening', re.I))

            for elem in job_elements:
                title_elem = elem.find(['h3', 'h4', 'strong', 'td'])
                if title_elem:
                    title = title_elem.get_text(strip=True)
                    if title and len(title) > 5:
                        # Look for a link within this element
                        link = elem.find('a', href=re.compile(r'job'))
                        if link and 'href' in link.attrs:
                            job_url = urljoin("https://teamvelocitymarketing.hrmdirect.com", link['href'])
                        else:
                            job_url = url

                        job_record = {
                            'jobId': '',
                            'title': title,
                            'description': '',
                            'jobUrl': job_url,
                            'postedDate': '2026-08-14',
                            'jdDeadline': '',
                            'company': 'Team Velocity',
                            'salaryRange': '',
                            'employmentType': '',
                            'worktype': '',
                            'location': '',
                            'city': '',
                            'state': '',
                            'country': 'US',
                            'ats': 'HRMDirect'
                        }

                        job_listings.append(job_record)

        return job_listings

    except Exception as e:
        print(f"Error fetching Team Velocity jobs: {str(e)}")
        return []

def main():
    input_file = r"d:\Internship\ats\output\Team Velocity_jobs.json"
    output_file = r"d:\Internship\ats\output\Team Velocity_jobs_verified.json"
    report_file = r"d:\Internship\ats\output\Team Velocity_audit_report.txt"

    # Create a session for connection pooling
    session = requests.Session()

    # Check if the input file has valid job data or just social media links
    with open(input_file, 'r', encoding='utf-8') as f:
        jobs_data = json.load(f)

    # Check if the first few records are social media links
    social_media_indicators = ['facebook.com', 'linkedin.com', 'twitter.com']
    is_social_media_data = any(
        any(indicator in str(job.get('jobUrl', '')).lower() for indicator in social_media_indicators)
        for job in jobs_data[:5]
    )

    if is_social_media_data:
        print("Detected social media sharing links. Fetching actual job listings...")
        jobs_data = fetch_actual_team_velocity_jobs(session)
        print(f"Fetched {len(jobs_data)} actual job listings.")
    else:
        print(f"Processing {len(jobs_data)} job records from file.")

    if not jobs_data:
        print("No job data found.")
        return

    # Validate each job record
    validated_jobs = []
    audit_report = []
    total_discrepancies = 0

    audit_report.append("HCMDirect Quality Validation Report - Team Velocity")
    audit_report.append("=" * 50)
    audit_report.append(f"Total jobs processed: {len(jobs_data)}")
    audit_report.append("")

    for i, job in enumerate(jobs_data):
        job_title = job.get('title', 'Unknown Title')
        job_id = job.get('jobId', 'Unknown ID')
        print(f"Validating job {i+1}/{len(jobs_data)}: {job_title}")

        # Validate the job record
        validated_job, discrepancies = validate_job_record(job, session)
        validated_jobs.append(validated_job)

        if discrepancies:
            total_discrepancies += len(discrepancies)
            audit_report.append(f"Job {i+1}: {job_title} (ID: {job_id})")
            audit_report.append(f"  URL: {job.get('jobUrl', 'N/A')}")
            audit_report.append(f"  Discrepancies found: {len(discrepancies)}")
            for disc in discrepancies:
                audit_report.append(f"    Field '{disc['field']}': {disc['issue']}")
                audit_report.append(f"      Original: {disc['original']}")
                audit_report.append(f"      Validated: {disc['validated']}")
            audit_report.append("")

        # Add a small delay to be respectful to the server
        if i % 10 == 0:  # Every 10 requests
            time.sleep(1)

    # Save validated jobs to new JSON file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(validated_jobs, f, indent=2, ensure_ascii=False)

    # Save audit report
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(audit_report))

    print(f"\nValidation complete!")
    print(f"Processed {len(validated_jobs)} jobs")
    print(f"Found {total_discrepancies} discrepancies")
    print(f"Validated jobs saved to: {output_file}")
    print(f"Audit report saved to: {report_file}")

if __name__ == "__main__":
    main()