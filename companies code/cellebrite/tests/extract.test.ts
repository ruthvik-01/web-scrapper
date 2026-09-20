import assert from "node:assert/strict";
import { test } from "node:test";
import { atsBoard, enrichJob, mapAtsJobs } from "../src/ats.js";
import { detectAts, discoverLinks, extractJobs, jobsFromJson, schemaJob, schemaLocations } from "../src/extract.js";
import { normalizeJobs } from "../src/normalize.js";

const now = new Date("2026-09-15T12:00:00Z");
const url = "https://company.example/jobs/101";
const job = {
  "@context": "https://schema.org", "@type": "JobPosting",
  identifier: { "@type": "PropertyValue", value: "101" },
  title: "Engineer", description: "<p>Build systems</p>",
  url, datePosted: "2026-08-20", validThrough: "2026-10-20",
  hiringOrganization: { name: "ABC" }, employmentType: "FULL_TIME",
  baseSalary: { currency: "GBP", value: { minValue: 50000, maxValue: 75000, unitText: "YEAR" } },
  jobLocation: [
    { "@type": "Place", address: { addressLocality: "London", addressRegion: "England", addressCountry: "GB" } },
    { "@type": "Place", address: { addressLocality: "Manchester", addressRegion: "England", addressCountry: { "@type": "Country", name: "United Kingdom" } } },
  ],
};

test("nested JSON-LD graphs, type arrays, and ItemList wrappers", () => {
  const result = jobsFromJson({ "@graph": [{ "@type": "Organization" }, { itemListElement: [{ item: job }] }] }, url);
  assert.equal(result.length, 1);
  const rows = normalizeJobs(result, now).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.jobId, "101");
  assert.equal(rows[0]!.salaryRange, "£50000-£75000");
  assert.equal(jobsFromJson({ ...job, "@type": ["Thing", "https://schema.org/JobPosting"] }, url).length, 1);
});

test("malformed JSON script does not suppress valid scripts or hydration data", () => {
  const html = `<script type="application/ld+json">{broken</script>
    <script type="application/json">${JSON.stringify({ props: { job } })}</script>`;
  assert.equal(extractJobs(html, url).length, 1);
});

test("remote jobs use applicant countries, not the employer's headquarters", () => {
  const remote = { ...job, jobLocation: undefined, jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: [{ "@type": "Country", name: "United Kingdom" }, { "@type": "Country", name: "United States" }] };
  const rows = normalizeJobs([schemaJob(remote, url)], now).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.location, "UK");
  assert.equal(rows[0]!.city, "");
  assert.equal(rows[0]!.worktype, "Remote");
  assert.equal(normalizeJobs([schemaJob({ ...remote, applicantLocationRequirements: undefined }, url)], now).rows.length, 0);
});

test("microdata extraction preserves identity, publication date, and address", () => {
  const html = `<div itemscope itemtype="https://schema.org/JobPosting">
    <h1 itemprop="title">Engineer</h1><div itemprop="description">Build software</div>
    <meta itemprop="identifier" content="101"><time itemprop="datePosted" datetime="2026-08-20"></time>
    <div itemprop="hiringOrganization"><span itemprop="name">ABC</span></div>
    <div itemprop="jobLocation"><span itemprop="addressLocality">London</span>
      <meta itemprop="addressCountry" content="GB"></div></div>`;
  const rows = normalizeJobs(extractJobs(html, url), now).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.jobId, "101");
  assert.equal(rows[0]!.company, "ABC");
  assert.equal(rows[0]!.city, "London");
});

test("custom CSS selectors support non-structured pages and multiple location containers", () => {
  const html = `<h1>Engineer</h1><article>Build tools</article><time datetime="2026-08-20"></time>
    <div class="location"><span class="city">London</span>, <span class="nation">GB</span></div>
    <div class="location"><span class="city">Manchester</span>, <span class="nation">GB</span></div>`;
  const rows = normalizeJobs(extractJobs(html, url, "ABC", {
    title: "h1", description: "article", postedDate: "time", location: ".location", city: ".city", country: ".nation",
  }), now).rows;
  assert.deepEqual(rows.map(row => row.city), ["London", "Manchester"]);
});

