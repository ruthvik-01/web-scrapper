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

test("explicit detail-page location labels plus a UK postcode in the job URL recover missing structured location", () => {
  const advert = "https://careers.example/dachser_europe/job/Northampton-HR-Officer-NN4-7HT/1369478355/";
  const posting = {
    "@type": "JobPosting", identifier: "1369478355", title: "HR Officer",
    description: "Purpose of the role: Support the UK HR team.\n\nLocation: Northampton\n\nResponsibilities: Advise managers and employees.",
    url: advert, datePosted: "Thu Sep 24 00:00:00 UTC 2026", hiringOrganization: { name: "Dachser" },
  };
  const [extracted] = extractJobs(`<script type="application/ld+json">${JSON.stringify(posting)}</script>`, advert, "Dachser");
  assert.deepEqual(extracted?.locations, [{ location: "Northampton", city: "Northampton", country: "UK", postcode: "NN4 7HT" }]);
  const normalized = normalizeJobs(extracted ? [extracted] : [], new Date("2026-09-30T12:00:00Z"));
  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0]?.country, "UK");
  assert.equal(normalized.rows[0]?.postedDate, "2026-09-24");
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

test("current-vacancies detail uses only the role section when schema description is a title", () => {
  const advert = "https://crosskeyshomes.current-vacancies.com/Jobs/Advert/4323701?cid=2041";
  const html = `<h1>Power Platform Analyst</h1>
    <div id="MergeCore_MergeField1">Salary £47,902 (in probation) rising to £50,423</div>
    <script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", identifier: "2041", title: "Power Platform Analyst",
      description: "Power Platform Analyst", url: advert, datePosted: "2026-09-22",
      baseSalary: { currency: "GBP", value: { minValue: 47902, maxValue: 50423, unitText: "HOUR" } },
      jobLocation: { address: { addressLocality: "Peterborough", addressCountry: "GB" } },
    })}</script>
    <div class="col-12 mt-0"><div id="GlobalContent_HeaderTitle1">The Vacancy</div>
      <div class="container PLACEHOLDER"><p>Build reliable Power BI reports for housing teams.</p>
      <p>Maintain Power Platform governance and improve data quality.</p></div>
      <script>var docsLoaded = false; window.fake = "navigation garbage";</script>
      <div id="GlobalContent_HeaderTitle2">The Company</div>
      <div class="container">This unrelated company biography must not enter the job description.</div></div>`;
  const [result] = extractJobs(html, advert, "Cross Keys Homes");
  assert.equal(result?.jobId, "4323701");
  assert.equal(result?.postedDate, "2026-09-22");
  assert.match(result?.description || "", /Build reliable Power BI reports/);
  assert.match(result?.description || "", /Maintain Power Platform governance/);
  assert.doesNotMatch(result?.description || "", /docsLoaded|company biography|navigation garbage/);
  assert.match(result?.salaryRange || "", /per annum/);
  assert.match(result?.salaryRange || "", /47,902.*50,423/);
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

test("WordPress career detail pages extract visible role fields without treating the slug suffix as an ID", () => {
  const detailUrl = "https://www.northwood.co.uk/career/oldham-production-operative-2/";
  const html = `<header><span>Location Product Finder</span><ul><li>Product Finder</li></ul></header><main><h1>Oldham Production Operative</h1>
    <ul><li>Oldham</li><li>Applications close October 2, 2026</li></ul>
    <h2>Job Description</h2><p>As a Production Operative you’ll run machinery safely and efficiently.</p>
    <p>The main focus of this role is safety, teamwork and working to high standards.</p>
    <h3>Production Operative Duties</h3><ul><li>Operating and monitoring machinery.</li></ul>
    <h2>Job Requirements</h2><p>Good communication and teamwork skills.</p>
    <h2>Submit Application</h2><form><input name="email"></form></main>
    <footer><p>Northwood House, Stafford Park 10, Telford</p></footer>`;
  const extracted = extractJobs(html, detailUrl, "Northwood Hygiene Products Ltd");
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0]!.title, "Oldham Production Operative");
  assert.equal(extracted[0]!.jobUrl, detailUrl);
  assert.equal(extracted[0]!.jobId, "");
  assert.equal(extracted[0]!.locations[0]?.location, "Oldham");
  assert.equal(extracted[0]!.jdDeadline, "October 2, 2026");
  assert.match(extracted[0]!.description, /Operating and monitoring machinery/);
  assert.doesNotMatch(extracted[0]!.description, /Submit Application|Northwood House|email/);
});

test("literal click destinations on career cards are discovered without running page scripts", () => {
  const html = `<section><h2>Current Vacancies</h2>
    <div onclick="window.location.href='/career/oldham-production-operative-2/'">
      <h3>Oldham Production Operative</h3><p>Oldham</p></div></section>`;
  assert.deepEqual(discoverLinks(html, "https://www.northwood.co.uk/careers/"), [
    "https://www.northwood.co.uk/career/oldham-production-operative-2/",
  ]);
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

test("search facets and location taxonomies do not expand a job crawl", () => {
  const source = "https://www.crowleycox.co.uk/search";
  const html = `<a href="/job/accounts-assistant-london/277">Accounts Assistant</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=https://www.crowleycox.co.uk/job/accounts-assistant-london/277">Share</a>
    <a href="/modules/fabricruitment/lists/jobs/search?filters%5Bfacets.location%5D%5B1%5D=London&page=1">London filter</a>
    <a href="/jobs/location/london-london">London jobs</a>
    <a href="/search?filters%5Bfacets.location%5D%5B1%5D=London&page=1">London (2)</a>
    <a rel="next" href="/search?page=2">Next</a>`;
  assert.deepEqual(discoverLinks(html, source), [
    "https://www.crowleycox.co.uk/job/accounts-assistant-london/277",
    "https://www.crowleycox.co.uk/search?page=2",
  ]);
});
