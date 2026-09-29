import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJobApi } from "../src/api.js";
import { extractJobs, schemaJob } from "../src/extract.js";
import { Geography } from "../src/geography.js";

test("REST decoder requires real detail fields and preserves explicit country/date", () => {
  const decoded = decodeJobApi({ jobs: [
    { id: "7", title: "Engineer", description: "Build systems", url: "/jobs/7",
      postedDate: "2026-09-01", locations: [{ city: "London", country: "GB" }] },
    { title: "Incomplete card", url: "/jobs/8" },
  ], links: { next: "/api?page=2" } }, "https://example.com/api", "Example");
  assert.equal(decoded.jobs.length, 1);
  assert.equal(decoded.jobs[0]!.locations[0]!.country, "GB");
  assert.equal(decoded.jobs[0]!.postedDate, "2026-09-01");
  assert.equal(decoded.nextUrl, "https://example.com/api?page=2");
  assert.equal(decodeJobApi({ jobs: [], next: 2 }, "https://example.com/api").unsupportedPagination, true);
});

test("Eploy without JSON-LD extracts primary details, not suggested jobs or listing cards", () => {
  const html = `<a href="https://eploy.co.uk">Eploy</a>
    <h1 id="top_h1JobTitle">Support Worker</h1>
    <div id="main_fcVacancyDetails_VacV_Town">Bristol</div>
    <div id="main_fcVacancyDetails_VacV_VacancyTypeID">Permanent</div>
    <div id="main_fcVacancyDetails_VacV_DisplaySalary">£25,000</div>
    <div id="main_VacV_Description">Help people.</div>
    <div id="main_VacV_Qualifications">Training provided.</div>
    <div id="main_VacV_Benefits">Pension.</div>
    <div data-id="div_content_VacV_AdvertisingEndDate">30 Sep 2026</div>
    <div id="related_fcVacancyDetails_VacV_Town">Wrong city</div>`;
  const jobs = extractJobs(html, "https://example.com/vacancies/123/worker.html", "Example");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.jobId, "123");
  assert.equal(jobs[0]!.visibleLocation, "Bristol");
  assert.equal(jobs[0]!.employmentType, "Permanent");
  assert.equal(jobs[0]!.jdDeadline, "30 Sep 2026");
  assert.match(jobs[0]!.description, /Help people[\s\S]*Training provided[\s\S]*Pension/);
  assert.ok(!jobs[0]!.locations[0]!.country); // Never infer UK from a city alone.
  assert.equal(extractJobs(html, "https://example.com/vacancies/", "Example").length, 0);
});

test("PropertyValue uses vacancy value rather than employer name and decodes title entities", () => {
  const job = schemaJob({
    title: "Content &amp; Media", identifier: { name: "Employer", value: "8366636" },
  }, "https://example.com/jobs/8366636");
  assert.equal(job.jobId, "8366636");
  assert.equal(job.title, "Content & Media");
});

test("UK eligibility evidence must be job-specific and must not override foreign countries", async () => {
  const raw = {
    title: "Worker", description: "Help people", jobUrl: "https://example.com/jobs/1",
    ats: "Eploy", visibleLocation: "London", locations: [{ city: "London", country: "" }],
    roleDescription: "Applicants must therefore have the right to work in the UK without sponsorship.",
  };
  const geo = new Geography(async () => ({ result: [] }));
  const resolved = await geo.resolve(raw);
  assert.equal(resolved.locations[0]!.country, "UK");
  assert.ok(resolved.notes?.some(note => /eligibility/.test(note)));
  const foreign = await geo.resolve({ ...raw, locations: [{ city: "London", country: "Canada" }] });
  assert.equal(foreign.locations[0]!.country, "Canada");
  const negated = await geo.resolve({ ...raw, roleDescription: "You do not need to have the right to work in the UK." });
  assert.ok(!negated.locations[0]!.country);
});

test("reprocessing inferred city/state cannot turn an unconfirmed country into UK", async () => {
  const geo = new Geography(async () => ({ result: [{
    name_1: "London", local_type: "City", country: "England",
    county_unitary: "Greater London",
  }] }));
  const raw = {
    title: "Worker", description: "Help people", jobUrl: "https://example.com/jobs/1",
    ats: "Eploy", visibleLocation: "London", locations: [{ city: "London", country: "" }],
  };
  const first = await geo.resolve(raw);
  assert.ok(!first.locations[0]!.country);
  const second = await geo.resolve(first);
  assert.ok(!second.locations[0]!.country);
});
