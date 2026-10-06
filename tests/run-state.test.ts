import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { dashboardFixture, waitForIdle } from "./dashboard-helpers.js";

test("dashboard stays active until the final state snapshot is persisted", async t => {
  const originalRename = fsPromises.rename;
  let release!: () => void;
  let reached!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const writing = new Promise<void>(resolve => { reached = resolve; });
  const patch = t.mock.method(fsPromises, "rename", async (from: string, to: string) => {
    if (String(from).endsWith("ui-state.json.tmp")) {
      const snapshot = JSON.parse(await readFile(from, "utf8"));
      if (snapshot.runs?.[0]?.status === "completed") { reached(); await blocked; }
    }
    return originalRename(from, to);
  });
  syncBuiltinESMExports();
  const fixture = await dashboardFixture();
  try {
    await fixture.post("/api/runs", { companyIds: [fixture.companies[1]!.id] });
    await writing;
    const data = await (await fetch(`${fixture.base}/api/dashboard`)).json();
    assert.ok(data.activeRun, "The dashboard must not announce idle while its final disk write is pending");
  } finally {
    release();
    await fixture.close();
    patch.mock.restore();
    syncBuiltinESMExports();
  }
});

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

test("dashboard keeps a zero-row source report visible and blocks its CSV", async () => {
  const fixture = await dashboardFixture(async (company, directory) => {
    await mkdir(directory, { recursive: true });
    const report = {
      company: company.name, status: "no_matches", process: "STATIC", scrapedAt: "2026-09-15T12:00:00Z",
      rows: 0, exportReady: false, qualityPassed: true, quality: {},
      window: { from: "2026-07-15", to: "2026-09-15" }, skipped: [{ jobUrl: "https://company.example/job/1", title: "", reason: "missing_details" }],
      issues: [], dataNotes: [], dateFallbacks: [],
    };
    await writeFile(join(directory, "export-rows.json"), "[]");
    await writeFile(join(directory, "scrape-report.json"), JSON.stringify(report));
    return { company: company.name, status: "no_matches", process: "STATIC", scrapedAt: report.scrapedAt,
      jobs: 0, locationRows: 0, reviewNotes: 0, postingDateFallbacks: 0, exportReady: false };
  });
  try {
    const id = fixture.companies[1]!.id;
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] })).status, 202);
    const done = await waitForIdle(fixture.base);
    const company = done.companies.find((entry: { id: string }) => entry.id === id);
    assert.equal(company.status, "no-jobs");
    assert.equal(company.hasOutput, true);
    const results = await (await fetch(`${fixture.base}/api/companies/${id}/results`)).json();
    assert.equal(results.report.skipped[0].reason, "missing_details");
    assert.equal(results.total, 0);
    const csv = await fetch(`${fixture.base}/api/companies/${id}/download?kind=csv`);
    assert.equal(csv.status, 409);
  } finally { await fixture.close(); }
});

test("dashboard shows validation failures and withholds an unsafe CSV", async () => {
  const fixture = await dashboardFixture(async (company, directory) => {
    await mkdir(directory, { recursive: true });
    const row = { jobId: "dup", title: "Engineer", description: "Build and maintain software.", jobUrl: "https://company.example/job/1", postedDate: "2026-09-01", jdDeadline: "", company: company.name, salaryRange: "", employmentType: "", worktype: "", location: "London, England, UK", city: "London", state: "England", country: "UK", ats: "Custom" };
    const quality = { duplicateJobIds: 1, duplicateJobUrls: 0, missingJobIds: 0, nonUkJobs: 0, contaminatedDescriptions: 0, titleOnlyDescriptions: 0, salaryBenefits: 0, nonAnnualSalary: 0, invalidUrls: 0, invalidPostingDates: 0, locationFailures: 0 };
    const report = { company: company.name, status: "partial", process: "STATIC", scrapedAt: "2026-09-15T12:00:00Z", rows: 1, exportReady: false, qualityPassed: false, quality, window: { from: "2026-07-15", to: "2026-09-15" }, skipped: [], issues: [], dataNotes: [], dateFallbacks: [] };
    await writeFile(join(directory, "export-rows.json"), JSON.stringify([row]));
    await writeFile(join(directory, "scrape-report.json"), JSON.stringify(report));
    return { company: company.name, status: "partial", process: "STATIC", scrapedAt: report.scrapedAt, jobs: 1, locationRows: 1, reviewNotes: 0, postingDateFallbacks: 0, exportReady: false, quality };
  });
  try {
    const id = fixture.companies[1]!.id;
    assert.equal((await fixture.post("/api/runs", { companyIds: [id] })).status, 202);
    const done = await waitForIdle(fixture.base);
    const company = done.companies.find((entry: { id: string }) => entry.id === id);
    assert.equal(company.status, "needs-review");
    assert.equal(company.hasOutput, true);
    const results = await (await fetch(`${fixture.base}/api/companies/${id}/results`)).json();
    assert.equal(results.report.quality.duplicateJobIds, 1);
    assert.equal(results.rows.length, 1);
    const csv = await fetch(`${fixture.base}/api/companies/${id}/download?kind=csv`);
    assert.equal(csv.status, 409);
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
