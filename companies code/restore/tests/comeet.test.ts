import test from "node:test";
import assert from "node:assert/strict";
import { decodeComeet, extractComeetBoard } from "../src/comeet.js";

const url = "https://www.comeet.com/jobs/example/AA.001/";
const position = {
  uid: "12.345", name: "Engineer",
  url_comeet_hosted_page: `${url}engineer/12.345`,
  location: { name: "London, UK", country: "GB", city: "London", state: "England" },
  custom_fields: { details: [{ name: "Description", value: "<p>Build software.</p>" }] },
  time_updated: "2026-09-17T12:00:00Z", workplace_type: "Hybrid", is_internal: false,
};
function html(positions: unknown[]) {
  return `<script>unrelated()</script><script>\nCOMPANY_DATA = {"name":"Example","website":"example.com"};\nCOMPANY_POSITIONS_DATA = ${JSON.stringify(positions)};\n</script>`;
}
test("Comeet uses time_updated in postedDate per user policy and preserves identity", () => {
  const result = decodeComeet(html([position]), url);
  assert.equal(result.jobs[0]!.jobId, position.uid);
  assert.equal(result.jobs[0]!.postedDate, position.time_updated);
  assert.equal(result.jobs[0]!.worktype, "Hybrid");
  assert.match(result.jobs[0]!.description, /Build software/);
});
test("Comeet excludes explicitly fake, internal and general-interest records", () => {
  const result = decodeComeet(html([
    { ...position, is_internal: true },
    { ...position, name: "Didn't find anything that suits you?" },
    { ...position, custom_fields: { details: [{ name: "Description", value: "This is a demo environment and is not associated with a real employer." }] } },
  ]), url);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.excluded.length, 3);
});
test("Comeet distinguishes empty boards from malformed or executable data", () => {
  assert.equal(decodeComeet(html([]), url).advertised, 0);
  assert.throws(() => decodeComeet("<script>COMPANY_DATA = run();</script>", url));
  assert.throws(() => decodeComeet(html([{}]), url), /identity/);
});
test("Comeet applies UK filtering with source update dates and no fallback", async () => {
  const result = await extractComeetBoard(html([
    position, { ...position, uid: "foreign", location: { name: "New York", country: "US" } },
  ].map(job => ({ ...job, url_comeet_hosted_page: `${url}engineer/${job.uid}` }))), url, { now: new Date("2026-09-18T12:00:00Z") });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.country, "UK");
  assert.equal(result.rows[0]!.postedDate, "2026-09-17");
  assert.equal(result.report.dateFallbacks.length, 0);
  assert.equal(result.report.skipped.length, 1);
});
test("Comeet rejects old, missing and invalid update dates; keeps inclusive boundary in UK timezone", async () => {
  const result = await extractComeetBoard(html([
    { ...position, uid: "old", time_updated: "2026-07-16T12:00:00Z" },
    { ...position, uid: "boundary", time_updated: "2026-07-17T23:30:00Z" },
    { ...position, uid: "missing", time_updated: null },
    { ...position, uid: "invalid", time_updated: "not-a-date" },
  ].map(job => ({ ...job, url_comeet_hosted_page: `${url}engineer/${job.uid}` }))), url, { now: new Date("2026-09-18T12:00:00Z") });
  assert.deepEqual(result.rows.map(row => row.jobId), ["boundary"]);
  assert.equal(result.rows[0]!.postedDate, "2026-07-18");
  assert.equal(result.report.dateFallbacks.length, 0);
  assert.equal(result.report.skipped.length, 3);
});
test("Comeet audits remote booleans, preserves Hybrid, and fills only explicit employment types", () => {
  const result = decodeComeet(html([
    { ...position, uid: "hybrid", employment_type: "Full-time", location: { ...position.location, is_remote: true } },
    { ...position, uid: "remote", workplace_type: null, location: { ...position.location, is_remote: true } },
    { ...position, uid: "onsite", workplace_type: "", location: { ...position.location, is_remote: false } },
    { ...position, uid: "unknown", workplace_type: "", location: { ...position.location, is_remote: "false" } },
    { ...position, uid: "conflict", workplace_type: "Remote", location: { ...position.location, is_remote: false } },
  ]), url);
  assert.deepEqual(result.jobs.map(job => job.worktype), ["Hybrid", "Remote", "On-site", "", "Remote"]);
  assert.equal(result.jobs[0]!.employmentType, "Full-time");
  assert.equal(result.jobs[1]!.employmentType, "");
  assert.deepEqual(result.sourceFields.map(item => item.is_remote), [true, true, false, null, false]);
  assert.ok(result.jobs[4]!.notes!.some(note => note.includes("Source conflict")));
});
test("Comeet country-only remote labels do not become cities; source conflicts are disclosed", async () => {
  const result = await extractComeetBoard(html([{
    ...position, location: { name: "UK [Remote]", country: "GB" }, workplace_type: "On-site",
  }]), url, { now: new Date("2026-09-18T12:00:00Z") });
  assert.equal(result.rows[0]!.city, "");
  assert.equal(result.rows[0]!.location, "UK");
  assert.equal(result.rows[0]!.worktype, "On-site");
  assert.ok(result.rawJobs[0]!.notes!.some(note => note.includes("Source conflict")));
});
test("Comeet does not export a repeated country as a state", async () => {
  const result = await extractComeetBoard(html([{
    ...position, location: { name: "London, UK", country: "GB", city: "London", state: "United Kingdom" },
  }]), url, { now: new Date("2026-09-18T12:00:00Z") });
  assert.equal(result.rows[0]!.state, "");
  assert.equal(result.rows[0]!.location, "London, UK");
  assert.ok(result.rawJobs[0]!.notes!.some(note => note.includes("repeats the country")));
});
test("Comeet work arrangements are not cities; separate source place labels remain usable", async () => {
  const result = await extractComeetBoard(html([{
    ...position, location: { name: "London", country: "GB", city: "Remote", state: "United Kingdom" },
    workplace_type: "Remote",
  }]), url, { now: new Date("2026-09-18T12:00:00Z") });
  assert.equal(result.rows[0]!.city, "London");
  assert.equal(result.rows[0]!.state, "");
  assert.equal(result.rows[0]!.worktype, "Remote");
  assert.ok(result.rawJobs[0]!.notes!.some(note => note.includes("work arrangement")));
});
