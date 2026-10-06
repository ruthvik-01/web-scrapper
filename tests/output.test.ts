import assert from "node:assert/strict";
import { test } from "node:test";
import { OUTPUT_COLUMNS, outputCsv, outputRows } from "../src/output.js";
import { normalizeJobs, type SkippedJob } from "../src/normalize.js";
import { extractJobs } from "../src/extract.js";

const now = new Date("2026-09-15T12:00:00Z");
const report = {
  process: "STATIC", status: "ok", candidates: 1,
  window: { from: "2026-07-15", to: "2026-09-15" },
  skipped: [], issues: [], limited: false,
};

test("exports exactly 15 columns with empty missing fields in CSV and JSON", () => {
  const { rows } = normalizeJobs([{
    jobId: "101", title: "Engineer", description: "Build software",
    jobUrl: "https://example.com/jobs/101", postedDate: "2026-08-20",
    company: "ABC", salaryRange: "Not Specified", locations: [{ city: "London", country: "GB" }],
  }], now);
  const exported = outputRows({ rows, report });
  assert.deepEqual(Object.keys(exported[0]!), [...OUTPUT_COLUMNS]);
  assert.equal(OUTPUT_COLUMNS.length, 15);
  assert.ok(!("process" in exported[0]!));
  assert.ok(!("reason" in exported[0]!));
  assert.equal(exported[0]!.salaryRange, "");
  assert.equal(exported[0]!.jdDeadline, "");
  assert.equal(exported[0]!.ats, "Custom");
  assert.equal(outputRows({ rows: [{ ...rows[0]!, ats: "Eploy" }], report })[0]!.ats, "Eploy");
  const csv = outputCsv(exported);
  assert.ok(csv.startsWith("\uFEFF" + OUTPUT_COLUMNS.join(",")));
  assert.ok(csv.endsWith('"Custom"\r\n'));
  assert.ok(!csv.includes("NULL"));
});

test("zero-result exports are header-only; the report keeps the reasons", () => {
  const rows = outputRows({
    rows: [], report: {
      ...report, status: "partial", candidates: 0, limited: true,
      issues: [{ url: "https://example.com/jobs", message: "HTTP 403" }],
    },
  }, "ABC");
  assert.deepEqual(rows, []);
  assert.equal(outputCsv(rows), "\uFEFF" + OUTPUT_COLUMNS.join(",") + "\r\n");
});

test("missing posting dates stay empty in exports; the fallback is report/UI only", () => {
  const result = normalizeJobs([{
    jobId: "missing", title: "Engineer", description: "Build",
    jobUrl: "https://example.com/jobs/missing", locations: [{ city: "London", country: "GB" }],
  }], now);
  const rows = outputRows({ rows: result.rows, report });
  // Data contract: postedDate is null/empty when the source has none.
  assert.equal(rows[0]!.postedDate, "");
  assert.deepEqual(result.dateFallbacks, [{ jobId: "missing", jobUrl: "https://example.com/jobs/missing", assignedDate: "2026-09-15" }]);
  assert.equal(Object.keys(rows[0]!).length, 15);
});

test("Eploy exposes the real VacancyID, and description includes separate qualification/benefit sections", () => {
  const url = "https://careers.example.com/vacancies/3509/engineer.html";
  const data = {
    "@type": "JobPosting", url, title: "Engineer", description: "Build software",
    qualifications: "Degree required", jobBenefits: "Pension",
    datePosted: "2026-08-20", jobLocation: { address: { addressCountry: "GB" } },
  };
  const html = `<div id="fcVacancyDetails"></div><a href="https://www.eploy.co.uk">Powered by Eploy</a>
    <script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const extracted = extractJobs(html, url);
  assert.equal(extracted[0]!.jobId, "3509");
  assert.equal(extracted[0]!.ats, "Eploy");
  assert.match(extracted[0]!.description, /Build software[\s\S]*Degree required[\s\S]*Pension/);
});

test("final CSV gate rejects missing IDs, title-only or script text, foreign jobs and invalid dates", () => {
  const valid = normalizeJobs([{
    jobId: "4323701", title: "Power Platform Analyst",
    description: "Build reliable reports and maintain Power Platform governance for housing teams.",
    jobUrl: "https://example.com/Jobs/Advert/4323701", postedDate: "2026-09-10",
    locations: [{ location: "Peterborough, Cambridgeshire, UK", country: "UK" }],
  }], now).rows[0]!;
  const input = { rows: [valid, { ...valid, jobId: "" }, { ...valid, description: valid.title },
    { ...valid, description: "var docsLoaded = false; The Vacancy Build reports." },
    { ...valid, country: "DE" }, { ...valid, postedDate: "2026-02-30" }],
    report: { ...report, skipped: [] as SkippedJob[], issues: [], rows: 6 } };
  const rows = outputRows(input);
  assert.equal(rows.length, 1);
  assert.deepEqual(input.report.skipped.map(item => item.reason), [
    "missing_job_id", "invalid_description", "invalid_description", "non_uk_location", "invalid_posting_date",
  ]);
  assert.equal(input.report.status, "partial");
  assert.equal(input.report.rows, 1);
});

test("final CSV gate removes nonannual and benefit pay, and deduplicates by job and location", () => {
  const base = normalizeJobs([{
    jobId: "101", title: "Care Worker", description: "Support residents with personal care and daily living.",
    jobUrl: "https://example.com/jobs/101", locations: [
      { location: "London, England, UK", city: "London", country: "UK" },
      { location: "Manchester, England, UK", city: "Manchester", country: "UK" },
    ],
  }], now).rows;
  const input = { rows: [
    { ...base[0]!, salaryRange: "£14.24 per hour" },
    { ...base[0]!, description: "Support residents with personal care, daily living and medication safely.", salaryRange: "£400" },
    { ...base[1]!, salaryRange: "£400" },
  ], report: { ...report, skipped: [] as SkippedJob[], issues: [], rows: 3, dataNotes: [] as { jobId: string; jobUrl: string; reason: string }[] } };
  const rows = outputRows(input);
  assert.equal(rows.length, 2, "two genuine job locations remain");
  assert.ok(rows.every(row => row.salaryRange === ""));
  assert.equal(rows[0]!.city, "London");
  assert.match(rows[0]!.description, /medication safely/);
  assert.equal(input.report.skipped.filter(item => item.reason === "duplicate_job").length, 1);
  assert.ok(input.report.dataNotes.some(note => /salary/i.test(note.reason)));
});

test("final CSV gate rejects a title followed only by pay or hours", () => {
  const base = normalizeJobs([{
    jobId: "4304743", title: "Care Worker - Extra Care", description: "Provide personal care to residents.",
    jobUrl: "https://example.com/Jobs/Advert/4304743", locations: [{ location: "Peterborough, UK", country: "UK" }],
  }], now).rows[0]!;
  const input = { rows: [
    { ...base, description: "Care Worker - Extra Care\n£14.24 per hour" },
    { ...base, description: "Care Worker - Extra Care\n37 hours per week" },
  ], report: { ...report, skipped: [] as SkippedJob[], issues: [] } };
  assert.deepEqual(outputRows(input), []);
  assert.equal(input.report.skipped.filter(item => item.reason === "invalid_description").length, 2);
});
