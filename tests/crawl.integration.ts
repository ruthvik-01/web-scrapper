import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { scrapeCompany } from "../src/crawl.js";
import { COLUMNS } from "../src/normalize.js";
import { scrapeJobSitemap } from "../src/sitemap.js";

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
    } else if (url.pathname === "/search/") {
      response.end(url.searchParams.get("locationsearch") !== "uk" ? `<a href="/jobs/global">Global role</a>` :
        url.searchParams.has("startrow") ? `<a href="/jobs/second">Second UK role</a>` :
        `<a href="/search/">All jobs</a><a href="/search/?startrow=2">Unfiltered page</a>
         <a rel="next" href="?locationsearch=uk&startrow=2">Next</a>
         <a href="www.example.com/search/?startrow=3">Broken relative link</a>
         <a href="/jobs/first">First UK role</a>`);
    } else if (url.pathname === "/position-list") {
      response.end(`<h1>Current roles</h1><a href="/careers/positions/dYZUhyQ0Pc7yrmUzmtUeK8">Assistant Buyer</a>`);
    } else if (url.pathname === "/careers/positions/dYZUhyQ0Pc7yrmUzmtUeK8") {
      response.end(`<aside id="position-info-box"><div class="panel-body"><p><strong>Location</strong>: London, UK</p>
        <p><strong>Closing Date</strong>: 30 September 2026</p></div></aside>
        <main><div class="panel-body"><h1 class="job-title">Assistant Buyer</h1>
        <div><p>Manage stock, suppliers, and a busy clothing range in our London team.</p></div></div></main>`);
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
    } else if (url.pathname === "/stuck-list") {
      response.end('<button onclick="">Load more jobs</button>');
    } else if (url.pathname === "/jobs/detail-with-more") {
      response.end(`${htmlJob("detail-with-more")}<button onclick="location.href='/jobs/never'">Show more</button>`);
    } else if (url.pathname === "/jobs/detail-without-data") {
      response.end('<h1>Role details</h1><button onclick="location.href=\'/jobs/never\'">Show more</button>');
    } else if (url.pathname === "/custom") {
      response.end('<h1>Engineer</h1><article>Build things</article><time datetime="2026-08-20"></time><div class="place">London, England, UK</div>');
    } else if (url.pathname === "/rendered-cards") {
      response.end(`<main id="list"></main><button aria-label="Show additional vacancies" onclick="document.querySelector('#list').insertAdjacentHTML('beforeend', '<div class=vacancy-card><h2><a href=/detail/second>Second role</a></h2></div>');this.remove()">Show additional vacancies</button><script>document.querySelector('#list').innerHTML='<div class=vacancy-card><h2><a href=/detail/first>First role</a></h2></div>'</script>`);
    } else if (url.pathname === "/xhr-cards") {
      response.end(`<script>fetch('/xhr-jobs').then(response => response.json())</script>`);
    } else if (url.pathname === "/xhr-jobs") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ jobs: [{ id: "xhr-detail", title: "Care Worker", description: "Care Worker",
        url: `${base}/jobs/xhr-detail`, datePosted: "2026-08-20",
        jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } } }] }));
    } else if (url.pathname === "/jobs/xhr-detail") {
      response.end(htmlJob("xhr-detail", { title: "Care Worker", description: "Provide personal care and support residents with daily living tasks." }));
    } else if (url.pathname === "/jobs/search") {
      response.end(`<main id="list"><a href="/jobs/first">First role</a></main><button onclick="document.querySelector('#list').insertAdjacentHTML('beforeend', '<a href=/jobs/second>Second role</a>');this.remove()">Load more jobs</button>`);
    } else if (url.pathname === "/Careers/Board%20VSP-2041") {
      response.end(`<main id="list"><a href="/jobs/first">First role</a></main><button onclick="document.querySelector('#list').insertAdjacentHTML('beforeend', '<a href=/jobs/second>Second role</a>');this.remove()">Load more jobs</button>`);
    } else if (url.pathname === "/unstructured-careers") {
      response.end('<main><h1>Current vacancies</h1><a href="/news/careers/test-engineer/">Test Engineer</a></main>');
    } else if (url.pathname === "/news/careers/test-engineer/") {
      response.end('<main><h1>Test Engineer</h1><div class="careers-metadata"><span>Closing Date: 14 October 2026</span><span>Location: London, UK</span></div><article><p>Build secure public systems and support our engineering team.</p><p>Contract type - Full Time</p></article></main>');
    } else if (url.pathname === "/counted-more") {
      response.end(`<main id="list"><div class="vacancy-card"><h2><a href="/detail/first">First role</a></h2></div></main><a href="/Jobs/DownloadPrivacyPolicy?id=2041">Privacy policy</a><a href="/Jobs/DownloadDocument/42?cid=2">Role attachment</a><button onclick="document.querySelector('#list').insertAdjacentHTML('beforeend', '<div class=vacancy-card><h2><a href=/detail/second>Second role</a></h2></div>');this.remove()">Load 1 more of 1 remaining</button>`);
    } else if (url.pathname.startsWith("/detail/")) {
      response.end(htmlJob(url.pathname.split("/").at(-1)!));
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

test("DOM follows rendered job cards with opaque detail URLs and a show-additional button", async () => {
  const result = await scrapeCompany(`${base}/rendered-cards`, { ...options, mode: "dom" });
  assert.equal(result.rows.length, 2, JSON.stringify(result.report));
  assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["first", "second"]);
});

