import assert from "node:assert/strict";
import { test } from "node:test";
import { extractNhsAdvert } from "../src/nhs.js";

test("NHS adverts preserve complete sections and distinguish job addresses from employer contacts", () => {
  const html = `<span id="employer_name">Trust</span><h1 id="heading">Nurse</h1>
    <p id="closing_date">The closing date is 30 September 2026</p>
    <section><h2>Summary</h2><p id="job_description"></p><p>Clinical duties</p></section>
    <div><p id="job_description_large"></p><p>Full responsibilities</p></div>
    <div><h3 id="skill_category_1">Qualifications</h3><p>Registration needed</p></div>
    <div><p id="date_posted">10 September 2026</p><p id="range_salary">£30000 per annum</p>
      <p id="contract_type">Permanent</p><h3 id="working_pattern_heading">Working pattern</h3><p>Part time</p>
      <h3>Job locations</h3>
      <p id="employer_town">Sutton</p><p id="employer_county">Surrey</p><p id="employer_postcode">SM1 4DP</p><p id="employer_country">United Kingdom</p>
      <p id="employer_town_1">London</p><p id="employer_county_1">London</p><p id="employer_country_1">United Kingdom</p>
    </div>
    <section><p id="employer_town_c">Unrelated HQ</p><p id="employer_country_f">Canada</p></section>`;
  const [job] = extractNhsAdvert(html, "https://www.jobs.nhs.uk/candidate/jobadvert/A2700-26-0040?query=tracking");
  assert.equal(job?.jobId, "A2700-26-0040");
  assert.equal(job?.jdDeadline, "30 September 2026");
  assert.equal(job?.employmentType, "Part time");
  assert.match(job!.description, /Clinical duties[\s\S]*Full responsibilities[\s\S]*Registration needed/);
  assert.equal(job?.locations.length, 2);
  assert.equal(job?.locations[0]?.city, "Sutton");
  assert.equal(job?.locations[1]?.city, "London");
  assert.ok(!job?.description.includes("Unrelated HQ"));
  assert.equal(extractNhsAdvert(html, "https://jobs.nhs.uk.example.com/candidate/jobadvert/1").length, 0);
});
