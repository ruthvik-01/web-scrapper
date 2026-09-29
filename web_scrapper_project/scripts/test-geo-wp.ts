import { schemaJob } from "../src/extract.js";
import { Geography } from "../src/geography.js";
import { normalizeJobs } from "../src/normalize.js";

const rawLd = {
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "datePosted": "2026-09-17T09:56:41+00:00",
  "validThrough": "2026-10-01T23:59:59+00:00",
  "title": "Interim Workforce Change & ER Lead",
  "description": "<p>UWE Bristol is an ambitious...</p>",
  "employmentType": ["CONTRACTOR"],
  "hiringOrganization": { "@type": "Organization", "name": "Morgan Law" },
  "identifier": { "@type": "PropertyValue", "value": "https://www.morgan-law.com/job/interim-workforce-change-er-lead-20631/" },
  "jobLocation": { "@type": "Place", "address": "Bristol" },
  "baseSalary": { "@type": "MonetaryAmount", "value": { "value": "£65000 - £80000 per annum" } }
};

const job = schemaJob(rawLd, "https://www.morgan-law.com/job/interim-workforce-change-er-lead-20631/", "Morgan Law");
job.ats = "WP Job Manager";
job.visibleLocation = "Bristol";

const geo = new Geography();
const resolved = await geo.resolve(job);
console.log("Resolved job locations:", JSON.stringify(resolved.locations, null, 2));

const normalized = normalizeJobs([resolved], new Date("2026-09-21T10:00:00Z"));
console.log("Normalized rows:", JSON.stringify(normalized.rows, null, 2));
console.log("Skipped:", JSON.stringify(normalized.skipped, null, 2));