test("DOM opens the detail page when an XHR job only supplies its title as description", async () => {
  const since = requested.length;
  const result = await scrapeCompany(`${base}/xhr-cards`, { ...options, mode: "dom" });
  assert.ok(requested.slice(since).includes("/jobs/xhr-detail"));
  assert.match(result.rows[0]?.description || "", /Provide personal care and support residents/);
});

test("DOM follows counted load-more controls and reports each extraction step", async () => {
  const since = requested.length;
  const updates: { operation: string; currentUrl: string; pagesProcessed: number; jobsFound: number }[] = [];
  const result = await scrapeCompany(`${base}/counted-more`, {
    ...options, mode: "dom", onProgress: update => updates.push(update),
  });
  assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["first", "second"]);
  assert.ok(updates.some(update => /Loading more/i.test(update.operation)), JSON.stringify(updates));
  assert.ok(updates.some(update => update.jobsFound >= 2), JSON.stringify(updates));
  assert.ok(updates.filter(update => update.currentUrl === `${base}/counted-more`)
    .every(update => update.pagesProcessed === 1), JSON.stringify(updates));
  assert.equal(Math.max(...updates.map(update => update.pagesProcessed)), 3);
  assert.ok(!requested.slice(since).some(path => path.startsWith("/Jobs/DownloadPrivacyPolicy")));
  assert.ok(!requested.slice(since).some(path => path.startsWith("/Jobs/DownloadDocument")));
});

test("filtered DOM pagination visits only selected result pages and keeps distinct job IDs", async () => {
  const since = requested.length;
  const result = await scrapeCompany(`${base}/search/?locationsearch=uk`, { ...options, mode: "dom" });
  assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["first", "second"]);
  assert.equal(result.report.pagesVisited, 4);
  assert.ok(!requested.slice(since).some(path => path === "/search/" || /^\/search\/\?startrow=/.test(path)));
});

test("static crawl reads an unstructured position detail with an opaque URL reference", async () => {
  const result = await scrapeCompany(`${base}/position-list`, { ...options, mode: "static" });
  assert.equal(result.rows.length, 1, JSON.stringify(result.report));
  assert.equal(result.rows[0]!.jobId, "dYZUhyQ0Pc7yrmUzmtUeK8");
  assert.equal(result.rows[0]!.city, "London");
});

test("static extraction reads a visibly labelled unstructured vacancy detail", async () => {
  const result = await scrapeCompany(`${base}/unstructured-careers`, { ...options, mode: "static" });
  assert.equal(result.rows.length, 1, JSON.stringify(result.report.issues.slice(0, 3)));
  assert.equal(result.rows[0]!.title, "Test Engineer");
  assert.equal(result.rows[0]!.city, "London");
  assert.equal(result.rows[0]!.jdDeadline, "2026-10-14");
});

test("a disallowed third-party widget does not mark a readable job page partial", async () => {
  const tracker = createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.end(request.url === "/robots.txt" ? "User-agent: *\nDisallow: /tracker\n" : "tracking");
  });
  tracker.listen(0, "127.0.0.1"); await once(tracker, "listening");
  const address = tracker.address();
  assert.ok(address && typeof address === "object");
  const trackerUrl = `http://127.0.0.1:${address.port}/tracker`;
  try {
    const html = `${htmlJob("101")}<script>fetch(${JSON.stringify(trackerUrl)}).catch(() => {})</script><iframe src="${trackerUrl}"></iframe>`;
    const page = createServer((_request, response) => response.end(html));
    page.listen(0, "127.0.0.1"); await once(page, "listening");
    const pageAddress = page.address();
    assert.ok(pageAddress && typeof pageAddress === "object");
    try {
      const result = await scrapeCompany(`http://127.0.0.1:${pageAddress.port}/`, { ...options, mode: "dom", maxPages: 1 });
      assert.equal(result.rows.length, 1);
      assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
    } finally { page.closeAllConnections(); await new Promise<void>(resolve => page.close(() => resolve())); }
  } finally { tracker.closeAllConnections(); await new Promise<void>(resolve => tracker.close(() => resolve())); }
});

