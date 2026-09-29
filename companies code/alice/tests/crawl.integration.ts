import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { scrapeCompany } from "../src/crawl.js";
import { COLUMNS } from "../src/normalize.js";
import { OUTPUT_COLUMNS } from "../src/output.js";
import { scrapeJobSitemap } from "../src/sitemap.js";

const run = promisify(execFile);
const now = new Date("2026-09-15T12:00:00Z");
const options = { now, delayMs: 0, renderWaitMs: 100, timeoutMs: 10_000, maxPages: 30 };
let server: Server;
let base: string;
const requested: string[] = [];

function job(id: string, extra: Record<string, unknown> = {}) {
  return {
    "@context": "https://schema.org", "@type": "JobPosting", identifier: { value: id },
    title: "Software Engineer", description: "<p>Build systems.</p>",
    url: `${base}/jobs/${id}`, datePosted: "2026-08-20", hiringOrganization: { name: "ABC" },
    jobLocation: { address: { addressLocality: "London", addressRegion: "England", addressCountry: "GB" } },
    ...extra,
  };
}
function htmlJob(id: string, extra: Record<string, unknown> = {}) {
  return `<html><head><title>Job ${id}</title><script type="application/ld+json">${JSON.stringify(job(id, extra))}</script></head><body>Job</body></html>`;
}

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, base || "http://127.0.0.1");
    requested.push(url.pathname + url.search);
    response.setHeader("Content-Type", "text/html");
    if (url.pathname === "/robots.txt") {
      response.setHeader("Content-Type", "text/plain");
      response.end("User-agent: *\nDisallow: /private\nDisallow: /jobs/blocked\n");
    } else if (url.pathname === "/sitemap.xml") {
      response.end(`<sitemapindex><sitemap><loc>${base}/live-jobs.xml</loc></sitemap></sitemapindex>`);
    } else if (url.pathname === "/live-jobs.xml") {
      response.end(`<urlset><url><loc>${base}/jobs/101</loc><lastmod>2020-01-01</lastmod></url>
        <url><loc>${base}/jobs/old</loc><lastmod>2026-09-15</lastmod></url></urlset>`);
    } else if (url.pathname === "/careers" && url.searchParams.get("page") === "2") {
      response.end('<a href="/jobs/page-two">Engineer</a>');
    } else if (url.pathname === "/careers") {
      response.end(`<html><head><title>Careers</title></head><body><main id="jobs"></main>
        <a href="?page=2" rel="next">Next</a><iframe src="/embedded-careers"></iframe>
        <button onclick="document.querySelector('#jobs').insertAdjacentHTML('beforeend', '<a href=/jobs/late>Engineer</a>');this.remove()">Load more jobs</button>
        <script>setTimeout(() => {
          document.querySelector('#jobs').insertAdjacentHTML('beforeend',
            '<a href="/jobs/101">Engineer</a><a href="/jobs/old">Old</a><a href="/jobs/future">Future</a><a href="/jobs/unknown">Unknown</a><a href="/jobs/foreign">Foreign</a>');
        }, 20);</script></body></html>`);
    } else if (url.pathname === "/embedded-careers") {
      response.end(htmlJob("embedded"));
    } else if (url.pathname === "/jobs/101") {
      response.end(htmlJob("101", {
        jobLocation: [
          { address: { addressLocality: "London", addressRegion: "England", addressCountry: "GB" } },
          { address: { addressLocality: "Manchester", addressRegion: "England", addressCountry: "GB" } },
          { address: { addressLocality: "Birmingham", addressRegion: "England", addressCountry: "GB" } },
          { address: { addressLocality: "New York", addressRegion: "NY", addressCountry: "US" } },
        ],
      }));
    } else if (url.pathname === "/jobs/old") {
      response.end(htmlJob("old", { datePosted: "2026-07-14" }));
    } else if (url.pathname === "/jobs/future") {
      response.end(htmlJob("future", { datePosted: "2026-09-16" }));
    } else if (url.pathname === "/jobs/unknown") {
      response.end(htmlJob("unknown", { datePosted: undefined }));
    } else if (url.pathname === "/jobs/foreign") {
      response.end(htmlJob("foreign", { jobLocation: { address: { addressLocality: "London", addressCountry: "Canada" } } }));
    } else if (url.pathname === "/redirect-careers") {
      response.writeHead(302, { Location: "/redirect-two" });
      response.end();
    } else if (url.pathname === "/redirect-two") {
      response.writeHead(302, { Location: "/private" });
      response.end();
    } else if (url.pathname === "/allowed-redirect") {
      response.writeHead(302, { Location: "/jobs/101" });
      response.end();
    } else if (url.pathname === "/jobs/challenge") {
      response.end("<html><title>Verify you are human</title><body>Access check</body></html>");
    } else if (url.pathname === "/jobs/stuck") {
      response.end('<button onclick="">Load more jobs</button>');
    } else if (url.pathname === "/custom") {
      response.end('<h1>Engineer</h1><article>Build things</article><time datetime="2026-08-20"></time><div class="place">London, England, UK</div>');
    } else if (url.pathname.startsWith("/jobs/")) {
      response.end(htmlJob(url.pathname.split("/").at(-1)!));
    } else {
      response.end("<html><title>Company</title><body>No structured jobs here</body></html>");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

test("end-to-end JS rendering, load-more, pagination links, iframe, filtering, and multi-location", async () => {
  const result = await scrapeCompany(`${base}/careers`, options);
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
  assert.equal(result.rows.length, 7);
  assert.equal(result.rows.filter(row => row.jobId === "101").length, 3);
  assert.ok(result.rows.some(row => row.jobId === "late"));
  assert.ok(result.rows.some(row => row.jobId === "page-two"));
  assert.ok(result.rows.some(row => row.jobId === "embedded"));
  assert.ok(result.report.dateFallbacks.some(job => job.jobId === "unknown"));
  assert.ok(result.report.skipped.some(job => job.reason === "outside_date_window"));
  assert.ok(result.report.skipped.some(job => job.reason === "no_confirmed_uk_location"));
  for (const row of result.rows) assert.deepEqual(Object.keys(row), [...COLUMNS]);
});

test("robots.txt is enforced before direct and redirected document requests", async () => {
  const beforeRequests = requested.length;
  const blocked = await scrapeCompany(`${base}/jobs/blocked`, options);
  assert.equal(blocked.rows.length, 0);
  assert.equal(blocked.report.status, "partial");
  assert.ok(blocked.report.issues.some(issue => /robots/.test(issue.message)));
  const redirected = await scrapeCompany(`${base}/redirect-careers`, options);
  assert.ok(redirected.report.issues.some(issue => /robots/.test(issue.message)));
  assert.ok(!requested.slice(beforeRequests).includes("/jobs/blocked"));
  assert.ok(!requested.slice(beforeRequests).includes("/private"));
});

test("allowed HTTP redirects retain the final URL and remain extractable", async () => {
  const result = await scrapeCompany(`${base}/allowed-redirect`, options);
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0]!.jobUrl, `${base}/jobs/101`);
});

