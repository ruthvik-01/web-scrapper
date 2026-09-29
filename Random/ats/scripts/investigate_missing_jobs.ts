import { chromium } from "playwright";
import * as fs from "fs";

// List of all companies and their base URLs to check
const companies = [
  { name: "Now Optics", baseUrl: "https://nowoptics.hrmdirect.com" },
  { name: "Stake Center Locating", baseUrl: "https://stakecenterlocating.hrmdirect.com" },
  { name: "The Raley's Companies", baseUrl: "https://raleys.hrmdirect.com" },
  { name: "Team Velocity", baseUrl: "https://teamvelocitymarketing.hrmdirect.com" },
  { name: "University of New Mexico Health System", baseUrl: "https://unmhrms.hrmdirect.com" }
];

// The missing job IDs we need to find
const missingJobIds = ["3780813", "3726810"];

async function checkJobExists(company: any, jobId: string): Promise<boolean> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Try to access the job detail page directly
    const jobUrl = `${company.baseUrl}/employment/job-opening.php?req=${jobId}`;
    console.log(`Checking ${jobUrl}`);

    const response = await page.goto(jobUrl, { waitUntil: "networkidle", timeout: 10000 });

    if (response?.status() === 200) {
      // Check if the page contains job-related content
      const content = await page.content();
      if (content.includes("job") || content.includes("position") || content.includes("career")) {
        console.log(`✓ Job ${jobId} found at ${company.name}`);
        return true;
      }
    }

    console.log(`✗ Job ${jobId} not found at ${company.name}`);
    return false;
  } catch (error) {
    console.log(`✗ Error checking job ${jobId} at ${company.name}: ${error.message}`);
    return false;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("Searching for missing job IDs...\n");

  for (const jobId of missingJobIds) {
    console.log(`\nSearching for job ID: ${jobId}`);

    for (const company of companies) {
      const found = await checkJobExists(company, jobId);
      if (found) {
        break; // Found the job, no need to check other companies
      }
    }
  }

  console.log("\nSearch complete.");
}

main().catch(console.error);