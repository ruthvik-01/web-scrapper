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

test("multiple postings without source IDs do not inherit one listing-page ID", () => {
  const listing = "https://company.example/search/897";
  const postings = [
    { ...job, identifier: undefined, url: undefined, title: "First role" },
    { ...job, identifier: undefined, url: undefined, title: "Second role" },
  ];
  assert.deepEqual(jobsFromJson(postings, listing).map(item => item.jobId), ["", ""]);
  assert.deepEqual(jobsFromJson(postings.map((item, i) => ({ ...item, url: `https://company.example/job/role/${1001 + i}/` })), listing)
    .map(item => item.jobId), ["1001", "1002"]);
});

test("vacancy detail URLs override a shared company ID and supply missing IDs", () => {
  const advert = "https://example.current-vacancies.com/Jobs/Advert/4323701?cid=2041";
  const first = extractJobs(`<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", identifier: "2041", title: "Analyst", description: "Build systems",
    url: advert, jobLocation: { address: { addressCountry: "GB" } },
  })}</script>`, advert);
  assert.equal(first[0]!.jobId, "4323701");
  const vacancy = "https://example.co.uk/vacancy/ea-fluent-french-56045/";
  const second = extractJobs(`<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", title: "Assistant", description: "Support teams", url: vacancy,
    jobLocation: { address: { addressCountry: "GB" } },
  })}</script>`, vacancy);
  assert.equal(second[0]!.jobId, "56045");
});

test("an unstructured position detail keeps its URL reference and isolates its role text", () => {
  const detailUrl = "https://company.example/careers/positions/dYZUhyQ0Pc7yrmUzmtUeK8";
  const html = `<aside id="position-info-box"><h3>Assistant Buyer</h3><div class="panel-body">
    <p><strong>Location</strong>: Altrincham - Neptune House</p>
    <p><strong>Closing Date</strong>: 30 September 2026</p></div>
    <a href="/careers/positions/related">Related Position</a></aside>
    <main><div class="panel-body"><h1 class="job-title">Assistant Buyer</h1><div><div class="WordSection1">
    <h2>Altrincham, WA14 5GZ</h2><p>We are looking for an experienced buyer to manage stock and suppliers.</p>
    </div></div><a href="/apply">Apply now</a></div></main>`;
  const extracted = extractJobs(html, detailUrl, "Cotton Traders");
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]!.jobId, "dYZUhyQ0Pc7yrmUzmtUeK8");
  assert.equal(extracted[0]!.title, "Assistant Buyer");
  assert.match(extracted[0]!.description || "", /manage stock and suppliers/);
  assert.doesNotMatch(extracted[0]!.description || "", /Related Position|Apply now/);
  assert.equal(extracted[0]!.locations[0]?.location, "Altrincham - Neptune House");
  assert.equal(extracted[0]!.locations[0]?.city, "Altrincham");
  assert.equal(extracted[0]!.locations[0]?.postcode, "WA14 5GZ");
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

test("navigation and quoted widget fragments are not scheduled as job pages", () => {
  const html = `<nav><a href="/?post_type=industry&amp;p=4848">Marketing Recruitment</a>
    <a href="/industry/business-support/">Recruitment</a></nav>
    <a href='"https://example.co.uk/search-jobs/?page=2"'>Broken widget link</a>
    <a href="/search-jobs/?page=2" rel="next">Next</a>
    <a href="/vacancy/legal-secretary-55973/">Legal Secretary</a>`;
  assert.deepEqual(discoverLinks(html, "https://example.co.uk/search-jobs/").sort(), [
    "https://example.co.uk/search-jobs/?page=2",
    "https://example.co.uk/vacancy/legal-secretary-55973/",
  ]);
});

test("filtered listing discovery stays inside the selected search", () => {
  const listing = "https://careers.dachser.com/search/?locationsearch=uk&searchby=location";
  const html = `<a href="/search/">All jobs</a>
    <a href="/search/?startrow=39">2</a>
    <a rel="next" href="?locationsearch=uk&searchby=location&startrow=39">Next</a>
    <a href="www.careers.dachser.com/search/?startrow=78">3</a>
    <a href="/job/Northampton/1362706355/">Customer Service Apprentice</a>`;
  assert.deepEqual(discoverLinks(html, listing).sort(), [
    "https://careers.dachser.com/job/Northampton/1362706355/",
    "https://careers.dachser.com/search/?locationsearch=uk&searchby=location&startrow=39",
  ].sort());
});

test("targeted job links do not escape through a page-wide JSON feed", () => {
  const html = `<a class="vacancy" href="/jobs/one">One</a>
    <a rel="next" href="?page=2">Next</a>
    <link rel="alternate" type="application/json" href="/all-jobs.json">`;
  const links = discoverLinks(html, "https://company.example/careers", { jobLinksOnly: "a.vacancy" });
  assert.deepEqual(links, ["https://company.example/careers?page=2", "https://company.example/jobs/one"]);
});

test("ATS detection uses hostname, not a spoofed URL path or suffix", () => {
  assert.equal(detectAts("https://beta.jobs.nhs.uk/candidate/jobadvert/1"), "NHS Jobs");
  assert.equal(detectAts("https://jobs.nhs.uk.example.com/job/1"), "Unknown");
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
  assert.equal(rows[0]!.salaryRange, "", "The API does not state this range is annual.");
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
