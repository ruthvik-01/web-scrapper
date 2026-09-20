import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJobs } from "../src/extract.js";
import { normalizeJobs } from "../src/normalize.js";

const now = new Date("2026-09-17T12:00:00Z");
test("Clulow-style Eploy detail without footer extracts; explicit UK evidence alone changes eligibility", () => {
  const html = `<h1 id="ctl_top_h1JobTitle">Optometrist</h1>
    <span id="ctl_top_fcVacancyDetails_VacV_LocationID">Guildford</span>
    <div id="ctl_main_fcVacancyDetailsDescription_VacV_Description">Provide optical care.</div>`;
  const jobs = extractJobs(html, "https://example.com/vacancies/33975/optometrist.html", "David Clulow Opticians");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.jobId, "33975");
  assert.deepEqual(normalizeJobs(jobs, now).skipped.map(s => s.reason), ["no_confirmed_uk_location"]);
  const synthetic = { ...jobs[0]!, locations: [{city:"Guildford",state:"Surrey",country:"UK"}] };
  const result = normalizeJobs([synthetic], now);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.location, "Guildford, Surrey, UK");
  assert.equal(result.rows[0]!.postedDate, "2026-09-17");
  assert.equal(result.dateFallbacks.length, 1);
  assert.equal(result.skipped.length, 0);
});
test("salary qualifiers in the role and hourly shorthand are respected without treating bonuses as ranges", () => {
  const base = {title:"Role",description:"Work",jobUrl:"https://example.com/job/pay",locations:[{country:"UK"}]};
  for (const salaryRange of ["£13.10ph", "£15 p.h.", "£13.12ph (up to £15.12 including tronc)"]) {
    const row = normalizeJobs([{...base,salaryRange}],now).rows[0]!;
    assert.equal(row.salaryRange, "");
    assert.ok(row.description.includes(salaryRange));
  }
  assert.equal(normalizeJobs([{...base,salaryRange:"41201.09 - 52972.83",
    roleDescription:"Role: Developer\nSalary: £41,201.09 - £52,972.83 (DOE)"}],now).rows[0]!.salaryRange,"");
  for (const [source, expected] of [
    ["£38,149.53 per year plus quarterly bonus up to £500", "£38149.53"],
    ["£30000, 40 hours per week", "£30000"],
    ["40 hours, £30000 per annum", "£30000"],
    ["£30k – £35k plus £500 bonus", "£30000-£35000"],
  ]) assert.equal(normalizeJobs([{...base,salaryRange:source}],now).rows[0]!.salaryRange,expected);
  assert.equal(normalizeJobs([{...base,roleDescription:"Salary: Realistic OTE of £35,000, Pro-Rata"}],now).rows[0]!.salaryRange,"£35000");
});
test("deadline prevents fallback and salary follows the export contract", () => {
  const base = {title:"Role",description:"Work",jobUrl:"https://example.com/job/1",locations:[{country:"UK"}],jdDeadline:"2026-10-01"};
  const r = normalizeJobs([{...base,salaryRange:"£9,798.88 - £12,000 per annum"}],now);
  assert.equal(r.rows[0]!.postedDate, "");
  assert.equal(r.rows[0]!.salaryRange, "£9798.88-£12000");
  assert.equal(r.dateFallbacks.length, 0);
  for(const pay of ["£12.71 per hour", "d.o.e", "Depending on experience"]){
    const row=normalizeJobs([{...base,salaryRange:pay}],now).rows[0]!;
    assert.equal(row.salaryRange, ""); assert.ok(row.description.includes(pay));
  }
});
