import { readFile, mkdir, writeFile, mkdtemp, cp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { loadCompanies, type UniversalCompany } from "../src/companies.js";
import { scrapeUniversalCompany } from "../universal.js";
import type { CollectedResult } from "../src/platforms.js";
import { compareScraperRows } from "../src/scraper-comparison.js";
import type { JobRow, RawJob } from "../src/normalize.js";

const root = resolve(import.meta.dirname, "../..");
const directory = resolve(root, "web_scrapper_project/docs/universal-implementation");
const inventory: { slug: string; sourceFiles: string[] }[] = JSON.parse(await readFile(resolve(root, "web_scrapper_project/docs/universal-audit/company-inventory.json"), "utf8"));
const now = new Date("2026-10-05T05:00:00Z");
const options = { now, delayMs: 0, timeoutMs: 1000 };
const body = "Build and maintain software services. Collaborate with engineers to review code, test applications and investigate production defects.";

function fixtureFetch(company: UniversalCompany): typeof fetch {
  const board = new URL(company.careersUrl);
  const origin = board.origin;
  const tenant = board.pathname.split("/").filter(Boolean)[0];
  const detail = (id: string) => company.platform === "jobtrain" ? `${origin}/${tenant}/Job/JobDetail?JobId=${id}` : `${origin}/vacancies/${id}/engineer.html`;
  const employer = company.employerNames?.[0] || company.name;
  const schema = (id: string) => ({ "@context": "https://schema.org", "@type": "JobPosting", title: "Software Engineer", description: `<p>${body}</p>`,
    identifier: { name: employer, value: id }, url: detail(id), datePosted: "2026-10-01", hiringOrganization: { name: employer }, employmentType: "FULL_TIME",
    baseSalary: { currency: "GBP", value: { minValue: 45000, maxValue: 50000, unitText: "YEAR" } },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "London", addressCountry: id === "foreign" ? "CA" : id === "unknown" ? "" : "GB" } } });
  return async input => {
    const url = new URL(String(input));
    if (url.hostname === "api.postcodes.io") return Response.json({ status: 200, result: [] });
    if (url.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/live-jobs.xml`);
    if (company.platform === "comeet") {
      const positions = ["uk", "foreign", "unknown", "missing-update"].map(uid => ({ uid, name: "Software Engineer", company_name: employer,
        url_comeet_hosted_page: `${company.careersUrl}engineer/${uid}`, time_updated: uid === "missing-update" ? null : "2026-10-01T10:00:00Z",
        location: uid === "unknown" ? {} : { name: uid === "foreign" ? "London, Canada" : "London, UK", country: uid === "foreign" ? "CA" : "GB", city: "London" },
        custom_fields: { details: [{ name: "Description", value: `<p>${body}</p>` }, { name: "Salary", value: "£45000-£50000 per annum" }] }, workplace_type: "Hybrid", employment_type: "Full-time" }));
      return new Response(`<script>\nCOMPANY_DATA = ${JSON.stringify({ name: employer, website: "https://example.org" })};\nCOMPANY_POSITIONS_DATA = ${JSON.stringify(positions)};\n</script>`);
    }
    if (company.platform === "jobtrain" && /\/_JobCard$/i.test(url.pathname)) {
      const ids = url.searchParams.get("Skip") === "0" ? ["uk", "foreign"] : ["unknown"];
      return new Response(`<input id="totalMatchRecords" value="3">${ids.map(id => `<a href="${detail(id)}">Engineer</a>`).join("")}`);
    }
    if (company.platform === "jobtrain" && !url.searchParams.has("JobId")) return new Response(`<div id="requestUrl" data-request-url="${origin}/${tenant}/Home/_JobCard"></div>`);
    if (/\.xml$/.test(url.pathname)) return new Response(`<urlset>${["uk", "foreign", "unknown"].map(id => `<url><loc>${detail(id)}</loc></url>`).join("")}</urlset>`);
    const id = url.searchParams.get("JobId") || url.pathname.split("/").at(-2) || "uk";
    return new Response(`<script type="application/ld+json">${JSON.stringify(schema(id))}</script>`);
  };
}
const reports = [];
const originalFetch = globalThis.fetch;
const originalLog = console.log;
await mkdir(directory, { recursive: true });
// Copies execute beneath the primary app so its pinned dependencies resolve.
// Company source and historical output directories are never modified.
const baselineDirectory = await mkdtemp(resolve(directory, ".baseline-"));
try {
  for (const company of await loadCompanies()) {
    const oldFolder = inventory.find(item => item.slug === company.slug);
    if (!oldFolder) continue;
    const filename = company.platform === "comeet" ? "comeet" : company.platform === "jobtrain" ? "jobtrain" : "sitemap";
    const sourceFile = oldFolder.sourceFiles?.find(file => file.endsWith(`/src/${filename}.ts`));
    if (!sourceFile) continue;
    console.log = () => {};
    globalThis.fetch = fixtureFetch(company);
    let before: CollectedResult, after: Awaited<ReturnType<typeof scrapeUniversalCompany>>;
    try {
      const copiedSource = resolve(baselineDirectory, company.slug, "src");
      await cp(dirname(resolve(root, sourceFile)), copiedSource, { recursive: true });
      const old = await import(pathToFileURL(resolve(copiedSource, `${filename}.ts`)).href);
      const configOptions = { ...company.options, ...options, company: company.name };
      before = company.platform === "comeet" ? await old.scrapeComeet(company.careersUrl, configOptions)
        : company.platform === "jobtrain" ? await old.scrapeJobtrain(company.careersUrl, configOptions)
        : await old.scrapeJobSitemap(company.careersUrl, company.options?.sitemapUrl || company.sitemapUrl || `${new URL(company.careersUrl).origin}/live-jobs.xml`, configOptions);
      after = await scrapeUniversalCompany(company, options);
    } finally { console.log = originalLog; globalThis.fetch = originalFetch; }
    const oldRows: JobRow[] = before.rows.map(row => ({ ...row, company: company.exportCompanyName || row.company }));
    const sourceJobIds = Object.fromEntries(after.rawJobs.map(job => [job.jobUrl, company.platform === "jobtrain" ? new URL(job.jobUrl).searchParams.get("JobId") || "" : company.platform === "comeet" ? new URL(job.jobUrl).pathname.split("/").at(-1)! : new URL(job.jobUrl).pathname.split("/").at(-2)!]));
    const comparison = compareScraperRows(oldRows, after.rows, { runDay: "2026-10-05", sourceMissingPostedUrls: before.rawJobs.filter(job => !job.postedDate).map(job => job.jobUrl), sourceJobIds, normalizeUkLabels: true, normalizeDescriptionWhitespace: true, normalizeAnnualGbp: true });
    const rawKey = (job: RawJob) => job.jobUrl;
    const oldIds = before.rawJobs.map(rawKey).sort(), newIds = after.rawJobs.map(rawKey).sort();
    const sourceParity = JSON.stringify(oldIds) === JSON.stringify(newIds);
    const result = { company: company.slug, platform: company.platform, fixture: "Synthetic fixed source data; actual old collector versus actual universal collector, not live vacancies",
      sourceFile, sourceSha256: createHash("sha256").update(await readFile(resolve(root, sourceFile))).digest("hex"), oldSourceJobs: before.rawJobs.length, newSourceJobs: after.rawJobs.length, sourceParity,
      oldStatus: before.report.status, universalStatus: after.report.status, comparison,
      verified: sourceParity && comparison.unexplained === 0 && after.report.status === "ok" };
    reports.push(result);
    const folder = resolve(directory, "fixtures", company.slug); await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, "old.json"), JSON.stringify(oldRows, null, 2) + "\n");
    await writeFile(resolve(folder, "universal.json"), JSON.stringify(after.rows, null, 2) + "\n");
    console.log(`${company.slug}: ${result.verified ? "PASS" : "FAIL"}, source ${result.oldSourceJobs}/${result.newSourceJobs}, rows ${comparison.oldCount}/${comparison.newCount}, unexplained ${comparison.unexplained}`);
  }
} finally { globalThis.fetch = originalFetch; console.log = originalLog; await rm(baselineDirectory, { recursive: true, force: true }); }
const summary = { scope: "Offline synthetic fixtures; no live company claim", companies: reports.length, passed: reports.filter(report => report.verified).length, failed: reports.filter(report => !report.verified).length, reports };
await writeFile(resolve(directory, "regression.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ companies: summary.companies, passed: summary.passed, failed: summary.failed }));
if (summary.failed) process.exitCode = 1;
