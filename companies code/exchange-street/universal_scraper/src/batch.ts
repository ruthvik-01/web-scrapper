import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { scrapeWebsite } from "./strategy.js";
import { outputCsv, outputRows, type OutputRow } from "./output.js";
import type { ScrapeOptions } from "./crawl.js";

/** Windows can transiently share-violate freshly written files (AV/indexer scans); retry patiently instead of losing a batch. */
async function writeFileStable(path: string, data: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await writeFile(path, data); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!["EBUSY", "EPERM", "EACCES"].includes(code || "") || attempt >= 8) throw error;
      await sleep(Math.min(500 * 2 ** attempt, 4000));
    }
  }
}


export interface BatchCompany {
  name: string;
  slug: string;
  careersUrl: string;
  originalUrl?: string;
  sourceNote?: string;
  employerNames?: string[];
  titlePrefixes?: string[];
  exportCompanyName?: string;
  options?: Omit<ScrapeOptions, "now" | "company">;
}

/** Mixed boards may omit hiringOrganization: scope against the source title instead. */
export function matchesCompanyTitle(title: string, company: BatchCompany): boolean {
  if (!company.titlePrefixes) return true;
  const value = title.trim().toLowerCase();
  return company.titlePrefixes.some(prefix => {
    const start = prefix.trim().toLowerCase();
    return start.length > 0 && value.startsWith(start) && /^(?:$|[\s:–—-])/.test(value.slice(start.length));
  });
}

/** Sequential, per-company checkpointing. A failed company cannot lose others' data. */
export async function runBatch(companies: BatchCompany[], directory: string, resume = false) {
  if (!Array.isArray(companies) || !companies.length) throw new Error("The company manifest must be a nonempty array.");
  const slugs = new Set<string>();
  for (const company of companies) {
    if (!company.name || !/^[a-z0-9][a-z0-9-]*$/.test(company.slug) || slugs.has(company.slug)) {
      throw new Error("Each company needs a name and a unique safe folder slug.");
    }
    slugs.add(company.slug);
  }
  await mkdir(directory, { recursive: true });
  const summaries: Record<string, unknown>[] = [];
  const combined: OutputRow[] = [];
  for (const company of companies) {
    const folder = resolve(directory, company.slug);
    await mkdir(folder, { recursive: true });
    let result: (Awaited<ReturnType<typeof scrapeWebsite>> & { report: {
      scopeExcluded?: { jobId: string; jobUrl: string; company: string }[];
      exportCompanyIdentity?: { name: string; sourceNames: string[] };
    } }) | undefined;
    if (resume) {
      try {
        const savedConfig = JSON.parse(await readFile(resolve(folder, "company.json"), "utf8"));
        if (JSON.stringify(savedConfig) === JSON.stringify(company)) {
          result = JSON.parse(await readFile(resolve(folder, "scrape-result.json"), "utf8"));
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    console.log(`\n=== ${company.name}${result ? " (saved checkpoint)" : ""} ===`);
    try {
      result ||= await scrapeWebsite(company.careersUrl, { ...company.options, company: company.name });
      if (company.titlePrefixes) {
        const source = result.rawJobs ?? result.rows;
        const outside = source.filter(job => !matchesCompanyTitle(job.title, company));
        result.report.scopeExcluded = outside.map(job => ({
          jobId: job.jobId || "", jobUrl: job.jobUrl, company: job.company || "",
          title: job.title, reason: "outside_requested_employer_title_scope",
        }));
        result.rows = result.rows.filter(row => matchesCompanyTitle(row.title, company));
        result.report.skipped = result.report.skipped.filter(job => matchesCompanyTitle(job.title, company));
        result.report.rows = result.rows.length;
        if (result.report.status === "ok" && !result.rows.length) result.report.status = "no_matches";
      }
      if (company.employerNames) {
        const names = new Set(company.employerNames.map(name => name.toLowerCase()));
        const outside = result.rows.filter(row => !names.has(row.company.toLowerCase()));
        result.report.scopeExcluded = [
          ...(result.report.scopeExcluded || []),
          ...outside.map(({ jobId, jobUrl, company }) => ({ jobId, jobUrl, company })),
        ];
        result.rows = result.rows.filter(row => names.has(row.company.toLowerCase()));
        result.report.rows = result.rows.length;
        if (result.report.status === "ok" && !result.rows.length) result.report.status = "no_matches";
      }
      if (company.titlePrefixes || company.employerNames) {
        const urls = new Set(result.rows.map(row => row.jobUrl));
        result.report.dateFallbacks = result.report.dateFallbacks.filter(item => urls.has(item.jobUrl));
      }
      const rows = outputRows(result, company.name);
      if (company.exportCompanyName) {
        result.report.exportCompanyIdentity = {
          name: company.exportCompanyName,
          sourceNames: [...new Set(result.rows.map(row => row.company))],
        };
        // Label only after source-employer scoping. Keep source rows intact for resume/audit.
        for (const row of rows) row.company = company.exportCompanyName;
      }
      await writeFileStable(resolve(folder, "company.json"), JSON.stringify(company, null, 2));
      await writeFileStable(resolve(folder, "scrape-result.json"), JSON.stringify(result, null, 2));
      await writeFileStable(resolve(folder, "export-rows.json"), JSON.stringify(rows, null, 2));
      await writeFileStable(resolve(folder, "scrape-report.json"), JSON.stringify(result.report, null, 2));
      await writeFileStable(resolve(folder, "jobs.csv"), outputCsv(rows));
      combined.push(...rows);
      const summary = {
        company: company.name, slug: company.slug, sourceUrl: company.careersUrl,
        status: result.report.status, jobs: new Set(result.rows.map(row => row.jobId)).size,
        rows: result.rows.length, candidates: result.report.candidates,
        pagesRead: result.report.pagesVisited, issues: result.report.issues.length,
        excluded: result.report.skipped.length, dateFallbacks: result.report.dateFallbacks.length,
        scopeExcluded: result.report.scopeExcluded?.length || 0,
        limited: result.report.limited, attempts: result.report.attempts,
      };
      summaries.push(summary);
      console.log(JSON.stringify(summary));
    } catch (error) {
      const failure = { company: company.name, slug: company.slug, status: "failed", error: String(error) };
      summaries.push(failure);
      await writeFile(resolve(folder, "failure.json"), JSON.stringify(failure, null, 2));
      console.error(failure);
    }
    await writeFileStable(resolve(directory, "companies.csv"), outputCsv(combined));
    await writeFileStable(resolve(directory, "batch-report.json"), JSON.stringify(summaries, null, 2));
  }
  return summaries;
}
