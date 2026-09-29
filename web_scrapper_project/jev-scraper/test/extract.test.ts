import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHeuristic } from "../src/extract.js";

test("heuristic extraction keeps source IDs embedded in supported vacancy URLs", () => {
  const html = `<main><h1>Cleaner</h1><div class="job-description">Clean the site.</div></main>`;
  assert.equal(extractHeuristic(html, "https://careers.example/vacancies/20358/cleaner.html").jobId, "20358");
  assert.equal(extractHeuristic(html, "https://example/jobs/external_job/sen-teaching-assistant-1740/").jobId, "1740");
  assert.equal(extractHeuristic(html, "https://example/careers/33778/index5/financial-adviser-709815").jobId, "709815");
});

test("heuristic extraction reads Exchange Street labelled city and county", () => {
  const html = `<main>
    <h1>Compliance File Reviewer</h1>
    <div class="job-description">Review compliance files.</div>
    <dl><dt>Town/City:</dt><dd>Newcastle</dd><dt>County:</dt><dd>Tyne and Wear</dd><dt>Job ref:</dt><dd>710195</dd></dl>
  </main>`;
  const job = extractHeuristic(html, "https://example/careers/33784/index0/compliance-file-reviewer-710195");
  assert.equal(job.jobId, "710195");
  assert.deepEqual(job.locations, [{ location: "Newcastle, Tyne and Wear", city: "Newcastle", state: "Tyne and Wear" }]);
});

test("heuristic extraction reads Long Term Futures job content and visible place", () => {
  const html = `<main><section class="job-hero">
    <p>Posted 17 hours ago</p><h3>SEN Teaching Assistant</h3>
    <div class="flex"><p><span>£110 Per Day</span></p><p>Hammersmith and Fulham</p></div>
  </section><section class="job-content"><div class="wysiwyg">Support pupils across Key Stage 1 and Key Stage 2.</div></section></main>`;
  const job = extractHeuristic(html, "https://example/external_job/sen-teaching-assistant-1740/");
  assert.equal(job.jobId, "1740");
  assert.equal(job.title, "SEN Teaching Assistant");
  assert.equal(job.description, "Support pupils across Key Stage 1 and Key Stage 2.");
  assert.deepEqual(job.locations, [{ location: "Hammersmith and Fulham" }]);
});
