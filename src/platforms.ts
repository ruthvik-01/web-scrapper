import { scrapeComeet } from "./comeet.js";
import { scrapeJobtrain } from "./jobtrain.js";
import { scrapeJobSitemap } from "./sitemap.js";
import { scrapeWebsite } from "./strategy.js";
import { scrapeEwJobManager } from "./wp-job-manager.js";
import type { UniversalCompany, Platform } from "./companies.js";
import type { ScrapeOptions } from "./crawl.js";
import type { RawJob, JobRow } from "./normalize.js";
import type { LocationEvidence } from "./geography.js";
import type { OutputInput } from "./output.js";

export interface CollectedResult {
  rows: JobRow[];
  rawJobs: RawJob[];
  report: OutputInput["report"] & {
    sourceUrl: string;
    scrapedAt: string;
    pendingUrls?: string[];
    locationEvidence?: LocationEvidence[];
    sourceCompany?: { name: string; website: string };
  };
}

export type PlatformEngine = (company: UniversalCompany, options: ScrapeOptions) => Promise<CollectedResult>;
export type PlatformRegistry = Record<Platform, PlatformEngine>;

export const platformEngines: PlatformRegistry = {
  comeet: (company, options) => scrapeComeet(company.careersUrl, options),
  eploy: (company, options) => {
    const sitemap = options.sitemapUrl || company.sitemapUrl;
    return sitemap ? scrapeJobSitemap(company.careersUrl, sitemap, options) : scrapeWebsite(company.careersUrl, options);
  },
  jobtrain: (company, options) => scrapeJobtrain(company.careersUrl, options),
  wordpress: (company, options) => scrapeWebsite(company.careersUrl, { ...options, mode: options.mode || "static" }),
  custom: (company, options) => scrapeWebsite(company.careersUrl, options),
  reed: (company, options) => scrapeWebsite(company.careersUrl, options),
  haystack: (company, options) => scrapeWebsite(company.careersUrl, options),
  tribepad: (company, options) => scrapeWebsite(company.careersUrl, options),
  jobadder: (company, options) => scrapeWebsite(company.careersUrl, options),
  portobello: (company, options) => scrapeWebsite(company.careersUrl, options),
  occy: (company, options) => scrapeWebsite(company.careersUrl, options),
  supabase: (company, options) => scrapeWebsite(company.careersUrl, options),
  jobtoday: (company, options) => scrapeWebsite(company.careersUrl, options),
};
