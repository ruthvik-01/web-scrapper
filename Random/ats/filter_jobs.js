const fs = require('fs');

// Read the jobs file
const inputFile = 'D:\\Internship\\ats\\output\\Data Device Corporation_jobs.json';
const outputFile = 'D:\\Internship\\ats\\filtered\\Data Device Corporation_jobs_filtered.json';

// Read the data
const rawData = fs.readFileSync(inputFile, 'utf8');
let jobs = JSON.parse(rawData);

console.log(`Jobs in original file: ${jobs.length}`);

// Report counters
let removedAsListingPages = 0;
let jobsWithBoilerplateStripped = 0;
let jobsWithArtifactFixes = 0;
let fieldsNulled = {};
let removedAtFinalCheck = 0;
let jobsKept = 0;
let jobsWithSalaryInDescription = 0;

// Helper function to check if a string is a valid date
function isValidDate(dateString) {
    if (!dateString || dateString === "" || dateString.includes("N/A") || dateString.includes("TBD")) {
        return false;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
        return false;
    }
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

// Helper function to check if URL points to a listing page
function isListingPage(url) {
    if (!url) return false;
    return url.includes('job-openings.php') || url.includes('?sort=') || url.includes('?search=true');
}

// Helper function to check if title is generic
function isGenericTitle(title) {
    if (!title) return true;
    return title === "Careers At Data Device Corporation" ||
           title.includes("Current job opportunities") ||
           title === "Job Openings" ||
           title === "Current Openings";
}

// Step 0: Remove listing/search pages
const jobsAfterStep0 = jobs.filter(job => {
    // Check if jobId equals jobUrl or jobId is itself a URL (listing page)
    if (job.jobId === job.jobUrl || (typeof job.jobId === 'string' && job.jobId.startsWith('http') && job.jobId.includes('job-openings.php'))) {
        removedAsListingPages++;
        return false;
    }

    // Check if jobUrl points to a listing/search page
    if (isListingPage(job.jobUrl)) {
        removedAsListingPages++;
        return false;
    }

    // Check if title is generic
    if (isGenericTitle(job.title)) {
        removedAsListingPages++;
        return false;
    }

    return true;
});

console.log(`Removed as listing/search-page contamination (Step 0): ${removedAsListingPages}`);

// Process remaining jobs
const processedJobs = jobsAfterStep0.map(job => {
    // Make a copy to avoid modifying original
    const processedJob = {...job};

    // Step 1: Strip embedded site boilerplate

    // From title: remove trailing site/location suffix and pay-rate text
    if (processedJob.title) {
        let originalTitle = processedJob.title;

        // Remove ", Careers At <Company>..." suffix
        processedJob.title = processedJob.title.replace(/,\s*Careers\s+At\s+Data\s+Device\s+Corporation.*$/, '');

        // Remove "STARTING PAY ..." fragments
        processedJob.title = processedJob.title.replace(/\s*STARTING\s+PAY\b.*$/i, '');

        // Remove "PER HOUR DOE" fragments
        processedJob.title = processedJob.title.replace(/\s*[A-Z]+\s+[A-Z]+\s+[A-Z]+.*$/i, '');

        // Remove digit runs that are clearly a mangled pay rate
        processedJob.title = processedJob.title.replace(/\s*\d+\s*\d+\s*\d+\s*\d+.*$/, '');

        if (originalTitle !== processedJob.title) {
            jobsWithBoilerplateStripped++;
        }
    }

    // From description: remove boilerplate
    if (processedJob.description) {
        let originalDescription = processedJob.description;

        // Remove repeated site-name header lines
        processedJob.description = processedJob.description.replace(/Career Opportunities with Data Device Corporation/g, '');
        processedJob.description = processedJob.description.replace(/Careers At Data Device Corporation,.*?Current job opportunities are posted here as they become available./g, '');
        processedJob.description = processedJob.description.replace(/Join our fast growing team Current job opportunities are posted here as they become available./g, '');
        processedJob.description = processedJob.description.replace(/Back To Openings/g, '');

        // Remove bare structural labels
        processedJob.description = processedJob.description.replace(/START YOUR APPLICATION/g, '');
        processedJob.description = processedJob.description.replace(/^Department\s*$/gm, '');
        processedJob.description = processedJob.description.replace(/^Location\s*$/gm, '');

        // Remove footer boilerplate
        processedJob.description = processedJob.description.replace(/Visit Our Home Page/g, '');
        processedJob.description = processedJob.description.replace(/2026 Data Device Corporation Applicant Tracking System Powered by/g, '');

        // Remove duplicated phrases appearing twice in immediate succession
        processedJob.description = processedJob.description.replace(/(For more than.*?years.*?)\1/g, '$1');

        // Clean up extra whitespace
        processedJob.description = processedJob.description.replace(/\n\s*\n\s*\n/g, '\n\n');
        processedJob.description = processedJob.description.replace(/^\s+/gm, '').trim();

        if (originalDescription !== processedJob.description) {
            jobsWithBoilerplateStripped++;
        }
    }

    // Step 2: Fix extraction artifacts
    let artifactFixed = false;

    // Fix broken decimal points
    ['salaryRange', 'title', 'description'].forEach(field => {
        if (processedJob[field]) {
            const originalValue = processedJob[field];
            processedJob[field] = processedJob[field].replace(/(\d)\.\s+(\d)/g, '$1.$2');
            if (originalValue !== processedJob[field]) {
                artifactFixed = true;
            }
        }
    });

    if (artifactFixed) {
        jobsWithArtifactFixes++;
    }

    // Step 3: Field-content sanity check
    const sanityCheckFields = ['employmentType', 'worktype', 'salaryRange', 'location', 'city', 'state', 'country'];

    sanityCheckFields.forEach(field => {
        if (processedJob[field] && processedJob[field].length > 40) {
            // Check if it looks like a sentence fragment rather than a category
            if (processedJob[field].includes('.') || processedJob[field].includes(',')) {
                if (!fieldsNulled[field]) fieldsNulled[field] = 0;
                fieldsNulled[field]++;
                processedJob[field] = "";
            }
        }
    });

    // Set ats to "Custom" as required
    processedJob.ats = "Custom";

    return processedJob;
});

// Step 4: Final check
const jobsAfterStep4 = processedJobs.filter(job => {
    // 1. Required fields are non-empty strings
    const requiredFields = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'company'];
    for (const field of requiredFields) {
        if (!job[field] || typeof job[field] !== 'string' || job[field].trim() === '') {
            removedAtFinalCheck++;
            return false;
        }
    }

    // 2. ats is exactly "Custom" (we set this above)
    if (job.ats !== "Custom") {
        removedAtFinalCheck++;
        return false;
    }

    // 3. postedDate is a real, valid YYYY-MM-DD date
    if (!isValidDate(job.postedDate)) {
        removedAtFinalCheck++;
        return false;
    }

    // 4. jdDeadline, if present, is a real YYYY-MM-DD date or ""/null
    if (job.jdDeadline && job.jdDeadline !== "" && !isValidDate(job.jdDeadline)) {
        // Just null it, don't remove the job
        job.jdDeadline = "";
    }

    // 5. After boilerplate stripping, description still contains genuine role-specific content
    if (!job.description || job.description.trim() === '' ||
        job.description.includes('Powered by') ||
        job.description.toLowerCase().includes('applicant tracking system')) {
        removedAtFinalCheck++;
        return false;
    }

    // 7. jobUrl is a valid, well-formed single-job detail URL
    if (!job.jobUrl || !job.jobUrl.startsWith('http')) {
        removedAtFinalCheck++;
        return false;
    }

    // Count jobs with salary mentioned in description but salaryRange empty
    if ((!job.salaryRange || job.salaryRange === "") &&
        job.description &&
        (job.description.includes('salary') || job.description.includes('compensation') ||
         job.description.includes('$') || job.description.includes('hourly') ||
         job.description.includes('annually'))) {
        jobsWithSalaryInDescription++;
    }

    jobsKept++;
    return true;
});

