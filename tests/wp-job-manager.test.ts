import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { extractEwDetail, scrapeEwJobManager } from "../src/wp-job-manager.js";
import { Geography } from "../src/geography.js";

test("EW details use role metadata, publication date and county corroboration, not related jobs", async () => {
  const [job] = extractEwDetail(`<body class="postid-12"><h1>Engineer</h1>
    <div class="single_job_listing"><ul class="job-listing-meta">
    <li class="location">Chesham, Buckinghamshire</li><li class="job-type">Full Time</li>
    <li class="date-posted"><time datetime="2026-09-16">2 days ago</time></li></ul>
    <div class="job_description"><p>Role duties</p></div><form>Upload CV</form></div>
    <div class="relatedjobs">Unrelated job</div></body>`, "https://example.test/job/12", "EW");
  assert.equal(job!.description, "Role duties");
  assert.equal(job!.postedDate, "2026-09-16");
  assert.equal(job!.locations[0]!.country, undefined);
  const geo = new Geography(async url => ({ result: new URL(url).searchParams.get("q") === "Chesham" ?
    [{ name_1: "Chesham", local_type: "Town", county_unitary: "Buckinghamshire", country: "England" }] : [] }));
  assert.equal((await geo.resolve(job!)).locations[0]!.country, "UK");
  const uncorroborated = await new Geography(async () => ({ result: [] })).resolve(job!);
  assert.equal(uncorroborated.locations[0]!.country, "");
});

test("WP listings traverse pages, deduplicate details and preserve failed details as partial", async () => {
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url!);
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    if (req.url === "/jm-ajax/get_listings/") {
      assert.equal(req.method, "POST");
      let body = "";
      for await (const chunk of req) body += chunk;
      const page = new URLSearchParams(body).get("page");
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ found_jobs: true, max_num_pages: 2,
        html: `<a href="/job/one/">One</a>${page === "2" ? '<a href="/job/broken/">Broken</a>' : ""}` }));
    }
    if (req.url === "/job/one/") return res.end(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", title: "Engineer", description: "Full description",
      datePosted: "2026-08-20", hiringOrganization: { name: "EW" },
      jobLocation: { address: { addressCountry: "GB", addressLocality: "London" } },
    })}</script>`);
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const result = await scrapeEwJobManager(`http://127.0.0.1:${address.port}/job-search/`,
      { now: new Date("2026-09-18T12:00:00Z"), delayMs: 0, company: "EW" });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rawJobs.length, 1);
    assert.equal(result.report.sourcePages.length, 2);
    assert.equal(result.report.advertisedPositions, 2);
    assert.equal(result.report.status, "partial");
    assert.equal(result.report.issues.length, 1);
    assert.equal(requests.filter(url => url === "/job/one/").length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
