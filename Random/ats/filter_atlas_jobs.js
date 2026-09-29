const fs = require('fs');
const path = require('path');

// Read the jobs file
const inputFile = 'D:\\Internship\\ats\\output\\Atlas Technical Consultants_jobs.json';
const outputFile = 'D:\\Internship\\ats\\filtered\\Atlas Technical Consultants_jobs_filtered.json';

// Load the jobs data
const jobsData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// Initialize report counters
let report = {
    company: "Atlas Technical Consultants",
    jobsInOriginalFile: jobsData.length,
    removedAsListingContamination: 0,
    jobsWithTitleDescriptionBoilerplateStripped: 0,
    jobsWithExtractionArtifactFixes: 0,
    fieldsNulledForContentSanityFailure: {},
    jobsRemovedAtFinalCheck: 0,
    jobsKept: 0,
    jobsWithSalaryInDescriptionButEmptySalaryRange: 0
};

// Initialize counters for fields nulled
const fieldTypes = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country'];
fieldTypes.forEach(field => report.fieldsNulledForContentSanityFailure[field] = 0);

// Filtered jobs array
let filteredJobs = [];

// Process each job according to the filtering rules
for (const job of jobsData) {
    // STEP 0 - Remove listing/search pages mixed in as fake "jobs"
    let removeJob = false;

    // Rule 1: jobId equals jobUrl, or jobId is itself a URL
    if (job.jobId === job.jobUrl || job.jobId.includes('http')) {
        removeJob = true;
    }

    // Rule 2: jobUrl points to a listing/search page
    const listingPatterns = ['job-openings.php', '?sort=', '?search=true'];
    if (listingPatterns.some(pattern => job.jobUrl.includes(pattern))) {
        removeJob = true;
    }

    // Rule 3: title is a generic site/page title with no role name
    const genericTitles = ['Careers At', 'Job Openings', 'Current Openings'];
    if (genericTitles.some(pattern => job.title.includes(pattern))) {
        removeJob = true;
    }

    // Rule 4: description is generic site boilerplate only
    const boilerplatePhrases = [
        'cookies and other tracking technologies',
        'Privacy Policy',
        'Terms Conditions',
        'Book a demo',
        'Trusted by'
    ];
    const isBoilerplateOnly = boilerplatePhrases.some(phrase =>
        job.description.includes(phrase) && job.description.length < 500);

    if (isBoilerplateOnly || job.description === '403 Forbidden nginx') {
        removeJob = true;
    }

    // If job should be removed based on Step 0 rules, skip it
    if (removeJob) {
        report.removedAsListingContamination++;
        continue;
    }

    // Create a copy of the job to work with
    let filteredJob = {...job};

    // STEP 1 - Strip embedded site boilerplate from title and description
    let titleModified = false;
    let descriptionModified = false;

    // Clean title - remove trailing site/location suffixes and pay-rate text
    const originalTitle = filteredJob.title;
    // Remove ", Careers At ..." suffixes
    filteredJob.title = filteredJob.title.replace(/,\s*Careers\s*At.*$/i, '');
    // Remove "STARTING PAY ..." fragments
    filteredJob.title = filteredJob.title.replace(/\s*STARTING\s*PAY.*$/i, '');
    // Remove "PER HOUR DOE" fragments
    filteredJob.title = filteredJob.title.replace(/\s*PER\s*HOUR\s*DOE.*$/i, '');

    if (filteredJob.title !== originalTitle) {
        titleModified = true;
    }

    // Clean description - remove boilerplate
    const originalDescription = filteredJob.description;

    // Remove repeated site-name header lines
    filteredJob.description = filteredJob.description.replace(/Career Opportunities with.*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/Careers At.*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/Current job opportunities are posted here as they become available/g, '');
    filteredJob.description = filteredJob.description.replace(/Back To Openings/g, '');

    // Remove structural labels with no content value
    filteredJob.description = filteredJob.description.replace(/^START YOUR APPLICATION\s*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/^BRIEF DESCRIPTION\s*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/^Department\s*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/^Location\s*$/gm, '');

    // Remove footer boilerplate
    filteredJob.description = filteredJob.description.replace(/Visit Our Home Page.*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/Applicant Tracking System Powered by.*$/gm, '');
    filteredJob.description = filteredJob.description.replace(/©\s*\d{4}.*$/gm, '');

    // Remove duplicated phrases
    const sentences = filteredJob.description.split(/[\.\!\?]+/);
    const uniqueSentences = [...new Set(sentences)];
    filteredJob.description = uniqueSentences.join('. ') + '.';

    if (filteredJob.description !== originalDescription) {
        descriptionModified = true;
    }

    if (titleModified || descriptionModified) {
        report.jobsWithTitleDescriptionBoilerplateStripped++;
    }

    // STEP 2 - Fix extraction artifacts
    let artifactsFixed = false;

    // Fix broken decimal points (digit.period.space.digit -> digit.digit)
    const originalSalaryRange = filteredJob.salaryRange;
    filteredJob.salaryRange = filteredJob.salaryRange.replace(/(\d)\.\s+(\d)/g, '$1.$2');

    const originalDesc = filteredJob.description;
    filteredJob.description = filteredJob.description.replace(/(\d)\.\s+(\d)/g, '$1.$2');

    if (filteredJob.salaryRange !== originalSalaryRange || filteredJob.description !== originalDesc) {
        artifactsFixed = true;
    }

    // Handle mangled URLs - remove broken URL fragments
    const urlPattern = /https?\S*/g;
    const brokenUrls = filteredJob.description.match(urlPattern) || [];
    brokenUrls.forEach(url => {
        if (url.includes(' ') || !url.includes('://')) {
            // This is a broken URL, remove it and surrounding context
            filteredJob.description = filteredJob.description.replace(
                new RegExp(`.*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`, 'g'),
                ''
            );
            artifactsFixed = true;
        }
    });

    if (artifactsFixed) {
        report.jobsWithExtractionArtifactFixes++;
    }

    // STEP 3 - Field-content sanity check
    const sanityCheckFields = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country'];

    sanityCheckFields.forEach(field => {
        if (filteredJob[field] && filteredJob[field].length > 40) {
            // Check if it looks like a sentence fragment rather than a categorical value
            if (filteredJob[field].includes(' ') && filteredJob[field].split(' ').length > 5) {
                filteredJob[field] = "";
                report.fieldsNulledForContentSanityFailure[field]++;
            }
        }
    });

    // STEP 4 - Final check - Keep a real job only if ALL conditions are met

    // Rule 1: Required fields are non-empty strings
    const requiredFields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company'];
    let missingRequiredField = requiredFields.some(field => !filteredJob[field] || filteredJob[field].trim() === '');

    // Rule 2: ats is exactly "Custom" (we'll normalize it)
    filteredJob.ats = "Custom";

    // Rule 3: postedDate is a real, valid YYYY-MM-DD date
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDate = datePattern.test(filteredJob.postedDate);

    // Rule 4: jdDeadline, if present, is a real YYYY-MM-DD date or ""/null
    if (filteredJob.jdDeadline && !datePattern.test(filteredJob.jdDeadline)) {
        filteredJob.jdDeadline = "";
    }

    // Rule 5: After boilerplate stripping, description still contains genuine role-specific content
    const hasRealContent = filteredJob.description.length > 100 &&
                          !filteredJob.description.includes('403 Forbidden') &&
                          !filteredJob.description.includes('nginx');

    // Rule 7: jobUrl is a valid, well-formed single-job detail URL
    const isValidUrl = filteredJob.jobUrl && filteredJob.jobUrl.startsWith('http');

    // Final check
    if (missingRequiredField || !isValidDate || !hasRealContent || !isValidUrl) {
        report.jobsRemovedAtFinalCheck++;
        continue;
    }

    // Check if salary is mentioned in description but salaryRange is empty
    if (!filteredJob.salaryRange &&
        (filteredJob.description.includes('$') ||
         filteredJob.description.includes('salary') ||
         filteredJob.description.includes('pay'))) {
        report.jobsWithSalaryInDescriptionButEmptySalaryRange++;
    }

    // Add the filtered job to our array
    filteredJobs.push(filteredJob);
    report.jobsKept++;
}

// Save the filtered jobs
fs.writeFileSync(outputFile, JSON.stringify(filteredJobs, null, 2));

// Print the report
console.log(`${report.company}:`);
console.log(`Jobs in original file: ${report.jobsInOriginalFile}`);
console.log(`Removed as listing/search-page contamination (Step 0): ${report.removedAsListingContamination}`);
console.log(`Jobs with title/description boilerplate stripped (Step 1): ${report.jobsWithTitleDescriptionBoilerplateStripped}`);
console.log(`Jobs with extraction-artifact fixes applied (Step 2): ${report.jobsWithExtractionArtifactFixes}`);
console.log(`Fields nulled for content-sanity failure, by field (Step 3):`, report.fieldsNulledForContentSanityFailure);
console.log(`Jobs removed at final check (Step 4, by rule violated): ${report.jobsRemovedAtFinalCheck}`);
console.log(`Jobs kept: ${report.jobsKept}`);
console.log(`Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): ${report.jobsWithSalaryInDescriptionButEmptySalaryRange}`);