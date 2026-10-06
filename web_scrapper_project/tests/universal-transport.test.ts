import test from "node:test";
import assert from "node:assert/strict";
import { AccessPolicy } from "../src/crawl.js";
import { scrapeJobtrain } from "../src/jobtrain.js";

test("robots redirects validate every destination before requesting it", async () => {
  const original = globalThis.fetch; const requested: string[] = [];
  globalThis.fetch = async input => {
    requested.push(String(input));
    return new Response("", { status: 302, headers: { Location: "https://jobs.nhs.uk/robots.txt" } });
  };
  try {
    await assert.rejects(new AccessPolicy(0, 1000).check("https://example.org/jobs"), /NHS/i);
    assert.deepEqual(requested, ["https://example.org/robots.txt"]);
  } finally { globalThis.fetch = original; }
});

test("NHS source and redirected documents are blocked before requesting that host", async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); requested.push(url);
    if (url.endsWith("/robots.txt")) return new Response("");
    return new Response("", { status: 302, headers: { Location: "https://beta.jobs.nhs.uk/candidate/jobadvert/1" } });
  };
  try {
    await assert.rejects(new AccessPolicy(0, 1000).html("https://jobs.nhs.uk/a"), /NHS/i);
    await assert.rejects(new AccessPolicy(0, 1000).html("https://example.org/jobs"), /NHS/i);
    assert.ok(requested.every(url => !new URL(url).hostname.endsWith("jobs.nhs.uk")));
  } finally { globalThis.fetch = original; }
});
test("Jobtrain follows a renamed tenant homepage's explicit job-search link", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") return new Response("");
    if (url.pathname === "/old/Home/Job") return new Response("", { status: 302, headers: { Location: "/new" } });
    if (url.pathname === "/new") return new Response('<a href="/new/Home/Job">View current vacancies</a>');
    if (url.pathname === "/new/Home/Job") return new Response('<input id="requestUrl" data-request-url="/new/Home/_JobCard">');
    if (url.pathname === "/new/Home/_JobCard") return new Response('<input id="totalMatchRecords" value="0">');
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const result = await scrapeJobtrain("https://example.org/old/Home/Job", { delayMs: 0, timeoutMs: 1000 });
    assert.equal(result.report.status, "no_matches"); assert.equal(result.report.issues.length, 0);
  } finally { globalThis.fetch = original; }
});
test("HTTP 500 retries centrally and honors Retry-After", async () => {
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async input => {
    if (String(input).endsWith("/robots.txt")) return new Response("");
    requests++;
    return requests === 1 ? new Response("unavailable", { status: 500, headers: { "Retry-After": "0.001" } }) : new Response("job detail");
  };
  try {
    assert.equal((await new AccessPolicy(0, 1000).html("https://example.org/jobs")).body, "job detail");
    assert.equal(requests, 2);
  } finally { globalThis.fetch = original; }
});
