import axios from "axios";
import * as fs from "fs";
import PQueue from "p-queue";

const CONFIG = {
  apiBase: "https://jobsapi-google.m-cloud.io/api/job/search",
  companyId: "companies/8454851f-07b7-4e4c-9b5f-00e0ffbfcb09",
  company: "HomeDepot",
  refDate: "2026-08-14",
  concurrency: 5,
  pageSize: 100,
};

const CUTOFF_DATE = new Date(CONFIG.refDate);
CUTOFF_DATE.setDate(CUTOFF_DATE.getDate() - 30);
const isWithin30Days = (dateStr: string): boolean => new Date(dateStr) >= CUTOFF_DATE;

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

interface GoogleJob {
  name: string;
  title: string;
  description: string;
  companyName: string;
  addresses: string[];
  postingPublishTime: string;
  postingExpireTime?: string;
  open_date?: string;
  close_date?: string;
  job_type?: string;
  employment_type?: string;
  salary?: string;
  url?: string;
  id?: number;
  customAttributes?: Record<string, { stringValues: string[] }>;
  requisitionId?: string;
  primary_city?: string;
  primary_state?: string;
  primary_country?: string;
  summary?: {
    job_summary?: string;
  };
}

const cleanDesc = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\n|\t|\r/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractSalary = (desc: string): string => {
  const patterns = [
    /\$\d{1,3}(?:,\d{3})+(?:\.\d{2})?\s*(?:-\s*\$?\d{1,3}(?:,\d{3})+(?:\.\d{2})?)?/g,
    /\$\d+(?:\.\d{2})?\s*(?:-\s*\$?\d+(?:\.\d{2})?)?/g,
    /\d{1,3}(?:,\d{3})+\s*dollars/gi,
    /\$\d+\.\d{2}/g,
  ];
  for (const p of patterns) {
    const m = desc.match(p);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return "";
};


const parseAddress = (job: GoogleJob): { city: string; state: string; country: string; location: string } => {
  if (job.primary_city && job.primary_state) {
    return {
      city: job.primary_city,
      state: job.primary_state,
      country: job.primary_country || "US",
      location: `${job.primary_city}, ${job.primary_state}`,
    };
  }
  const addr = job.addresses?.[0] || "N/A";
  const parts = addr.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    const country = parts[parts.length - 1];
    const state = parts[parts.length - 2];
    const city = parts[parts.length - 3];
    return { city, state, country, location: `${city}, ${state}` };
  }
  return { city: "N/A", state: "N/A", country: "US", location: addr };
};

const fetchJobs = async (offset: number): Promise<GoogleJob[]> => {
  const filter = encodeURIComponent(
    '(ats_portalid="THD-GH-Construction" OR ats_portalid="THD-GH-Bell" OR ats_portalid="THD-GH-Umi" OR ats_portalid="THD-GH-Cancostile" OR ats_portalid="THD-GH-Jarrell" OR ats_portalid="THD-GH-MVP" OR ats_portalid="THD-GH-Victoria" OR ats_portalid="KBR-5032" OR ats_portalid="Workday" OR ats_portalid="Paycom")'
  );
  const url = `${CONFIG.apiBase}?pageSize=${CONFIG.pageSize}&offset=${offset}&companyName=${encodeURIComponent(CONFIG.companyId)}&customAttributeFilter=${filter}`;

  const resp = await axios.get(url, { timeout: 30000 });
  const data = resp.data;

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.searchResults?.map((r: any) => ({ ...r.job, summary: r.summary })) || [];
};

const isMexicoLocation = (addr: { city: string; state: string; country: string; location: string }): boolean =>
  /Mexico|Mexico City|Monterrey|^MX$|MX\b|Mexico\b/i.test(`${addr.city} ${addr.state} ${addr.country} ${addr.location}`);

const isFabricatedDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date(CONFIG.refDate);
  const maxDate = new Date(now);
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  return d > maxDate;
};

const convertJob = (job: GoogleJob): Job | null => {
  const addr = parseAddress(job);
  const jobId = job.id?.toString() || job.name.split("/").pop() || "unknown";
  const cleanDescription = cleanDesc(job.description);

  const hasRealPostedDate = !!job.open_date;
  const rawDeadline = job.close_date ? (job.close_date as string).split("T")[0] : "";
  const hasRealDeadline = !!job.close_date && !isFabricatedDate(rawDeadline);
  const postedDate = hasRealPostedDate ? (job.open_date as string).split("T")[0] : CONFIG.refDate;
  const jdDeadline = hasRealDeadline ? rawDeadline : "";

  // Mexico rule: if dates missing and Mexico location, skip
  if ((!hasRealPostedDate || !hasRealDeadline) && isMexicoLocation(addr)) return null;

  // Filter jobs older than 30 days
  if (hasRealPostedDate && !isWithin30Days(postedDate)) return null;

  // Extract salary from description
  const salary = extractSalary(cleanDescription);

  const jobUrl = job.url || `https://careers.homedepot.com/job/${jobId}/`;

  return {
    jobId,
    title: job.title,
    description: cleanDescription,
    jobUrl,
    postedDate,
    jdDeadline,
    company: "The Home Depot",
    salaryRange: salary,
    employmentType: job.employment_type || "",
    worktype: job.job_type || "",
    location: addr.location,
    city: addr.city,
    state: addr.state,
    country: addr.country,
    ats: "Custom",
  };
};

const discoverAll = async (): Promise<GoogleJob[]> => {
  const all: GoogleJob[] = [];
  let offset = 0;
  let hasMore = true;

  console.log("Discovering jobs...");

  while (hasMore) {
    try {
      const jobs = await fetchJobs(offset);
      if (jobs.length === 0) {
        hasMore = false;
        break;
      }
      all.push(...jobs);
      console.log(`Offset ${offset}: ${jobs.length} jobs (total: ${all.length})`);
      offset += CONFIG.pageSize;

      if (all.length >= 40000) {
        console.log("Max limit reached");
        break;
      }
    } catch (err: any) {
      console.error(`Error at offset ${offset}:`, err.message);
      hasMore = false;
    }
  }

  return all;
};

const main = async () => {
  const googleJobs = await discoverAll();
  console.log(`Discovered: ${googleJobs.length}`);

  const uniqueJobs = new Map<string, Job>();
  for (const gj of googleJobs) {
    const job = convertJob(gj);
    if (job && !uniqueJobs.has(job.jobId)) uniqueJobs.set(job.jobId, job);
  }
  const jobs = [...uniqueJobs.values()];

  const outFile = `${CONFIG.company.toLowerCase()}_jobs.json`;
  fs.writeFileSync(outFile, JSON.stringify(jobs, null, 2));

  console.log(`Company: ${CONFIG.company}`);
  console.log(`Discovered: ${googleJobs.length}`);
  console.log(`Scraped: ${jobs.length}`);
  console.log(`JSON: ${outFile}`);
};

main().catch(console.error);