test("page budget and stuck pagination are explicitly partial", async () => {
  const limited = await scrapeCompany(`${base}/careers`, { ...options, maxPages: 1 });
  assert.equal(limited.report.limited, true);
  assert.ok(limited.report.pendingUrls.length);
  const stuck = await scrapeCompany(`${base}/stuck-list`, options);
  assert.equal(stuck.report.status, "partial");
  assert.ok(stuck.report.issues.some(issue => /Pagination/.test(issue.message)));
});

test("job detail pages do not click related-job show-more controls", async () => {
  const since = requested.length;
  const result = await scrapeCompany(`${base}/jobs/detail-with-more`, { ...options, mode: "dom" });
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
  assert.deepEqual(result.rows.map(row => row.jobId), ["detail-with-more"]);
  assert.ok(!requested.slice(since).includes("/jobs/never"));
});

test("a jobs/search listing still loads more results", async () => {
  const result = await scrapeCompany(`${base}/jobs/search`, { ...options, mode: "dom" });
  assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["first", "second"]);
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
});

test("a named careers board remains a listing despite its detail-shaped URL", async () => {
  const result = await scrapeCompany(`${base}/Careers/Board%20VSP-2041`, { ...options, mode: "dom" });
  assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["first", "second"]);
  assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
});

test("empty job detail pages are reported without following related-job controls", async () => {
  const since = requested.length;
  const result = await scrapeCompany(`${base}/jobs/detail-without-data`, { ...options, mode: "dom" });
  assert.equal(result.report.status, "partial");
  assert.ok(result.report.issues.some(issue => /detail page did not expose/i.test(issue.message)));
  assert.ok(!requested.slice(since).includes("/jobs/never"));
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
  assert.equal(result.rows[0]!.ats, "Greenhouse");
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

test("WordPress custom career API follows its advertised total pages and enriches detail pages", async () => {
  const requests: string[] = [];
  const source = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    requests.push(`${url.pathname}${url.search}`);
    const origin = `http://127.0.0.1:${(source.address() as { port: number }).port}`;
    if (url.pathname === "/robots.txt") return response.end("User-agent: *\nAllow: /");
    if (url.pathname === "/careers") {
      response.setHeader("Content-Type", "text/html");
      return response.end(`<link rel="alternate" type="application/json" href="${origin}/wp-json/wp/v2/pages/53">`);
    }
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/wp-json/wp/v2/types") return response.end(JSON.stringify({
      post: { name: "Posts", slug: "post", rest_base: "posts", rest_namespace: "wp/v2" },
      career: { name: "Careers", slug: "career", rest_base: "career", rest_namespace: "wp/v2" },
    }));
    if (url.pathname === "/wp-json/wp/v2/career") {
      response.setHeader("X-WP-TotalPages", "2");
      const page = Number(url.searchParams.get("page"));
      const id = page === 1 ? 101 : 102;
      const city = page === 1 ? "Leeds" : "Bristol";
      return response.end(JSON.stringify([{
        id, type: "career", date: "2026-09-04T15:00:00", slug: `role-${id}`,
        title: { rendered: `Production Role ${id}` }, content: { rendered: "<p>Operate production machinery safely.</p>" },
        yoast_head_json: { schema: { "@type": "JobPosting", identifier: "shared-company-id",
          title: `Production Role ${id}`, description: "Operate production machinery safely." } },
        link: `${origin}/career/role-${id}/`,
      }]));
    }
    if (url.pathname.startsWith("/career/")) {
      const id = url.pathname.includes("102") ? 102 : 101;
      const city = id === 101 ? "Leeds" : "Bristol";
      response.setHeader("Content-Type", "text/html");
      return response.end(`<main><h1>Production Role ${id}</h1><ul><li>${city}, UK</li></ul>
        <h2>Job Description</h2><p>Operate production machinery safely and keep a clear production record.</p>
        <h2>Submit Application</h2><form><input name="email"></form></main>`);
    }
    response.writeHead(404).end();
  });
  source.listen(0, "127.0.0.1"); await once(source, "listening");
  const origin = `http://127.0.0.1:${(source.address() as { port: number }).port}`;
  try {
    const result = await scrapeCompany(`${origin}/careers`, { ...options, mode: "static", maxPages: 20 });
    assert.equal(result.report.status, "ok", JSON.stringify(result.report.issues));
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.rows.map(row => row.jobId).sort(), ["101", "102"]);
    assert.deepEqual(result.rows.map(row => row.city).sort(), ["Bristol", "Leeds"]);
    assert.ok(requests.includes("/wp-json/wp/v2/career?per_page=100&page=1"));
    assert.ok(requests.includes("/wp-json/wp/v2/career?per_page=100&page=2"));
    assert.ok(!requests.some(path => path.includes("page=3")));
    assert.equal(result.report.limited, false);
  } finally {
    source.closeAllConnections();
    await new Promise<void>(resolveClose => source.close(() => resolveClose()));
  }
});
