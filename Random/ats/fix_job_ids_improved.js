const fs = require('fs');

// Regex pattern to extract job ID from URL
const jobIdPattern = /req=([0-9]+)/;

// Function to fix jobId in a single file
function fixJobIdsInFile(filePath) {
  console.log(`\nProcessing file: ${filePath}`);

  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    const jobs = JSON.parse(data);

    let fixedCount = 0;
    let totalCount = 0;

    // Process each job
    const fixedJobs = jobs.map((job, index) => {
      totalCount++;

      // Check if jobUrl contains a req parameter
      if (job.jobUrl) {
        const match = job.jobUrl.match(jobIdPattern);
        if (match) {
          const numericId = match[1];

          // Check if jobId is a URL containing job-opening.php (indicating it might be incorrectly set)
          if (job.jobId && typeof job.jobId === 'string' &&
              (job.jobId.includes('job-opening.php') || job.jobId.includes('req='))) {
            // Fix the jobId to be the numeric ID
            console.log(`  Fixed jobId for job ${index}: "${job.jobId}" -> "${numericId}"`);
            job.jobId = numericId;
            fixedCount++;
          } else if (job.jobId && typeof job.jobId === 'string' &&
                     job.jobId.startsWith('http') && !job.jobId.includes('req=')) {
            // This is a URL but not a job opening URL, which might be okay
            // We won't change these as they seem to be search page URLs
          } else if (!job.jobId) {
            // If jobId is missing, set it to the numeric ID
            console.log(`  Added jobId for job ${index}: "${numericId}"`);
            job.jobId = numericId;
            fixedCount++;
          }
        }
      }

      return job;
    });

    // Write the fixed data back to the file
    fs.writeFileSync(filePath, JSON.stringify(fixedJobs, null, 2));
    console.log(`Processed ${totalCount} jobs, fixed ${fixedCount} job IDs in ${filePath}`);

  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
  }
}

// Get all JSON files in the directory that end with _jobs.json
const files = fs.readdirSync('.')
  .filter(file => file.endsWith('_jobs.json'));

console.log(`Found ${files.length} job files to process`);

// Process each file
files.forEach(file => {
  fixJobIdsInFile(file);
});

console.log('\nDone!');