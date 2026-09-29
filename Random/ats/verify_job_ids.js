const fs = require('fs');

// Regex pattern to extract job ID from URL
const jobIdPattern = /req=([0-9]+)/;

console.log('Searching for jobId fields that contain job URLs with req= parameters...\n');

// Get all JSON files in the directory that end with _jobs.json
const files = fs.readdirSync('.')
  .filter(file => file.endsWith('_jobs.json'));

let totalIssuesFound = 0;

// Process each file
files.forEach(file => {
  try {
    // Read the file
    const data = fs.readFileSync(file, 'utf8');
    const jobs = JSON.parse(data);

    let issuesFound = 0;

    // Process each job
    jobs.forEach((job, index) => {
      // Check if jobId contains a job URL with req= parameter
      if (job.jobId && typeof job.jobId === 'string' &&
          job.jobId.includes('job-opening.php') && job.jobId.includes('req=')) {

        const jobIdMatch = job.jobId.match(jobIdPattern);
        const jobUrlMatch = job.jobUrl ? job.jobUrl.match(jobIdPattern) : null;

        if (jobIdMatch) {
          console.log(`Issue found in ${file} at job index ${index}:`);
          console.log(`  jobId: "${job.jobId}"`);
          console.log(`  jobUrl: "${job.jobUrl}"`);

          if (jobUrlMatch) {
            const jobIdFromJobId = jobIdMatch[1];
            const jobIdFromJobUrl = jobUrlMatch[1];

            if (jobIdFromJobId !== jobIdFromJobUrl) {
              console.log(`  MISMATCH: jobId contains ${jobIdFromJobId}, jobUrl contains ${jobIdFromJobUrl}`);
            } else {
              console.log(`  jobId and jobUrl both contain the same req=${jobIdFromJobId}`);
            }
          }

          console.log('');
          issuesFound++;
          totalIssuesFound++;
        }
      }
    });

    if (issuesFound > 0) {
      console.log(`  Found ${issuesFound} issues in ${file}\n`);
    }

  } catch (error) {
    console.error(`Error processing file ${file}:`, error.message);
  }
});

console.log(`Total issues found: ${totalIssuesFound}`);

if (totalIssuesFound === 0) {
  console.log('\nNo issues found matching the described pattern.');
  console.log('All jobId fields are either:');
  console.log('  - Numeric IDs (correct)');
  console.log('  - Generic URLs (search pages, etc.)');
  console.log('  - Other identifiers that do not contain job URLs with req= parameters');
}