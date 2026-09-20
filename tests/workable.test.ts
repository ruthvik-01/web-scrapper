import assert from "node:assert/strict";
import { test } from "node:test";
import { atsBoard, mapAtsJobs } from "../src/ats.js";

test("Workable board uses its public widget endpoint, not detail/application paths", () => {
  const board = atsBoard("https://apply.workable.com/somerce/");
  assert.equal(board?.endpoint, "https://www.workable.com/api/accounts/somerce?details=true");
  assert.equal(atsBoard("https://apply.workable.com/j/123/apply"), undefined);
  assert.equal(atsBoard("https://apply.workable.com.example.test/somerce/"), undefined);
});

test("Workable preserves publication date, full descriptions and explicit UK geography", () => {
  const board = atsBoard("https://apply.workable.com/example/")!;
  const [job] = mapAtsJobs(board, { name: "Example", jobs: [{
    shortcode: "123", title: "Engineer", url: "https://apply.workable.com/j/123",
    description: "<p>Full job details</p>", published_on: "2026-08-20", created_at: "2025-01-01",
    employment_type: "Full-time", telecommuting: false,
    locations: [{ country: "United Kingdom", countryCode: "GB", city: "London", region: "England" }],
  }] });
  assert.equal(job?.jobId, "123");
  assert.equal(job?.postedDate, "2026-08-20");
  assert.equal(job?.description, "Full job details");
  assert.equal(job?.employmentType, "Full-time");
  assert.equal(job?.worktype, "");
  assert.equal(job?.locations[0]?.country, "GB");
});
