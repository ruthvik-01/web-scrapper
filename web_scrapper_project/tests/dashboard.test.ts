import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { catalogFromRows } from "../server/catalog.js";
import { inside } from "../server/app.js";
import { dashboardFixture, fixtureOutput, waitForIdle } from "./dashboard-helpers.js";

test("catalog groups duplicate careers URLs and treats spreadsheet text as data", () => {
  const data = catalogFromRows([
    ["company", "company_url", "career_url"],
    ["Alpha", "https://a.example", "https://a.example/jobs?utm_source=x"],
    ["Alpha alias", "", "https://a.example/jobs"],
    ["<img src=x onerror=alert(1)>", "", "https://b.example/jobs"],
    ["Invalid", "", "javascript:alert(1)"],
  ]);
  assert.equal(data.length, 2);
  assert.deepEqual(data[0]!.aliases, ["Alpha alias"]);
  assert.equal(data[1]!.name, "<img src=x onerror=alert(1)>");
  assert.match(data[1]!.slug, /^[a-z0-9-]+$/);
  assert.match(data[1]!.id, /^[a-f0-9]{12}$/);
  assert.equal(inside("C:/work/project", "C:/work/project-other/file"), false);
});

test("dashboard exposes actual catalog, existing exports, secure local headers", async () => {
  const fixture = await dashboardFixture();
  try {
    assert.equal(fixture.dashboard.stats.companies, 8);
    assert.equal(fixture.dashboard.stats.completed, 1);
    assert.equal(fixture.dashboard.stats.rows, 1);
    assert.equal(fixture.dashboard.companies[7].status, "ready");
    const response = await fetch(fixture.base);
    assert.match(response.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.match(await response.text(), /Fieldwork/);
  } finally { await fixture.close(); }
});

test("historically taken companies remain available in an individual workspace", async () => {
  const fixture = await dashboardFixture();
  try {
    const id = fixture.companies[7]!.id;
    const company = fixture.dashboard.companies.find((item: { id: string }) => item.id === id);
    assert.equal(company.status, "ready");
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] })).status, 202);
    await waitForIdle(fixture.base);
  } finally { await fixture.close(); }
});

test("dated deliveries remain visible and downloadable without a workbook", async () => {
  const fixture = await dashboardFixture();
  try {
    const delivery = join(fixture.root, "output", "2026-09-28-verified");
    await mkdir(delivery, { recursive: true });
    await writeFile(join(delivery, "companies.csv"), "jobId,title\n1,Example\n");
    await writeFile(join(delivery, "companies.json"), JSON.stringify([{ jobId: "1" }]));
    await writeFile(join(delivery, "final.zip"), "example zip");
    const response = await fetch(`${fixture.base}/api/deliveries`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.deliveries.map((item: { name: string; rows: number }) => [item.name, item.rows]), [["2026-09-28-verified", 1]]);
    const csv = await fetch(`${fixture.base}/api/deliveries/2026-09-28-verified/companies.csv`);
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /1,Example/);
    assert.equal((await fetch(`${fixture.base}/api/deliveries/..%2f..%2fsecret/companies.csv`)).status, 404);
  } finally { await fixture.close(); }
});

test("complete universal deliveries are counted and downloadable; partial ones stay unlisted", async () => {
  const fixture = await dashboardFixture();
  try {
    const name = "2026-10-05-universal-06-00-00-123Z";
    const complete = join(fixture.root, "output", name), partial = join(fixture.root, "output", "2026-10-05-universal-06-00-01-123Z");
    await mkdir(complete, { recursive: true }); await mkdir(partial, { recursive: true });
    await writeFile(join(complete, "companies.csv"), "jobId,title\n1,Engineer\n");
    await writeFile(join(complete, "companies.json"), JSON.stringify([{ jobId: "1" }]));
    await writeFile(join(partial, "summary.json"), "[]");
    const response = await fetch(`${fixture.base}/api/deliveries`);
    const data = await response.json();
    assert.deepEqual(data.deliveries.map((item: { name: string; rows: number }) => [item.name, item.rows]), [[name, 1]]);
    const csv = await fetch(`${fixture.base}/api/deliveries/${name}/companies.csv`);
    assert.equal(csv.status, 200); assert.match(await csv.text(), /1,Engineer/);
  } finally { await fixture.close(); }
});

for (const parent of ["", "universal-runs"]) {
  for (const slug of ["universal", "aqua-security"]) {
    test(`manifest exports support ${slug} runs under output/${parent}`, async () => {
      const fixture = await dashboardFixture();
      const name = `2026-10-06-${slug}-06-00-00-123Z-abcdef12`;
      const folder = join(fixture.root, "output", parent, name);
      try {
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "companies.csv"), "jobId,title\n1,Engineer\n");
        await writeFile(join(folder, "companies.json"), JSON.stringify([{ jobId: "1" }]));
        for (const complete of [false, true]) {
          await writeFile(join(folder, "manifest.json"), JSON.stringify({ complete }));
          const data = await (await fetch(`${fixture.base}/api/deliveries`)).json();
          assert.equal(data.deliveries.some((item: { name: string }) => item.name === name), complete);
          const csv = await fetch(`${fixture.base}/api/deliveries/${name}/companies.csv`);
          assert.equal(csv.status, complete ? 200 : 404);
          if (complete) assert.match(await csv.text(), /1,Engineer/);
        }
      } finally { await fixture.close(); }
    });
  }
}

