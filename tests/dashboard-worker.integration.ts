import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { copyFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createDashboard } from "../server/app.js";
import { catalogFromRows } from "../server/catalog.js";
import { projectRoot } from "./dashboard-helpers.js";

test("real worker process discovers a local sitemap, runs the scraper, and creates portable output", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-worker-"));
  await copyFile(join(projectRoot, "package.json"), join(root, "package.json"));
  await copyFile(join(projectRoot, "package-lock.json"), join(root, "package-lock.json"));
  await copyFile(join(projectRoot, "tsconfig.json"), join(root, "tsconfig.json"));
  await cp(join(projectRoot, "src"), join(root, "src"), { recursive: true });
  let sourceBase = "";
  const source = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    if (request.url === "/robots.txt") response.end(`User-agent: *\nAllow: /\nSitemap: ${sourceBase}/sitemap.xml`);
    else if (request.url === "/sitemap.xml") response.end(`<urlset><url><loc>${sourceBase}/jobs/1</loc></url></urlset>`);
    else response.end(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", identifier: { value: "real-worker-1" }, title: "Test Engineer",
      description: "A local fixture, not a real vacancy.", datePosted: new Date().toISOString().slice(0, 10),
      url: `${sourceBase}/jobs/1`, hiringOrganization: { name: "Local Fixture" },
      jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } },
    })}</script>`);
  });
  source.listen(0, "127.0.0.1"); await once(source, "listening");
  const sourceAddress = source.address();
  assert.ok(sourceAddress && typeof sourceAddress === "object");
  sourceBase = `http://127.0.0.1:${sourceAddress.port}`;
  const companies = catalogFromRows([["company", "career_url"], ["Local Fixture", `${sourceBase}/careers`]]);
  const app = await createDashboard({ root, companies, publicDir: join(projectRoot, "ui") });
  app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const initial = await (await fetch(`${base}/api/dashboard`)).json();
    const start = await fetch(`${base}/api/runs`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Workspace-Token": initial.token },
      body: JSON.stringify({ companyIds: [companies[0]!.id] }),
    });
    assert.equal(start.status, 202);
    let result = initial;
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await (await fetch(`${base}/api/dashboard`)).json();
      if (!result.activeRun) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.equal(result.runs[0].status, "completed", JSON.stringify(result.runs[0]));
    assert.equal(result.companies[0].summary.locationRows, 1);
    const rows = await (await fetch(`${base}/api/companies/${companies[0]!.id}/results`)).json();
    assert.equal(rows.rows[0].jobId, "real-worker-1");
    const folder = join(root, "output", companies[0]!.slug, "runs", result.runs[0].id);
    assert.match(await readFile(join(folder, "code/scrape.ts"), "utf8"), /Local Fixture/);
    assert.match(await readFile(join(folder, "jobs.csv"), "utf8"), /Test Engineer/);
  } finally {
    await app.close();
    source.closeAllConnections();
    await new Promise<void>(resolveClose => source.close(() => resolveClose()));
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe fixture cleanup.");
    await rm(root, { recursive: true, force: true });
  }
});

test("DOM worker publishes pagination and job extraction progress to the dashboard", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "fieldwork-dom-progress-"));
  let sourceBase = "";
  const source = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    if (request.url === "/robots.txt") return response.end("User-agent: *\nAllow: /\n");
    if (request.url === "/careers") return response.end(`<main><div class="vacancy-card"><a href="/job/first">First role</a></div></main><button onclick="document.querySelector('main').insertAdjacentHTML('beforeend', '<div class=vacancy-card><a href=/job/second>Second role</a></div>');this.remove()">Load 1 more of 1 remaining</button>`);
    const id = request.url?.split("/").at(-1);
    response.end(`<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting", identifier: { value: id }, title: "Test Engineer",
      description: "A local fixture", datePosted: new Date().toISOString().slice(0, 10),
      url: `${sourceBase}/job/${id}`, hiringOrganization: { name: "Local Fixture" },
      jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } },
    })}</script>`);
  });
  source.listen(0, "127.0.0.1"); await once(source, "listening");
  const sourceAddress = source.address();
  assert.ok(sourceAddress && typeof sourceAddress === "object");
  sourceBase = `http://127.0.0.1:${sourceAddress.port}`;
  const companies = catalogFromRows([["company", "career_url"], ["Local Fixture", `${sourceBase}/careers`]]);
  companies[0]!.mode = "dom";
  companies[0]!.renderWaitMs = 100;
  const app = await createDashboard({ root: projectRoot, dataRoot, companies, publicDir: join(projectRoot, "ui") });
  app.server.listen(0, "127.0.0.1"); await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const initial = await (await fetch(`${base}/api/dashboard`)).json();
    const start = await fetch(`${base}/api/runs`, { method: "POST", headers: {
      "Content-Type": "application/json", Origin: base, "X-Workspace-Token": initial.token,
    }, body: JSON.stringify({ companyIds: [companies[0]!.id] }) });
    assert.equal(start.status, 202);
    const operations: string[] = [];
    let final = initial;
    for (let attempt = 0; attempt < 100; attempt++) {
      final = await (await fetch(`${base}/api/dashboard`)).json();
      const metrics = final.activeRun?.items[0]?.metrics;
      if (metrics) operations.push(metrics.operation);
      if (!final.activeRun) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert.equal(final.runs[0].status, "completed", JSON.stringify(final.runs[0]));
    assert.equal(final.companies[0].summary.jobs, 2);
    assert.ok(operations.some(operation => /Loading more jobs/.test(operation)), JSON.stringify(operations));
    assert.ok(final.runs[0].items[0].metrics.pagesProcessed >= 2);
  } finally {
    await app.close();
    source.closeAllConnections();
    await new Promise<void>(resolveClose => source.close(() => resolveClose()));
    if (!resolve(dataRoot).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe fixture cleanup.");
    await rm(dataRoot, { recursive: true, force: true });
  }
});
