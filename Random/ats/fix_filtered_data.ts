import * as fs from "fs";
import * as path from "path";

const REF_DATE = "2026-08-14";
const MEXICO_TERMS = ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"];

interface Job {
  jobId: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate: string;
  jdDeadline: string;
  company: string;
  salaryRange: string;
  employmentType: string;
  worktype: string;
  location: string;
  city: string;
  state: string;
  country: string;
  ats: string;
}

const isMexico = (job: Partial<Job>): boolean => {
  return MEXICO_TERMS.some(term =>
    [job.location, job.city, job.state, job.country]
      .filter(Boolean)
      .some(field => field!.toLowerCase().includes(term))
  );
};

const fixJobData = (job: Job): Job => {
  // For jobs with Mexico-related locations, ensure postedDate is set to REF_DATE and state is set to "NM"
  if (isMexico(job)) {
    job.postedDate = REF_DATE;
    job.state = "NM";
  }
  // For all other jobs, ensure postedDate is set to REF_DATE if it was previously empty
  else if (!job.postedDate) {
    job.postedDate = REF_DATE;
  }

  return job;
};

// Process all filtered JSON files
const filteredDir = path.join(__dirname, "filtered");
const files = fs.readdirSync(filteredDir);

files.forEach(file => {
  if (file.endsWith("_jobs_filtered.json")) {
    const filePath = path.join(filteredDir, file);
    console.log(`Processing ${file}...`);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (Array.isArray(data)) {
        const fixedData = data.map(job => fixJobData(job));
        fs.writeFileSync(filePath, JSON.stringify(fixedData, null, 2));
        console.log(`Fixed ${file}: ${data.length} jobs processed`);
      } else {
        console.warn(`Skipping ${file}: not an array`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
});

console.log("All filtered JSON files have been processed with Mexico filtering and posted date corrections.");