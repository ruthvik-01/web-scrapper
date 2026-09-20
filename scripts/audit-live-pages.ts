import { mkdir, readFile, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { AccessPolicy } from "../src/crawl.js";

// Read-only audit: do not modify delivered CSVs, source code copies, or ZIP.
const output = "output";
const batch = JSON.parse(await readFile(`${output}/_tracking/completed-companies.json`, "utf8"));
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const missing = (value: string) => !value || /^(not specified|not available|please select|n\/a)$/i.test(value);
const genericLocation = (value: string) => /^(united kingdom|uk|home[- ]based|community based|remote|nationwide|not specified)$/i.test(value);
const evidence: Record<string, unknown>[] = [];
for (const company of batch.summaries) {
  const rows: Record<string, string>[] = JSON.parse(await readFile(`${output}/${company.slug}/export-rows.json`, "utf8"));
  const snapshot = JSON.parse(await readFile(`${output}/${company.slug}/scrape-result.json`, "utf8"));
  const policy = new AccessPolicy(1000, 25_000);
  for (const row of rows) {
    try {
      const page = await policy.html(row.jobUrl!);
      const $ = load(page.body);
      const ld: Record<string, unknown>[] = [];
      function visit(value: unknown): void {
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (!value || typeof value !== "object") return;
        const item = value as Record<string, unknown>;
        if (item["@type"] === "JobPosting") { ld.push(item); return; }
        Object.values(item).forEach(visit);
      }
      $("script").each((_, node) => {
        if ($(node).attr("type") === "application/ld+json") {
          try { visit(JSON.parse($(node).text())); } catch { /* Record absent schema below. */ }
        }
      });
      const job = ld.find(job => clean(String(job.title)) === row.title) || ld[0] || {};
      const original = snapshot.rawJobs.find((job: { jobId: string }) => job.jobId === row.jobId);
      $("script,style,input").remove();
      const field = (suffix: string): string => {
        const element = $("[id]").filter((_, node) => {
          const id = $(node).attr("id") || "";
          return id.endsWith(suffix) && !/related|Suggested/i.test(id) && !/^(?:li|div)_/.test(id);
        }).first();
        return clean(element.text());
      };
      const location = field("AllLocations_lblReadonlySelected");
      const salary = field("VacV_DisplaySalary");
      const contract = field("VacV_VacancyTypeID");
      const closing = field("DQAdvertisingEndDate");
      const plainDescription = clean(load(String(job.description || "")).text());
      const findings: string[] = [];
      if (!missing(location) && !genericLocation(location)) {
        if (!row.city && !/^(northern ireland|england|scotland|wales)$/i.test(location)) findings.push("visible_location_not_in_csv_city");
        else if (row.city && !location.toLowerCase().includes(row.city.toLowerCase())) findings.push("visible_location_conflicts_with_csv_city");
      }
      if (!row.salaryRange && !missing(salary)) findings.push("salary_visible_but_csv_empty");
      if (!row.employmentType && !missing(contract)) findings.push("contract_visible_but_csv_empty");
      if (!row.jdDeadline && !missing(closing)) findings.push("closing_date_visible_but_csv_empty");
      const hybridMatch = /[^.!?\n]{0,90}hybrid working available[^.!?\n]{0,100}/i.exec(plainDescription)?.[0] || "";
      if (!row.worktype && hybridMatch) findings.push("explicit_hybrid_wording_but_worktype_empty");
      evidence.push({
        company: company.company, slug: company.slug, jobId: row.jobId, url: row.jobUrl,
        checkedAt: new Date().toISOString(), status: "read",
        csv: Object.fromEntries(["title", "postedDate", "jdDeadline", "city", "state", "location", "salaryRange", "employmentType", "worktype", "reason"].map(key => [key, row[key]])),
        visible: { pageTitle: clean($("title").text()), location, salary, contract, closing, hybridMatch },
        liveStructured: {
          title: job.title, datePosted: job.datePosted ?? null, validThrough: job.validThrough ?? null,
          jobLocation: job.jobLocation, jobLocationType: job.jobLocationType,
        },
        storedSourceDate: original?.postedDate || null,
        sourceDateChangedSinceSnapshot: String(job.datePosted || "") !== String(original?.postedDate || ""),
        findings,
      });
    } catch (error) {
      evidence.push({ company: company.company, slug: company.slug, jobId: row.jobId, url: row.jobUrl, status: "error", error: String(error) });
    }
  }
  console.log(`Audited ${company.company}: ${rows.length} published CSV rows.`);
}
const findings = evidence.filter(item => Array.isArray(item.findings) && item.findings.length);
const counts: Record<string, number> = {};
for (const item of findings) for (const finding of item.findings as string[]) counts[finding] = (counts[finding] || 0) + 1;
await mkdir(`${output}/_tracking/audit-2026-09-15`, { recursive: true });
await writeFile(`${output}/_tracking/audit-2026-09-15/live-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  checked: evidence.length, read: evidence.filter(item => item.status === "read").length,
  errors: evidence.filter(item => item.status === "error"), findingCounts: counts,
  rowsNeedingReview: findings.map(item => ({ company: item.company, jobId: item.jobId, findings: item.findings, visible: item.visible, csv: item.csv })),
}, null, 2));
