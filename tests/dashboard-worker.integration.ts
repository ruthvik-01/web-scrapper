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
