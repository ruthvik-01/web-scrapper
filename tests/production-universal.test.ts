import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { scrapeAll, scrapeCompany, scrapePlatform, scrapeAllCompanies } from "../universal.js";
import { runContext, companyContext, paceOrigin, fetchWithRetries, currentSignal } from "../src/universal-runtime.js";
import type { UniversalCompany } from "../src/companies.js";
import type { PlatformEngine } from "../src/platforms.js";
import { dateWindow } from "../src/normalize.js";
import { dashboardFixture } from "./dashboard-helpers.js";
import { AccessPolicy } from "../src/crawl.js";
import { runUniversalCli } from "../universal.js";

const configs = Array.from({ length: 4 }, (_, i): UniversalCompany => ({
  name: `Example ${i}`, slug: `production-fixture-${i}`, platform: "comeet", country: "UK", careersUrl: `https://example.org/jobs/${i}`,
}));
const collected: PlatformEngine = async (company, options) => {
  const now = options.now || new Date();
  return { rows: [], rawJobs: [{ jobId: "source-1", jobUrl: `https://example.org/${company.slug}/1`, company: company.name,
    title: "Software Engineer", description: "Build reliable software services. Collaborate with the team, review code and investigate production defects.",
    postedDate: now.toISOString().slice(0, 10), locations: [{ city: "London", country: "UK" }] }],
    report: { sourceUrl: company.careersUrl, scrapedAt: now.toISOString(), process: company.platform, status: "ok", candidates: 1,
      window: dateWindow(now), issues: [], skipped: [], limited: false } };
};
const quiet = { logger: () => {} };
test("bounded workers preserve config ordering and isolate engine and persistence failures", async () => {
  let active = 0, peak = 0;
  const engine: PlatformEngine = async (company, options) => {
    active++; peak = Math.max(peak, active);
    try { await delay(company.slug.endsWith("0") ? 35 : 15); if (company.slug.endsWith("1")) throw new Error("source unavailable"); return await collected(company, options); }
    finally { active--; }
  };
  const result = await scrapeAllCompanies(configs, { ...quiet, concurrency: 2 }, { comeet: engine }, async company => {
    if (company.slug.endsWith("2")) throw new Error("disk unavailable");
  });
  assert.equal(peak, 2); assert.equal(result.length, 4);
  assert.deepEqual(result.map(job => job.report.status), ["ok", "failed", "failed", "ok"]);
  assert.equal(result[2]!.report.exportReady, false);
});
test("company timeout cancels work and lets queued companies finish", async () => {
  let aborted = false;
  const engine: PlatformEngine = async (company, options) => {
    if (company.slug.endsWith("0")) {
      try { await delay(1000, undefined, { signal: currentSignal() }); }
      catch { aborted = true; throw new Error("request aborted"); }
    }
    return collected(company, options);
  };
  const result = await scrapeAllCompanies(configs.slice(0, 2), { ...quiet, concurrency: 1, companyTimeoutMs: 15 }, { comeet: engine });
  assert.equal(aborted, true); assert.equal(result[0]!.report.status, "failed"); assert.equal(result[1]!.report.status, "ok");
  assert.match(result[0]!.report.issues[0]!.message, /timeout|deadline/i);
});
test("run deadline stops queued dispatch and isolates in-flight work", async () => {
  let called = 0;
  const result = await scrapeAllCompanies(configs, { ...quiet, concurrency: 1, runTimeoutMs: 15 }, { comeet: async (company, options) => {
    called++; await delay(1000, undefined, { signal: currentSignal() }); return collected(company, options);
  } });
  assert.equal(called, 1); assert.ok(result.every(item => item.report.status === "blocked"));
});
test("real transport aborts a timed-out company's robots request without poisoning the next company", async () => {
  const original = globalThis.fetch; let robots = 0, aborted = false;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith("/robots.txt") && ++robots === 1) {
      try { await delay(1000, undefined, { signal: options?.signal || undefined }); }
      catch (error) { aborted = true; throw error; }
    }
    return new Response("");
  };
  try {
    const results = await scrapeAllCompanies(configs.slice(0, 2), { ...quiet, concurrency: 1, companyTimeoutMs: 20 }, { comeet: async (company, options) => {
      await new AccessPolicy(0, 1000).html(company.careersUrl); return collected(company, options);
    } });
    assert.equal(aborted, true); assert.equal(robots, 2);
    assert.deepEqual(results.map(result => result.report.status), ["failed", "ok"]);
    assert.equal(results[0]!.report.retries, 0);
  } finally { globalThis.fetch = original; }
});
test("origin throttling is shared across company scopes", async () => {
  const times: number[] = [];
  await runContext(1000, undefined, async () => {
    const pending = Promise.all([0, 1, 2].map(() => companyContext(500, async () => {
      await paceOrigin("https://example.org/jobs", 20); times.push(Date.now());
    })));
    const until = Date.now() + 60;
    while (Date.now() < until) { /* Simulate an event-loop stall: timers must not release a burst. */ }
    await pending;
  });
  assert.ok(times[1]! - times[0]! >= 15); assert.ok(times[2]! - times[1]! >= 15);
});
test("central retry retries transient responses but not permanent errors, and aborts deadlines", async () => {
  const original = globalThis.fetch;
  try {
    let requests = 0;
    globalThis.fetch = async () => { requests++; return requests < 3 ? new Response("", { status: 503, headers: { "Retry-After": "0" } }) : new Response("ok"); };
    assert.equal(await (await fetchWithRetries("https://example.org", {}, 1000)).text(), "ok"); assert.equal(requests, 3);
    requests = 0; globalThis.fetch = async () => { requests++; return new Response("", { status: 403 }); };
    assert.equal((await fetchWithRetries("https://example.org", {}, 1000)).status, 403); assert.equal(requests, 1);
    globalThis.fetch = async (_input, options) => { await delay(1000, undefined, { signal: options?.signal || undefined }); return new Response(""); };
    await assert.rejects(runContext(1000, undefined, () => companyContext(15, () => fetchWithRetries("https://example.org", {}, 1000))), /timeout|deadline/i);
  } finally { globalThis.fetch = original; }
});
test("one entry API selects multiple companies and platforms; repeated runs have safe unique manifests", async () => {
  const out = await mkdtemp(join(tmpdir(), "production-universal-"));
  try {
    const registry: any = { comeet: collected, eploy: collected, jobtrain: collected, wordpress: collected, custom: collected, reed: collected, haystack: collected, tribepad: collected, jobadder: collected, portobello: collected, occy: collected, supabase: collected, jobtoday: collected };
    const first = await scrapeCompany(["Aqua Security", "blockaid", "aquasec"], { ...quiet, out, concurrency: 2 }, registry);
    const second = await scrapeCompany("aquasec", { ...quiet, out }, registry);
    assert.equal(first.manifest.expectedCompanies, 2); assert.equal(first.manifest.complete, true);
    assert.equal(first.manifest.successfulCompanies, 2); assert.equal(first.manifest.totalJobs, 2);
    assert.notEqual(first.manifest.runId, second.manifest.runId);
    assert.equal((await readdir(out)).length, 2);
    assert.equal(JSON.parse(await readFile(join(first.directory!, "manifest.json"), "utf8")).complete, true);
    assert.equal((await scrapePlatform("jobtrain", { ...quiet, writeOutput: false }, registry)).manifest.expectedCompanies, 1);
    assert.equal((await scrapeAll({ ...quiet, writeOutput: false }, registry)).manifest.expectedCompanies, 75);
    await assert.rejects(scrapeCompany("nonexistent-company-slug", { ...quiet, out }, registry), /unknown/i);
    await assert.rejects(scrapeAll({ ...quiet, concurrency: 45, out }, registry), /concurrency/i);
  } finally { await rm(out, { recursive: true, force: true }); }
});
test("partial manifests record failures and prevent aggregate publication/download", async () => {
  const fixture = await dashboardFixture();
  try {
    const run = await scrapeCompany(["aquasec", "blockaid"], { ...quiet, out: join(fixture.root, "output") }, { comeet: async (company, options) => {
      if (company.slug === "blockaid") throw new Error("HTTP 503"); return collected(company, options);
    } });
    assert.equal(run.manifest.complete, false); assert.equal(run.manifest.failedCompanies, 1);
    assert.equal(JSON.parse(await readFile(join(run.directory!, "failures.json"), "utf8")).length, 1);
    await assert.rejects(readFile(join(run.directory!, "companies.csv")), /ENOENT/);
    // Simulate interrupted publication: files alone never make this run complete.
    await writeFile(join(run.directory!, "companies.csv"), "partial");
    await writeFile(join(run.directory!, "companies.json"), "[]");
    const deliveries = await (await fetch(`${fixture.base}/api/deliveries`)).json();
    assert.ok(!deliveries.deliveries.some((delivery: { name: string }) => delivery.name === run.manifest.runId));
    assert.equal((await fetch(`${fixture.base}/api/deliveries/${run.manifest.runId}/companies.csv`)).status, 404);
  } finally { await fixture.close(); }
});
test("repeatable company CLI uses the same manifest workflow and releases only in-memory raw evidence", async () => {
  const out = await mkdtemp(join(tmpdir(), "production-cli-"));
  try {
    assert.equal(await runUniversalCli(["--company", "aquasec", "--company", "blockaid", "--out", out, "--concurrency", "2"], { comeet: collected }), 0);
    const directory = join(out, (await readdir(out))[0]!);
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    assert.equal(manifest.expectedCompanies, 2); assert.equal(manifest.concurrency, 2); assert.equal(manifest.complete, true);
    const stored = JSON.parse(await readFile(join(directory, "aquasec/scrape-result.json"), "utf8"));
    assert.equal(stored.rawJobs.length, 1);
    const api = await scrapeCompany("aquasec", { ...quiet, writeOutput: false, retainRawJobs: false }, { comeet: collected });
    assert.equal(api.results[0]!.rawJobs.length, 0); assert.equal(api.summary[0]!.jobsFound, 1);
  } finally { await rm(out, { recursive: true, force: true }); }
});
test("validation conflicts preserve fetched source evidence without publishing invalid rows", async () => {
  const out = await mkdtemp(join(tmpdir(), "production-conflict-"));
  try {
    const run = await scrapeCompany("aquasec", { ...quiet, out }, { comeet: async (company, options) => {
      const source = await collected(company, options);
      source.rawJobs.push({ ...source.rawJobs[0]!, description: "Different source duties. Deliver operational services, maintain systems and coordinate work with the engineering team.",
        locations: [{ city: "Manchester", country: "UK" }] });
      return source;
    } });
    assert.equal(run.manifest.complete, false); assert.equal(run.results[0]!.report.status, "failed");
    assert.equal(run.results[0]!.rawJobs.length, 2); assert.equal(run.results[0]!.rows.length, 0);
    assert.match(run.results[0]!.report.issues[0]!.message, /Conflicting.*description/);
    const stored = JSON.parse(await readFile(join(run.directory!, "aquasec/scrape-result.json"), "utf8"));
    assert.equal(stored.rawJobs.length, 2);
    await assert.rejects(readFile(join(run.directory!, "companies.csv")), /ENOENT/);
  } finally { await rm(out, { recursive: true, force: true }); }
});
