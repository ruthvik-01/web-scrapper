import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchesCompanyTitle, runBatch } from "../src/batch.js";

test("batch isolates failures, checkpoints data and never mixes subsidiary employers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uk-scraper-batch-"));
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    if (request.url === "/robots.txt") return response.end("User-agent: *\nDisallow:");
    response.end(JSON.stringify({ jobs: ["School", "Other"].map((company, i) => ({
      id: String(i + 1), title: "Teacher", description: "Teach students",
      url: `http://127.0.0.1:${port}/jobs/${i}`, company,
      location: { city: "London", country: "UK" },
    })) }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  try {
    const companies = [
      { name: "Invalid", slug: "invalid", careersUrl: "invalid" },
      { name: "School Group", slug: "school", careersUrl: `http://127.0.0.1:${port}/api`, employerNames: ["School"],
        exportCompanyName: "School Group",
        options: { mode: "static" as const, delayMs: 0 } },
    ];
    const first = await runBatch(companies, directory);
    assert.equal(first[0]!.status, "failed");
    assert.equal(first[1]!.rows, 1);
    const rows = JSON.parse(await readFile(join(directory, "school/export-rows.json"), "utf8"));
    assert.equal(rows[0].company, "School Group");
    assert.equal(rows[0].ats, "Custom");
    const report = JSON.parse(await readFile(join(directory, "school/scrape-report.json"), "utf8"));
    assert.equal(report.scopeExcluded.length, 1);
    assert.deepEqual(report.exportCompanyIdentity, {name:"School Group",sourceNames:["School"]});
    const source = JSON.parse(await readFile(join(directory, "school/scrape-result.json"), "utf8"));
    assert.equal(source.rows[0].company, "School");
    const priorCalls = calls;
    await runBatch([companies[1]!], directory, true);
    assert.equal(calls, priorCalls);
    const resumed = JSON.parse(await readFile(join(directory, "school/export-rows.json"), "utf8"));
    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].company, "School Group");
    await assert.rejects(runBatch([{ ...companies[1]!, slug: "../escape" }], directory), /safe folder/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("mixed-board title scope rejects fallback employer labels and survives resume", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uk-title-scope-"));
  const titles = ["Phase Eight - Sales Assistant", "Other Retailer - Sales", "Phase Eightfold - Sales"];
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    if (request.url === "/robots.txt") return response.end("User-agent: *\nDisallow:");
    if (request.url === "/live-jobs.xml") {
      return response.end(`<urlset>${titles.map((_, i) =>
        `<url><loc>http://127.0.0.1:${port}/vacancies/${i + 1}/role.html</loc></url>`).join("")}</urlset>`);
    }
    const id = Number(request.url?.split("/")[2]);
    response.end(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", title: titles[id - 1], description: "Serve customers.",
      url: `http://127.0.0.1:${port}${request.url}`,
      jobLocation: {address: {addressLocality: "London", addressCountry: "UK"}},
    })}</script>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  const company = {
    name: "Phase Eight", slug: "phase-eight", careersUrl: `http://127.0.0.1:${port}/vacancies/`,
    titlePrefixes: ["Phase Eight"],
    options: {mode: "static" as const, delayMs: 0, sitemapUrl: `http://127.0.0.1:${port}/live-jobs.xml`},
  };
  try {
    assert.ok(matchesCompanyTitle("phase eight: Sales", company));
    assert.ok(!matchesCompanyTitle("Phase Eightfold - Sales", company));
    const summary = await runBatch([company], directory);
    assert.equal(summary[0]!.rows, 1);
    const rows = JSON.parse(await readFile(join(directory, company.slug, "export-rows.json"), "utf8"));
    assert.equal(rows[0].title, titles[0]);
    const reportPath = join(directory, company.slug, "scrape-report.json");
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).scopeExcluded.length, 2);
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).dateFallbacks.length, 1);
    const before = calls;
    await runBatch([company], directory, true);
    assert.equal(calls, before);
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).scopeExcluded.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await rm(directory, {recursive: true, force: true});
  }
});
