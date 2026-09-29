const fs = require('fs');
const path = require('path');

// Regex pattern to extract job ID from URL
const jobIdPattern = /req=([0-9]+)/;

// Function to fix jobId in a single file
function fixJobIdsInFile(filePath) {
  console.log(`Processing file: ${filePath}`);

  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    const jobs = JSON.parse(data);

    let fixedCount = 0;

    // Process each job
    const fixedJobs = jobs.map(job => {
      // Check if jobId is a URL containing job-opening.php and jobUrl contains req parameter
      if (job.jobId && job.jobId.includes('job-opening.php') && job.jobUrl) {
        const match = job.jobUrl.match(jobIdPattern);
        if (match) {
          const numericId = match[1];
          job.jobId = numericId;
          fixedCount++;
        }
      }
      return job;
    });

    // Write the fixed data back to the file
    fs.writeFileSync(filePath, JSON.stringify(fixedJobs, null, 2));
    console.log(`Fixed ${fixedCount} job IDs in ${filePath}`);

  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
  }
}

// Get all JSON files in the directory
const files = fs.readdirSync('.')
  .filter(file => file.endsWith('_jobs.json'));

console.log(`Found ${files.length} job files to process`);

// Process each file
files.forEach(file => {
  fixJobIdsInFile(file);
});

console.log('Done!');