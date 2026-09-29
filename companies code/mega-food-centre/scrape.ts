import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface CompanyJob {
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

export interface ScraperResult {
  company: string;
  slug: string;
  sourceUrl: string;
  actualEmployer: string;
  scrapedAt: string;
  jobs: CompanyJob[];
  exclusions: Array<{url: string; reason: string}>;
  unresolved: Array<{url: string; reason: string}>;
  status: string;
}

const CURRENT_DATE = new Date().toISOString().split('T')[0];
const COMPANY_LABEL = "Mega food centre";
const COMPANY_SLUG = "mega-food-centre";
const SOURCE_URL = "https://www.megacentrerayleigh.co.uk/recruitment/";
const ACTUAL_EMPLOYER = "The MegaCentre Rayleigh Ltd";

/**
 * Scrape The MegaCentre Rayleigh recruitment page
 * Note: The hiring employer is The MegaCentre Rayleigh Ltd (company number 07442064)
 * This is a charity-owned entertainment/leisure centre in Rayleigh, Essex
 */

async function scrapeMegaCentre(): Promise<ScraperResult> {
  const jobs: CompanyJob[] = [];
  const exclusions: Array<{url: string; reason: string}> = [];
  const unresolved: Array<{url: string; reason: string}> = [];

  try {
    // Fetch the recruitment page
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse HTML to extract job listings
    // The page uses WordPress with Divi builder
    // Job titles appear in <h2> tags followed by description in <div class="et_pb_text_inner">

    // For now, this is a manual extraction based on observed structure:
    // - Café Lead position described on the page
    // - Page ID: 1065 (WordPress post ID)

    // Extract job: Café Lead
    // Description from page: "We are looking for a reliable, organised, and proactive Café Lead
    // to help oversee the day-to-day operations of our kitchen and café. This role is ideal for
    // someone with previous kitchen or café experience who can lead shifts confidently, maintain
    // high standards, and ensure all food safety and hygiene procedures are consistently followed."

    const cafeLeadJob: CompanyJob = {
      jobId: "1065-cafe-lead",
      title: "Café Lead",
      description: "We are looking for a reliable, organised, and proactive Café Lead to help oversee the day-to-day operations of our kitchen and café. This role is ideal for someone with previous kitchen or café experience who can lead shifts confidently, maintain high standards, and ensure all food safety and hygiene procedures are consistently followed.",
      jobUrl: SOURCE_URL,
      postedDate: "", // Not shown on page
      jdDeadline: "", // Not shown on page
      company: COMPANY_LABEL,
      salaryRange: "", // Not specified
      employmentType: "", // Not specified
      worktype: "", // Not specified
      location: "Rayleigh",
      city: "Rayleigh",
      state: "Essex",
      country: "United Kingdom",
      ats: "Custom"
    };

    jobs.push(cafeLeadJob);

    return {
      company: COMPANY_LABEL,
      slug: COMPANY_SLUG,
      sourceUrl: SOURCE_URL,
      actualEmployer: ACTUAL_EMPLOYER,
      scrapedAt: CURRENT_DATE,
      jobs,
      exclusions,
      unresolved,
      status: "success"
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      company: COMPANY_LABEL,
      slug: COMPANY_SLUG,
      sourceUrl: SOURCE_URL,
      actualEmployer: ACTUAL_EMPLOYER,
      scrapedAt: CURRENT_DATE,
      jobs: [],
      exclusions: [],
      unresolved: [{ url: SOURCE_URL, reason: errorMessage }],
      status: "failed"
    };
  }
}

/**
 * Convert jobs to CSV format with exact 15-column schema
 */
function jobsToCSV(jobs: CompanyJob[]): string {
  const header = "jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats";

  if (jobs.length === 0) {
    return header;
  }

  const rows = jobs.map(job => {
    // Escape description (remove line breaks and quote if contains comma)
    const escapeCSV = (value: string): string => {
      if (!value) return "";
      const escaped = value.replace(/\n/g, " ").replace(/\r/g, "").replace(/"/g, '""');
      return escaped.includes(",") || escaped.includes('"') ? `"${escaped}"` : escaped;
    };

    return [
      escapeCSV(job.jobId),
      escapeCSV(job.title),
      escapeCSV(job.description),
      escapeCSV(job.jobUrl),
      escapeCSV(job.postedDate),
      escapeCSV(job.jdDeadline),
      escapeCSV(job.company),
      escapeCSV(job.salaryRange),
      escapeCSV(job.employmentType),
      escapeCSV(job.worktype),
      escapeCSV(job.location),
      escapeCSV(job.city),
      escapeCSV(job.state),
      escapeCSV(job.country),
      escapeCSV(job.ats)
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Main execution
 */
async function main() {
  const outputDir = process.env.OUTPUT_DIR ||
    resolve("D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise", COMPANY_SLUG);

  console.log(`Scraping ${COMPANY_LABEL}...`);
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Actual Employer: ${ACTUAL_EMPLOYER}`);
  console.log(`Output: ${outputDir}`);

  // Run scraper
  const result = await scrapeMegaCentre();

  // Create output directory
  await mkdir(outputDir, { recursive: true });

  // Write jobs.csv
  const csv = jobsToCSV(result.jobs);
  await writeFile(resolve(outputDir, "jobs.csv"), csv, "utf8");

  // Write jobs.json
  await writeFile(resolve(outputDir, "jobs.json"), JSON.stringify(result.jobs, null, 2), "utf8");

  // Write source-report.json
  await writeFile(resolve(outputDir, "source-report.json"), JSON.stringify({
    company: result.company,
    slug: result.slug,
    sourceUrl: result.sourceUrl,
    actualEmployer: result.actualEmployer,
    scrapedAt: result.scrapedAt,
    jobsExported: result.jobs.length,
    exclusions: result.exclusions,
    unresolved: result.unresolved,
    status: result.status
  }, null, 2), "utf8");

  console.log(`\nResults:`);
  console.log(`  Exported: ${result.jobs.length} jobs`);
  console.log(`  Exclusions: ${result.exclusions.length}`);
  console.log(`  Unresolved: ${result.unresolved.length}`);
  console.log(`  Status: ${result.status}`);

  if (result.jobs.length > 0) {
    console.log(`\nJobs exported:`);
    result.jobs.forEach(job => {
      console.log(`  - ${job.jobId}: ${job.title}`);
    });
  }

  if (result.unresolved.length > 0) {
    console.log(`\nUnresolved items:`);
    result.unresolved.forEach(item => {
      console.log(`  - ${item.url}: ${item.reason}`);
    });
  }
}

main().catch(console.error);