test("pipeline CSV and its audit report are available from website exports", async () => {
  const fixture = await dashboardFixture();
  try {
    const folder = join(fixture.root, "output", "30-9-26");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "30-9-26.csv"), "jobId,title\n101,Engineer\n");
    await writeFile(join(folder, "30-9-26-summary.json"), JSON.stringify({ finalRows: 110, quality: { duplicateJobIds: 0 } }));
    await writeFile(join(folder, "rejections.json"), JSON.stringify([{ company: "Example", reason: "no_confirmed_uk_location" }]));
    const response = await fetch(`${fixture.base}/api/deliveries`);
    const delivery = (await response.json()).deliveries.find((item: { name: string }) => item.name === "30-9-26");
    assert.deepEqual([delivery.rows, delivery.pipeline, delivery.hasReport], [110, true, true]);
    const csv = await fetch(`${fixture.base}/api/deliveries/30-9-26/companies.csv`);
    assert.equal(await csv.text(), "jobId,title\n101,Engineer\n");
    const reportResponse = await fetch(`${fixture.base}/api/deliveries/30-9-26/report.json`);
    assert.match(reportResponse.headers.get("content-disposition") || "", /^inline/);
    const report = await reportResponse.json();
    assert.equal(report.finalRows, 110);
    const rejected = await (await fetch(`${fixture.base}/api/deliveries/30-9-26/rejections.json`)).json();
    assert.equal(rejected[0].reason, "no_confirmed_uk_location");
  } finally { await fixture.close(); }
});

test("batch start rejects CSRF, foreign origin, duplicates, and over-five selections", async () => {
  const fixture = await dashboardFixture();
  try {
    const id = fixture.companies[1]!.id;
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] }, "wrong")).status, 403);
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] }, fixture.dashboard.token, "https://evil.example")).status, 403);
    assert.equal((await fixture.post("/api/runs", { companyIds: [id, id] })).status, 400);
    assert.equal((await fixture.post("/api/runs", { companyIds: fixture.companies.slice(0, 6).map(company => company.id) })).status, 400);
    assert.equal((await fixture.post("/api/runs", { companyIds: ["000000000000"] })).status, 404);
    assert.equal((await fixture.post("/api/runs", null)).status, 400);
  } finally { await fixture.close(); }
});

test("a batch executes sequentially, persists metadata, and exposes CSV/code/report downloads", async () => {
  const order: string[] = [];
  const fixture = await dashboardFixture(async (company, directory, log) => {
    order.push(company.id); log("Reading 1/1 job pages read."); return fixtureOutput(directory);
  });
  try {
    const ids = fixture.companies.slice(1, 3).map(company => company.id);
    assert.equal((await fixture.post("/api/runs", { companyIds: ids })).status, 202);
    const done = await waitForIdle(fixture.base);
    assert.deepEqual(order, ids);
    assert.equal(done.runs[0].status, "completed");
    assert.equal(done.runs[0].items.length, 2);
    assert.ok(done.runs[0].logs.length);
    const csv = await fetch(`${fixture.base}/api/companies/${ids[0]}/download?kind=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-disposition")!, /attachment/);
    assert.match(await csv.text(), /jobId,title,description,jobUrl,postedDate/);
    const result = await (await fetch(`${fixture.base}/api/companies/${ids[0]}/results?q=software`)).json();
    assert.equal(result.rows[0].title, "Software Engineer");
    const code = await fetch(`${fixture.base}/api/companies/${ids[0]}/download?kind=code`);
    const files = unzipSync(new Uint8Array(await code.arrayBuffer()));
    assert.match(strFromU8(files["code/scrape.ts"]!), /Standalone fixture/);
    assert.ok(files["code/src/example.ts"]);
    assert.equal((await fetch(`${fixture.base}/api/companies/${ids[0]}/download?kind=../../package.json`)).status, 400);
    const persisted = JSON.parse(await readFile(join(fixture.root, "output/_tracking/ui-state.json"), "utf8"));
    assert.equal(persisted.runs[0].status, "completed");
  } finally { await fixture.close(); }
});

test("stop queue finishes the current company and skips the rest", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  const order: string[] = [];
  const fixture = await dashboardFixture(async (company, directory) => {
    order.push(company.id); await gate; return fixtureOutput(directory);
  });
  try {
    const ids = fixture.companies.slice(1, 4).map(company => company.id);
    await fixture.post("/api/runs", { companyIds: ids });
    assert.equal((await fixture.post("/api/runs", { companyIds: [ids[0]] })).status, 409);
    await fixture.post("/api/runs/stop", {});
    release();
    const done = await waitForIdle(fixture.base);
    assert.equal(done.runs[0].status, "stopped");
    assert.deepEqual(order, [ids[0]]);
    assert.deepEqual(done.runs[0].items.map((item: { status: string }) => item.status), ["completed", "cancelled", "cancelled"]);
  } finally { release(); await fixture.close(); }
});

test("failed reruns preserve the previous output", async () => {
  const fixture = await dashboardFixture(async () => { throw new Error("Fixture source unavailable"); });
  try {
    const id = fixture.companies[0]!.id;
    const before = await readFile(join(fixture.companies[0]!.resultDir!, "jobs.csv"), "utf8");
    await fixture.post("/api/runs", { companyIds: [id] });
    const done = await waitForIdle(fixture.base);
    assert.equal(done.runs[0].items[0].status, "failed");
    assert.equal(done.companies[0].status, "needs-review");
    assert.equal(await readFile(join(fixture.companies[0]!.resultDir!, "jobs.csv"), "utf8"), before);
  } finally { await fixture.close(); }
});
