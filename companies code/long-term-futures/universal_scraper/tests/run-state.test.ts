import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dashboardFixture, waitForIdle } from "./dashboard-helpers.js";

test("a completed run with no jobs is marked NO JOBS and is never exported", async () => {
  const fixture = await dashboardFixture(async (_company, _directory, log) => {
    log("Fixture: 0/1 job pages read.");
    return { company: "Fixture company", status: "no_matches", process: "STATIC", scrapedAt: "2026-09-15T12:00:00Z", jobs: 0, locationRows: 0 };
  });
  try {
    const id = fixture.companies[1]!.id;
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] })).status, 202);
    const done = await waitForIdle(fixture.base);
    const item = done.runs[0].items[0];
    assert.equal(item.status, "empty");
    assert.match(item.error, /no jobs/);
    // The company is not shown as collected and contributes nothing to exports.
    assert.equal(done.companies.find((company: { id: string }) => company.id === id).status, "no-jobs");
    assert.equal(done.companies.find((company: { id: string }) => company.id === id).hasOutput, false);
    assert.equal(done.stats.empty, 1);
    // Its run summary is not stored, so the download endpoints have no export.
    const csv = await fetch(`${fixture.base}/api/companies/${id}/download?kind=csv`);
    assert.equal(csv.status, 404);
  } finally { await fixture.close(); }
});

test("a failed run keeps FAILED state, an isolated log, and no export rows", async () => {
  let failId = "";
  const fixture = await dashboardFixture(async (company, directory, log) => {
    if (company.id === failId) {
      log("Fixture: partial work happened before the failure.");
      throw new Error("Timeout while loading careers page");
    }
    const { fixtureOutput } = await import("./dashboard-helpers.js");
    return fixtureOutput(directory);
  });
  try {
    const failedId = fixture.companies[1]!.id;
    failId = failedId;
    const okId = fixture.companies[2]!.id;
    assert.equal((await fixture.post("/api/runs", { companyIds: [failedId, okId] })).status, 202);
    const done = await waitForIdle(fixture.base);
    const failed = done.runs[0].items.find((item: { companyId: string }) => item.companyId === failedId);
    const ok = done.runs[0].items.find((item: { companyId: string }) => item.companyId === okId);
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /Timeout while loading careers page/);
    assert.equal(done.companies.find((company: { id: string }) => company.id === failedId).status, "failed");
    // A failed company contributes zero exported records even with partial data.
    assert.equal(done.companies.find((company: { id: string }) => company.id === failedId).hasOutput, false);
    assert.equal(done.stats.failed, 1);
    // Isolation: each company's log stream contains only its own lines.
    assert.ok(failed.logs.some((line: { message: string }) => line.message.includes("Timeout while loading")));
    assert.ok(failed.logs.some((line: { message: string }) => line.message.includes("partial work")));
    assert.ok(ok.logs.every((line: { message: string }) => !line.message.includes("partial work") || line.message.includes(okId)));
    const terminal = await (await fetch(`${fixture.base}/api/runs/${done.runs[0].id}/items/${failedId}/logs`)).json();
    assert.equal(terminal.status, "failed");
    assert.ok(terminal.logs.some((line: { message: string }) => line.message.includes("Timeout while loading")));
    assert.ok(terminal.metrics && terminal.metrics.stage === "FAILED", JSON.stringify(terminal.metrics));
    const persisted = JSON.parse(await readFile(join(fixture.root, "output/_tracking/ui-state.json"), "utf8"));
    assert.ok(persisted.runs[0].items.every((item: { logs: unknown[] }) => Array.isArray(item.logs)));
  } finally { await fixture.close(); }
});
