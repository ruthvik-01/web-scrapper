import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { scrapeWebsite } from "../src/strategy.js";

let server: Server, base: string;
const requests: string[] = [];
const options = { now: new Date("2026-09-15T12:00:00Z"), delayMs: 0, renderWaitMs: 80, timeoutMs: 5000, maxPages: 10 };
const job = () => ({ "@type": "JobPosting", identifier: { value: "strategy-1" }, title: "Engineer",
  description: "Build tools", url: `${base}/jobs/1`, datePosted: "2026-08-20",
  jobLocation: { address: { addressCountry: "GB", addressLocality: "London" } } });
before(async () => {
  server = createServer((request, response) => {
    requests.push(request.url || "");
    if (request.url === "/robots.txt") response.end("User-agent: *\nDisallow: /blocked");
    else if (request.url === "/api") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ jobs: [job()] })); }
    else if (request.url === "/api-direct") response.end(JSON.stringify({ ...job(), url: `${base}/api-direct` }));
    else if (request.url === "/empty-api") { response.setHeader("Content-Type", "application/json"); response.end("[]"); }
    else if (request.url === "/bad-api") response.end('{"message":"unsupported shape"}');
    else if (request.url === "/paged-api") response.end(JSON.stringify({ jobs: [job()], next: "/paged-api-2" }));
    else if (request.url === "/paged-api-2") response.end(JSON.stringify({ jobs: [{ ...job(), identifier: "second", url: `${base}/jobs/second` }] }));
    else if (request.url === "/cycle-api") response.end(JSON.stringify({ jobs: [job()], next: "/cycle-api" }));
    else if (request.url === "/network-only") response.end('<html><title>Jobs</title><script>fetch("/api").then(r=>r.json()).then(()=>document.body.dataset.loaded="yes")</script><body>Careers</body></html>');
    else if (request.url === "/linked-api") response.end('<html><title>Jobs</title><link rel="alternate" type="application/json" href="/paged-api"></html>');
    else if (request.url === "/infinite") response.end(`<html><title>Infinite jobs</title><body style="min-height:2000px"><script>
      let count=0;function add(){if(count>=3)return;count++;const j=${JSON.stringify(job())};j.identifier={value:"scroll-"+count};j.url="${base}/jobs/scroll-"+count;
      const e=document.createElement("script");e.type="application/ld+json";e.textContent=JSON.stringify(j);document.body.append(e);
      document.body.style.minHeight=(2000+count*1000)+"px"};add();window.addEventListener("scroll",add);
      </script></body></html>`);
    else if (request.url === "/dynamic") response.end(`<html><title>Dynamic jobs</title><body><script>setTimeout(()=>{const e=document.createElement('script');e.type='application/ld+json';e.textContent=${JSON.stringify(JSON.stringify(job()))};document.body.append(e)},20)</script></body></html>`);
    else if (request.url === "/apply-control") response.end(`<script type="application/ld+json">${JSON.stringify(job())}</script><button id="apply" onclick="fetch('/applied')">Apply</button>`);
    else if (request.url === "/custom/jobs/1") response.end("<h1>Engineer</h1><article class=description>Build tools</article><p class=location>London, UK</p>");
    else response.end(`<html><title>Jobs</title><script type="application/ld+json">${JSON.stringify(job())}</script></html>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); });

test("static mode reads HTML without requiring a browser", async () => {
  const result = await scrapeWebsite(`${base}/static`, { ...options, mode: "static" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.report.process, "STATIC");
});
test("public API follows explicit next links and reports cycles and exhausted budgets", async () => {
  const complete = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api", apiUrl: `${base}/paged-api` });
  assert.equal(complete.rows.length, 2);
  assert.equal(complete.report.status, "ok");
  const cycle = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api", apiUrl: `${base}/cycle-api` });
  assert.equal(cycle.report.status, "partial");
  assert.match(cycle.report.issues[0]!.message, /cycle/);
  const limited = await scrapeWebsite(`${base}/careers`, { ...options, maxPages: 1, mode: "api", apiUrl: `${base}/paged-api` });
  assert.equal(limited.report.limited, true);
  assert.equal(limited.rows.length, 1);
});
test("Auto discovers a linked JSON feed and follows its pagination without a browser", async () => {
  const result = await scrapeWebsite(`${base}/linked-api`, options);
  assert.equal(result.rows.length, 2);
  assert.ok(!result.report.process.includes("DOM"));
});
test("DOM captures public job JSON loaded through fetch even without HTML job markup", async () => {
  const result = await scrapeWebsite(`${base}/network-only`, options);
  assert.equal(result.rows.length, 1);
  assert.match(result.report.process, /DOM/);
  assert.match(result.report.process, /API/);
});
test("DOM collects jobs added by infinite scrolling until the page stops changing", async () => {
  const result = await scrapeWebsite(`${base}/infinite`, { ...options, mode: "dom" });
  assert.equal(result.rows.length, 3);
  assert.equal(result.report.status, "ok");
  assert.equal(result.report.limited, false);
});
test("API mode reads public JobPosting JSON and handles an empty feed", async () => {
  const result = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api", apiUrl: `${base}/api` });
  assert.equal(result.rows.length, 1);
  assert.equal(result.report.process, "API");
  const empty = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api", apiUrl: `${base}/empty-api` });
  assert.equal(empty.report.status, "no_matches");
  const direct = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api", apiUrl: `${base}/api-direct` });
  assert.equal(direct.rows[0]!.jobUrl, `${base}/api-direct`);
  const unsupported = await scrapeWebsite(`${base}/careers`, { ...options, mode: "api" });
  assert.equal(unsupported.report.process, "API");
  assert.equal(unsupported.rows.length, 0);
});
test("Auto falls back from an unsupported API response to static HTML", async () => {
  const result = await scrapeWebsite(`${base}/static`, { ...options, apiUrl: `${base}/bad-api` });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.report.attempts.map(attempt => attempt.method), ["API", "STATIC"]);
});
test("Auto falls back to DOM for JavaScript-rendered JobPosting data", async () => {
  const result = await scrapeWebsite(`${base}/dynamic`, options);
  assert.equal(result.rows.length, 1);
  assert.equal(result.report.process, "DOM");
  assert.deepEqual(result.report.attempts.map(attempt => attempt.method), ["STATIC", "DOM"]);
});
test("custom CSS selectors support a non-schema static job page", async () => {
  const result = await scrapeWebsite(`${base}/custom/jobs/1`, { ...options, mode: "static",
    selectors: { title: "h1", description: ".description", location: ".location" } });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.postedDate, "2026-09-15");
  assert.equal(result.report.dateFallbacks.length, 1);
});
test("access restrictions remain enforced across strategies", async () => {
  const result = await scrapeWebsite(`${base}/blocked`, options);
  assert.equal(result.rows.length, 0);
  assert.ok(result.report.issues.some(issue => /robots/.test(issue.message)));
  assert.ok(!requests.includes("/blocked"));
});
test("a custom selector cannot accidentally click an application submission control", async () => {
  const result = await scrapeWebsite(`${base}/apply-control`, { ...options, mode: "dom", selectors: { loadMore: "#apply" } });
  assert.ok(result.report.issues.some(issue => /application/.test(issue.message)));
  assert.ok(!requests.includes("/applied"));
});
