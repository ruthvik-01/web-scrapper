import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeScrapeResult, mergeJobLocations } from "../src/final-dataset.js";
import type { OutputRow } from "../src/output.js";

const row = { jobId: "22433", title: "FM Consultant", company: "Currie & Brown", description: "Manage facilities and advise clients.", jobUrl: "https://example.com/vacancies/22433/fm.html", postedDate: "", jdDeadline: "", salaryRange: "", employmentType: "", ats: "Eploy", worktype: "", country: "UK", location: "Edinburgh, City of Edinburgh, UK", city: "Edinburgh", state: "City of Edinburgh" } satisfies OutputRow;
test("final delivery keeps both job locations without repeating its ID or URL", () => {
  const result = mergeJobLocations([row, { ...row, city: "Glasgow", state: "Glasgow City", location: "Glasgow, Glasgow City, UK" }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.city, "Edinburgh; Glasgow");
  assert.match(result.rows[0]!.location, /Edinburgh.*Glasgow/);
  assert.equal(result.merges[0]!.locations.length, 2);
});
test("conflicting vacancy content cannot be silently collapsed", () => {
  assert.throws(() => mergeJobLocations([row, { ...row, salaryRange: "£40000" }]), /Conflicting.*salaryRange/);
});

test("dashboard finalization uses the delivery pipeline and records its quality checks", () => {
  const result = finalizeScrapeResult({
    rows: [],
    rawJobs: [{
      jobId: "22433", title: "FM Consultant", description: "Advise clients and manage facilities.",
      jobUrl: "https://example.com/vacancies/22433/fm.html", postedDate: "2026-09-01",
      company: "Currie & Brown", salaryRange: "£400 gym benefit", locations: [
        { location: "Edinburgh, City of Edinburgh, UK", city: "Edinburgh", state: "City of Edinburgh", country: "UK" },
        { location: "Glasgow, Glasgow City, UK", city: "Glasgow", state: "Glasgow City", country: "UK" },
      ], ats: "Eploy",
    }],
    report: {
      process: "STATIC", status: "ok", candidates: 1, window: { from: "2026-07-01", to: "2026-09-30" },
      skipped: [], issues: [], limited: false, rows: 0, dataNotes: [], dateFallbacks: [],
    },
  }, "Currie & Brown", new Date("2026-09-30T12:00:00Z"));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.jobId, "22433");
  assert.equal(result.rows[0]!.city, "Edinburgh; Glasgow");
  assert.equal(result.rows[0]!.salaryRange, "");
  assert.equal(result.quality.duplicateJobIds, 0);
  assert.equal(result.quality.duplicateJobUrls, 0);
  assert.equal(result.quality.salaryBenefits, 0);
  assert.deepEqual(result.report.deliveryLocationMerges, [{ jobId: "22433", locations: ["Edinburgh, City of Edinburgh, UK", "Glasgow, Glasgow City, UK"] }]);
});

test("dashboard finalization blocks CSV when distinct adverts reuse a job ID", () => {
  const source = {
    rows: [],
    rawJobs: [
      { jobId: "same-id", title: "Engineer One", description: "Build and maintain software for clients.", jobUrl: "https://example.com/jobs/one", postedDate: "2026-09-01", company: "Example", locations: [{ location: "London, England, UK", city: "London", state: "England", country: "UK" }] },
      { jobId: "same-id", title: "Engineer Two", description: "Design and test software for customers.", jobUrl: "https://example.com/jobs/two", postedDate: "2026-09-02", company: "Example", locations: [{ location: "Leeds, England, UK", city: "Leeds", state: "England", country: "UK" }] },
    ],
    report: { process: "STATIC", status: "ok", candidates: 2, window: { from: "2026-07-30", to: "2026-09-30" }, skipped: [], issues: [], limited: false },
  };
  const result = finalizeScrapeResult(source, "Example", new Date("2026-09-30T12:00:00Z"));
  assert.equal(result.quality.duplicateJobIds, 1);
  assert.equal(result.report.qualityPassed, false);
  assert.equal(result.report.exportReady, false);
});