console.log(`Jobs with title/description boilerplate stripped (Step 1): ${jobsWithBoilerplateStripped}`);
console.log(`Jobs with extraction-artifact fixes applied (Step 2): ${jobsWithArtifactFixes}`);
console.log(`Fields nulled for content-sanity failure, by field (Step 3):`, fieldsNulled);
console.log(`Jobs removed at final check (Step 4, by rule violated): ${removedAtFinalCheck}`);
console.log(`Jobs kept: ${jobsKept}`);
console.log(`Jobs with salary mentioned in description but salaryRange empty (flagged, not removed): ${jobsWithSalaryInDescription}`);

// Write the filtered results
fs.writeFileSync(outputFile, JSON.stringify(jobsAfterStep4, null, 2));

// Print the report
console.log('\nCompany: Data Device Corporation');
console.log('Jobs in original file:', jobs.length);
console.log('Removed as listing/search-page contamination (Step 0):', removedAsListingPages);
console.log('Jobs with title/description boilerplate stripped (Step 1):', jobsWithBoilerplateStripped);
console.log('Jobs with extraction-artifact fixes applied (Step 2):', jobsWithArtifactFixes);
console.log('Fields nulled for content-sanity failure, by field (Step 3):', fieldsNulled);
console.log('Jobs removed at final check (Step 4, by rule violated):', removedAtFinalCheck);
console.log('Jobs kept:', jobsKept);
console.log('Jobs with salary mentioned in description but salaryRange empty (flagged, not removed):', jobsWithSalaryInDescription);