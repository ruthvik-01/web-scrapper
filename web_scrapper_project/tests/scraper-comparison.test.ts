import test from "node:test";
import assert from "node:assert/strict";
import { compareScraperRows } from "../src/scraper-comparison.js";
import { COLUMNS, type JobRow } from "../src/normalize.js";
const row = Object.fromEntries(COLUMNS.map(field => [field, ""])) as JobRow;
Object.assign(row, { jobId: "1", jobUrl: "https://example.org/jobs/1", company: "Example", title: "Engineer" });
test("ambiguous old URL/place collisions cannot hide dropped vacancies", () => {
  const report = compareScraperRows([row, { ...row, jobId: "2", title: "Other" }], [row]);
  assert.ok(report.unexplained > 0);
});
test("approved whitespace and annual GBP formatting require equivalent content", () => {
  const policy = { normalizeDescriptionWhitespace: true, normalizeAnnualGbp: true };
  const before = { ...row, description: "Role\n\nSalary", salaryRange: "GBP 45000 - 50000 YEAR" };
  const after = { ...row, description: "Role\nSalary", salaryRange: "£45000-£50000" };
  assert.equal(compareScraperRows([before], [after], policy).unexplained, 0);
  assert.equal(compareScraperRows([before], [{ ...after, description: "Different", salaryRange: "£45000-£60000" }], policy).unexplained, 2);
});
test("comparison reports missing/new/duplicate jobs and field differences without silently accepting them", () => {
  const report = compareScraperRows([row, { ...row, jobId: "2", jobUrl: "https://example.org/jobs/2" }], [{ ...row, title: "Changed" }, { ...row, jobId: "3", jobUrl: "https://example.org/jobs/3" }]);
  assert.equal(report.unexplained, 3);
  assert.equal(report.missing.length, 1); assert.equal(report.unexpected.length, 1);
  assert.equal(report.differences[0]!.field, "title"); assert.equal(report.differences[0]!.classification, "UNKNOWN");
  assert.equal(compareScraperRows([row], [row, row]).newDuplicates.length, 1);
});
test("known old run-day date fallback is explicitly classified; arbitrary date changes are not", () => {
  const known = compareScraperRows([{ ...row, postedDate: "2026-10-05" }], [row], { runDay: "2026-10-05", sourceMissingPostedUrls: [row.jobUrl] });
  assert.equal(known.unexplained, 0); assert.equal(known.differences[0]!.classification, "OLD BUG");
  assert.equal(compareScraperRows([{ ...row, postedDate: "2026-10-01" }], [row]).unexplained, 1);
});
