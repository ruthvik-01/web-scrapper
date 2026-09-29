import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeZohoJobs, zohoJob } from "../src/zoho.js";

test("Zoho hidden JSON and escaped JavaScript payloads are decoded without execution", () => {
  const value = [{ id: "1", Posting_Title: "Student's assistant", Job_Description: "<p>Hello</p>" }];
  const json = JSON.stringify(value);
  const hidden = json.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  assert.deepEqual(decodeZohoJobs(`<input id="jobs" value="${hidden}">`), value);
  const literal = json.replace(/\\/g, "\\\\").replace(/"/g, "\\x22").replace(/'/g, "\\'");
  assert.deepEqual(decodeZohoJobs(`var jobs = JSON.parse('${literal}');`), value);
  assert.throws(() => decodeZohoJobs("var jobs = runCode();"));
  assert.throws(() => decodeZohoJobs('<input id="jobs" value="{}">'));
});

test("Zoho maps full detail sections, ISO dates and supplied employment without false on-site inference", () => {
  const job = zohoJob({
    id: "2", Posting_Title: "Assistant", Date_Opened: "2026-08-12",
    Job_Description: "<p>Main duties</p>", Requirements: "<p>Skills</p>", Benefits: "Pension",
    Remote_Job: false, Job_Type: "Full time", City: "London", State: "Tower Hamlets",
    Country: "United Kingdom", Salary: "TBC", Zip_Code: "E1W 1AW",
  }, "https://example.test/job/2", "LAAT");
  assert.equal(job.postedDate, "2026-08-12");
  assert.equal(job.employmentType, "Full time");
  assert.equal(job.worktype, "");
  assert.equal(job.jdDeadline, "");
  assert.match(job.description, /Main duties[\s\S]*Requirements\nSkills[\s\S]*Benefits\nPension/);
  assert.equal(job.locations[0]?.postcode, "E1W 1AW");
});
