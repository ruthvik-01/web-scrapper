import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectAtsJobs, decodeZohoJobs, detectAts, mapBambooHr, mapGreenhouse, mapJobvite,
  mapLever, mapSmartRecruiters, mapWorkdayListing, zohoJob, zohoJobUrl,
} from "../src/ats.js";

test("detectAts recognises the supported platforms and their accounts", () => {
  assert.deepEqual(detectAts("https://boards.greenhouse.io/acme/jobs/1"), { ats: "Greenhouse", slug: "acme", kind: "api" });
  assert.equal(detectAts("https://job-boards.eu.greenhouse.io/embed/?for=acme")?.slug, "acme");
  assert.deepEqual(detectAts("https://jobs.lever.co/acme"), { ats: "Lever", slug: "acme", kind: "api" });
  assert.equal(detectAts("https://jobs.ashbyhq.com/acme")?.ats, "Ashby");
  assert.equal(detectAts("https://apply.workable.com/acme/")?.ats, "Workable");
  assert.deepEqual(detectAts("https://jobs.smartrecruiters.com/AcmeCorp"), { ats: "SmartRecruiters", slug: "AcmeCorp", kind: "api" });
  assert.equal(detectAts("https://acme.bamboohr.com/careers")?.ats, "BambooHR");
  assert.equal(detectAts("https://jobs.jobvite.com/acme")?.ats, "Jobvite");
  assert.deepEqual(detectAts("https://laat.zohorecruit.eu/careers"), { ats: "Zoho Recruit", slug: "laat", kind: "embed" });
  assert.equal(detectAts("https://acme.wd3.myworkdayjobs.com/External")?.slug, "acme/External");
  assert.equal(detectAts("https://careers-acme.icims.com/jobs/search")?.ats, "iCIMS");
  assert.equal(detectAts("https://careers.hcmdirect.co.uk/vacancies")?.ats, "HCMDirect");
});

test("unknown and custom career sites stay unknown so the generic fallback runs", () => {
  assert.equal(detectAts("https://example.com/careers"), undefined);
  assert.equal(detectAts("https://www.louisvuitton.com/eng-gb/careers"), undefined);
  assert.equal(detectAts("not a url"), undefined);
});

test("platform payload mappers produce the shared normalized job shape", () => {
  const greenhouse = mapGreenhouse({
    jobs: [{ id: 1, title: "Support Worker", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", content: "<p>Care.</p>", location: { name: "Leeds, UK" } }],
  });
  assert.equal(greenhouse[0]!.ats, "Greenhouse");
  assert.equal(greenhouse[0]!.description, "Care.");
  assert.equal(greenhouse[0]!.locations[0]!.location, "Leeds, UK");

  const lever = mapLever([{
    id: "abc", text: "Engineer", hostedUrl: "https://jobs.lever.co/acme/abc",
    descriptionPlain: "Build", categories: { location: "London", commitment: "Full-time", allLocations: ["London", "Manchester"] },
    salaryRange: { currency: "GBP", min: 40000, max: 45000, interval: "per-year-salary" },
  }]);
  assert.equal(lever[0]!.locations.length, 2);
  assert.equal(lever[0]!.employmentType, "Full-time");
  assert.match(lever[0]!.salaryText!, /40000/);

  const smart = mapSmartRecruiters({
    totalFound: 2,
    content: [{ id: "744000", name: "Nurse", location: { city: "Bristol", country: "uk" }, releasedDate: "2026-09-01" }],
  }, "AcmeCorp");
  assert.equal(smart.total, 2);
  assert.equal(smart.jobs[0]!.jobUrl, "https://jobs.smartrecruiters.com/AcmeCorp/744000");
  assert.equal(smart.jobs[0]!.locationText, "Bristol");
  // The listing has no advert body, so the job page is fetched per job later.
  assert.equal(smart.jobs[0]!.description, "");

  const workday = mapWorkdayListing({
    total: 1, jobPostings: [{ title: "Carer", externalPath: "/job/Carer_R-1", locationsText: "Glasgow, UK", bulletFields: ["R-1"], postedOn: "Posted Today" }],
  }, "https://acme.wd3.myworkdayjobs.com");
  assert.equal(workday.jobs[0]!.jobUrl, "https://acme.wd3.myworkdayjobs.com/job/Carer_R-1");
  assert.equal(workday.jobs[0]!.postedDate, "", "a relative posted label must not become a date");

  const bamboo = mapBambooHr({ result: [{ id: "9", jobOpeningName: "Chef", location: { city: "Cardiff" }, dateOpened: "2026-08-30" }] }, "acme");
  assert.equal(bamboo[0]!.jobUrl, "https://acme.bamboohr.com/careers/9");

  const jobvite = mapJobvite({ jobs: [{ id: "j7", title: "Driver", location: "York", date: "2026-08-28" }] }, "acme");
  assert.equal(jobvite[0]!.ats, "Jobvite");
  assert.equal(jobvite[0]!.postedDate, "2026-08-28");
});

test("Zoho Recruit embedded payloads decode from both published forms", () => {
  const records = [{ id: "1212", Posting_Title: "Teacher of Maths", City: "Leicester", Country: "United Kingdom", Date_Opened: "2026-09-01", Job_Description: "<p>Teach maths</p>" }];
  const hidden = `<input type="hidden" id="jobs" value='${JSON.stringify(records).replace(/"/g, "&quot;")}'>`;
  assert.equal(decodeZohoJobs(hidden).length, 1);
  const literal = `<script>var jobs = JSON.parse('${JSON.stringify(records)}');</script>`;
  assert.equal(decodeZohoJobs(literal)[0]!.Posting_Title, "Teacher of Maths");
  assert.throws(() => decodeZohoJobs("<html>no payload</html>"), /No supported Zoho Recruit public job payload/);
});

test("Zoho Recruit records normalize and keep their public detail URL", () => {
  const record = {
    id: "5039", Posting_Title: "Teacher of Maths", Date_Opened: "2026-09-10", City: "Leicester",
    State: "Leicestershire", Country: "United Kingdom", Job_Description: "<p>Teach maths.</p>",
    Requirements: "QTS", Salary: "£30,000 - £42,000", Job_Type: "Full-time", Remote_Job: false,
  };
  const job = zohoJob(record, zohoJobUrl("https://laat.zohorecruit.eu/careers", record));
  assert.equal(job.jobId, "5039");
  assert.equal(job.ats, "Zoho Recruit");
  assert.match(job.description, /QTS/);
  assert.match(job.jobUrl, /\/careers\/5039\/Teacher-of-Maths\?source=CareerSite$/);
  assert.equal(job.salaryText, "£30,000 - £42,000");
  assert.equal(job.locationText, "Leicester, Leicestershire, United Kingdom");
});

test("platforms without an adapter report a reason instead of failing silently", async () => {
  const http = { json: async () => ({ body: {} }), html: async () => ({ url: "", body: "" }) } as never;
  await assert.rejects(
    () => collectAtsJobs({ ats: "iCIMS", slug: "careers-acme", kind: "label" }, "https://careers-acme.icims.com/jobs", http, () => {}),
    /No iCIMS adapter is available; using the generic strategies\./,
  );
});