test("unsupported and challenge pages are reported, not presented as successful empty scrapes", async () => {
  const empty = await scrapeCompany(`${base}/nothing`, options);
  assert.equal(empty.report.status, "unsupported");
  const challenge = await scrapeCompany(`${base}/jobs/challenge`, options);
  assert.equal(challenge.report.status, "partial");
  assert.ok(challenge.report.issues.some(issue => /challenge/.test(issue.message)));
});

test("custom CSS selectors make a non-schema website extractable", async () => {
  const result = await scrapeCompany(`${base}/custom`, {
    ...options, company: "ABC",
    selectors: { title: "h1", description: "article", postedDate: "time", location: ".place" },
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.city, "London");
});

test("page budget and stuck pagination are explicitly partial", async () => {
  const limited = await scrapeCompany(`${base}/careers`, { ...options, maxPages: 1 });
  assert.equal(limited.report.limited, true);
  assert.ok(limited.report.pendingUrls.length);
  const stuck = await scrapeCompany(`${base}/jobs/stuck`, options);
  assert.equal(stuck.report.status, "partial");
  assert.ok(stuck.report.issues.some(issue => /Pagination/.test(issue.message)));
});

test("public ATS API jobs are enriched without duplicate location rows", async t => {
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname.endsWith("greenhouse.io")) {
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /", { status: 200 });
      return Response.json({ jobs: [{
        id: 101, title: "Software Engineer", content: "Build systems.", updated_at: "2026-09-15",
        absolute_url: `${base}/jobs/101`, location: { name: "London, UK" },
      }] });
    }
    return originalFetch(input, init);
  });
  const result = await scrapeCompany("https://boards.greenhouse.io/example", options);
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0]!.jobId, "101");
  assert.equal(result.rows[0]!.postedDate, "2026-08-20");
  assert.equal(result.rows[0]!.ats, "Custom"); // Exported ATS is Custom; detection stays on the raw record.
});

test("static sitemap collection follows indexes and never uses lastmod as datePosted", async () => {
  const result = await scrapeJobSitemap(`${base}/careers`, `${base}/sitemap.xml`, options);
  assert.equal(result.report.process, "STATIC");
  assert.equal(result.report.advertisedUrls, 2);
  assert.equal(result.report.pagesVisited, 2);
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every(row => row.jobId === "101"));
  assert.equal(result.report.skipped[0]?.reason, "outside_date_window");
});

test("CLI writes correctly shaped CSV, JSON, and reports without overwriting earlier runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uk-scraper-test-"));
  try {
    // This fixture date is relative to actual run time; no production --now bypass is exposed.
    const args = ["--import", "tsx", "scraper.ts", `${base}/jobs/101`, "--company", "ABC",
      "--out", directory, "--delay-ms", "0", "--render-wait-ms", "50"];
    await run(process.execPath, args, { cwd: process.cwd(), timeout: 30_000 });
    await run(process.execPath, args, { cwd: process.cwd(), timeout: 30_000 });
    const files = await readdir(directory);
    assert.equal(files.length, 6);
    const rowsFile = files.find(file => file.endsWith(".json") && !file.endsWith(".report.json"))!;
    const rows = JSON.parse(await readFile(join(directory, rowsFile), "utf8")) as Record<string, string>[];
    // The filter can legitimately produce zero rows when tests run after the fixture's window.
    for (const row of rows) assert.deepEqual(Object.keys(row), [...OUTPUT_COLUMNS]);
    const csv = await readFile(join(directory, files.find(file => file.endsWith(".csv"))!), "utf8");
    assert.ok(csv.startsWith("\uFEFF" + OUTPUT_COLUMNS.join(",")));
  } finally {
    // Remove only the unique temporary directory created by this test.
    await rm(directory, { recursive: true, force: true });
  }
});
