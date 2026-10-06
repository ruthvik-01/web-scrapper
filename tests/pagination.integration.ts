import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { scrapeCompany } from "../src/crawl.js";
import { scrapeJobSitemap } from "../src/sitemap.js";
import { scrapeWebsite } from "../src/strategy.js";

test("default static crawl reaches the advertised end at 1200 listing pages", async () => {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    paths.push(url.pathname + url.search);
    if (url.pathname === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    const page = Number(url.searchParams.get("page") || 1);
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (url.pathname !== "/careers" || page > 1200) return res.writeHead(404).end();
    const job = { "@type": "JobPosting", identifier: { value: `job-${page}` },
      title: `Engineer ${page}`, description: "Build systems", url: `${origin}/jobs/${page}`,
      datePosted: "2026-09-20", jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } } };
    res.end(`<html data-total-pages="1200"><script type="application/ld+json">${JSON.stringify(job)}</script>${page < 1200 ? `<a rel="next" href="?page=${page + 1}">Next</a>` : ""}</html>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await scrapeCompany(`${base}/careers`, { mode: "static", now: new Date("2026-09-29"), delayMs: 0 });
    assert.equal(result.rows.length, 1200);
    assert.equal(result.report.pagesVisited, 1200);
    assert.equal(result.report.listingPagesAdvertised, 1200);
    assert.equal(result.report.boundary, "discovered_end");
    assert.equal(result.report.limited, false);
    assert.equal(result.report.status, "ok");
    assert.ok(!paths.includes("/careers?page=1201"));
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("sitemap with more than 250 advertised jobs is exhausted without a default truncation", async () => {
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    if (req.url === "/sitemap.xml") return res.end(`<urlset>${Array.from({ length: 260 }, (_, i) => `<url><loc>${origin}/jobs/${i + 1}</loc></url>`).join("")}</urlset>`);
    const id = Number(req.url?.split("/").at(-1));
    res.end(`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: `${id}` }, title: `Role ${id}`, description: "Build systems", url: `${origin}/jobs/${id}`, datePosted: "2026-09-20", jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } } })}</script>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await scrapeJobSitemap(`${base}/careers`, `${base}/sitemap.xml`, { now: new Date("2026-09-29"), delayMs: 0 });
    assert.equal(result.rows.length, 260);
    assert.equal(result.report.pagesVisited, 260);
    assert.equal(result.report.limited, false);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("API totalPages advances to its real end without an explicit next link", async () => {
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    const page = Number(new URL(req.url || "/", origin).searchParams.get("page") || 1);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ page, totalPages: 3, jobs: [{ id: page, title: `Role ${page}`, description: "Build systems", url: `${origin}/jobs/${page}`, postedDate: "2026-09-20", locations: [{ city: "London", country: "GB" }] }] }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await scrapeWebsite(`${base}/careers`, { mode: "api", apiUrl: `${base}/api?page=1`, now: new Date("2026-09-29"), delayMs: 0 });
    assert.equal(result.rows.length, 3);
    assert.equal(result.report.status, "ok");
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("a looping pager with changing URLs but repeated jobs stops as partial", async () => {
  const pages: number[] = [];
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    const page = Number(new URL(req.url || "/", origin).searchParams.get("page") || 1);
    pages.push(page);
    const job = { "@type": "JobPosting", identifier: { value: "same-job" }, title: "Engineer", description: "Build", url: `${origin}/jobs/1`, datePosted: "2026-09-20", jobLocation: { address: { addressCountry: "GB" } } };
    res.end(`<script type="application/ld+json">${JSON.stringify(job)}</script><a rel="next" href="?page=${page + 1}">Next</a>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await scrapeCompany(`${base}/careers`, { mode: "static", now: new Date("2026-09-29"), delayMs: 0 });
    assert.equal(result.report.status, "partial");
    assert.ok(result.report.issues.some(issue => /repeated the same job listings/.test(issue.message)));
    assert.ok(pages.length <= 4, String(pages.length));
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test("transient server errors retry a bounded number of times", async () => {
  let attempts = 0;
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /");
    attempts++;
    if (attempts < 3) return res.writeHead(503).end("busy");
    res.end(`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", identifier: { value: "1" }, title: "Engineer", description: "Build", url: `${origin}/jobs/1`, datePosted: "2026-09-20", jobLocation: { address: { addressCountry: "GB" } } })}</script>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await scrapeCompany(`${base}/careers`, { mode: "static", now: new Date("2026-09-29"), delayMs: 0 });
    assert.equal(result.rows.length, 1);
    assert.equal(result.report.status, "ok");
    assert.equal(attempts, 3);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