test("career links, ATS iframes, pagination, and explicit opaque job links are discovered", () => {
  const html = `<a href="/jobs/101">Engineer</a><a href="/about">About</a>
    <a rel="next" href="?page=2">Next</a><a href="/apply">Apply</a>
    <a class="vacancy" href="/r/abcd">Engineer</a>
    <iframe src="https://jobs.ashbyhq.com/company"></iframe>`;
  const links = discoverLinks(html, "https://company.example/careers", { jobLinks: ".vacancy" });
  assert.ok(links.includes("https://company.example/jobs/101"));
  assert.ok(links.includes("https://company.example/careers?page=2"));
  assert.ok(links.includes("https://jobs.ashbyhq.com/company"));
  assert.ok(links.includes("https://company.example/r/abcd"));
  assert.ok(!links.some(link => /\/about$|\/apply$/.test(link)));
});

test("ATS detection uses hostname, not a spoofed URL path or suffix", () => {
  assert.equal(detectAts("https://company.example/greenhouse.io/jobs"), "Unknown");
  assert.equal(detectAts("https://jobs.lever.co.evil.example/demo"), "Unknown");
  assert.equal(detectAts("https://company.wd5.myworkdayjobs.com/jobs"), "Workday");
  assert.equal(atsBoard("https://jobs.eu.lever.co/demo")?.endpoint, "https://api.eu.lever.co/v0/postings/demo?mode=json");
  assert.equal(atsBoard("https://boards.greenhouse.io/embed/job_board?for=demo")?.token, "demo");
});

test("Ashby public API maps primary and secondary locations and pay", () => {
  const board = atsBoard("https://jobs.ashbyhq.com/demo")!;
  const payload = { jobs: [{
    title: "Engineer", descriptionHtml: "<p>Build tools</p>", publishedAt: "2026-08-20",
    jobUrl: "https://jobs.ashbyhq.com/demo/101", location: "London",
    address: { postalAddress: { addressLocality: "London", addressRegion: "England", addressCountry: "GBR" } },
    secondaryLocations: [
      { location: "Manchester", address: { addressLocality: "Manchester", addressRegion: "England", addressCountry: "GB" } },
      { location: "New York", address: { addressLocality: "New York", addressCountry: "USA" } },
    ],
    compensation: { scrapeableCompensationSalarySummary: "GBP 50K - 70K" },
    employmentType: "FullTime", workplaceType: "Hybrid",
  }] };
  const rows = normalizeJobs(mapAtsJobs(board, payload, "ABC"), now).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.jobId, "101");
  assert.equal(rows[0]!.salaryRange, "£50000-£70000");
  assert.equal(rows[1]!.city, "Manchester");
});

test("Greenhouse edits and Lever created timestamps are not substituted for posting dates", () => {
  const greenhouse = mapAtsJobs(atsBoard("https://boards.greenhouse.io/demo")!, {
    jobs: [{ id: 101, title: "Engineer", content: "Build", updated_at: "2026-09-15",
      absolute_url: url, location: { name: "London, UK" } }],
  });
  assert.equal(greenhouse[0]!.postedDate, "");
  assert.equal(normalizeJobs(greenhouse, now).rows.length, 1);
  assert.equal(normalizeJobs(greenhouse, now).dateFallbacks.length, 1);
  const lever = mapAtsJobs(atsBoard("https://jobs.lever.co/demo")!, [{
    id: "101", text: "Engineer", descriptionPlain: "Build", createdAt: now.valueOf(), hostedUrl: url,
    categories: { allLocations: ["London, UK", "Manchester, UK"], commitment: "Full-time" },
  }]);
  assert.equal(lever[0]!.postedDate, "");
  assert.equal(lever[0]!.locations.length, 2);
  const enriched = enrichJob(lever[0]!, schemaJob(job, url));
  assert.equal(enriched.jobId, "101");
  assert.equal(enriched.postedDate, "2026-08-20");
  assert.equal(normalizeJobs([enriched], now).rows.length, 2);
});

test("plain multi-location labels split at unambiguous separators", () => {
  assert.equal(schemaLocations("London, UK; Manchester, UK").length, 2);
  assert.equal(schemaLocations("London, Ontario, Canada").length, 1);
});
