import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { scrapeWebsite } from "../src/strategy.js";

test("explicit job-link selectors retain listing scope instead of following the global sitemap", async () => {
  const requests: string[] = [];
  let base = "";
  const server = createServer((req, res) => {
    requests.push(req.url!);
    if (req.url === "/robots.txt") return res.end(`User-agent: *\nSitemap: ${base}/global.xml`);
    if (req.url === "/uk-jobs") return res.end('<a class="vacancy" href="/job/1">Engineer</a><a href="/jobs/world">All jobs worldwide</a>');
    if (req.url === "/job/1") return res.end(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", identifier: "1", title: "Engineer", description: "Build tools",
      url: `${base}/job/1`, datePosted: "2026-08-20",
      hiringOrganization: { name: "Example" },
      jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } },
    })}</script>`);
    res.statusCode = 404; res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  base = `http://127.0.0.1:${address.port}`;
  try {
    const result = await scrapeWebsite(`${base}/uk-jobs`, {
      mode: "static", selectors: { jobLinksOnly: "a.vacancy" },
      delayMs: 0, now: new Date("2026-09-18T12:00:00Z"),
    });
    assert.equal(result.rows.length, 1);
    assert.equal(result.report.status, "ok");
    assert.ok(!requests.includes("/global.xml"));
    assert.ok(!requests.includes("/jobs/world"));
    assert.ok(requests.includes("/robots.txt"), "Access policy must still be checked");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
