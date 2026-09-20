import assert from "node:assert/strict";
import { test } from "node:test";
import { OUTPUT_COLUMNS, outputCsv, outputRows } from "../src/output.js";
import { normalizeJobs } from "../src/normalize.js";
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
  assert.equal(outputRows({ rows: [{ ...rows[0]!, ats: "Eploy" }], report })[0]!.ats, "Custom");
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

test("inferred posting dates stay in the report without adding a sixteenth column", () => {
  const result = normalizeJobs([{
    jobId: "missing", title: "Engineer", description: "Build",
    jobUrl: "https://example.com/jobs/missing", locations: [{ city: "London", country: "GB" }],
  }], now);
  const rows = outputRows({ rows: result.rows, report });
  assert.equal(rows[0]!.postedDate, "2026-09-15");
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
  assert.equal(extracted[0]!.ats, "Eploy"); // Raw detection is retained; exported rows report Custom.
  assert.match(extracted[0]!.description, /Build software[\s\S]*Degree required[\s\S]*Pension/);
});
