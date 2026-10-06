import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUniversalCli } from "../universal.js";
import { loadCompanies, loadHeldCompanies, selectCompanies, PLATFORMS } from "../src/companies.js";
import type { PlatformEngine } from "../src/platforms.js";
import { dateWindow, COLUMNS } from "../src/normalize.js";
import { dashboardFixture } from "./dashboard-helpers.js";

test("selection defaults to 75 and supports exact case-insensitive name/slug and platform", async () => {
  const companies = await loadCompanies(), held = await loadHeldCompanies();
  assert.equal(selectCompanies(companies, held, {}).length, 75);
  assert.equal(selectCompanies(companies, held, { company: " aqua security " })[0]?.slug, "aquasec");
  assert.equal(selectCompanies(companies, held, { company: "AQUASEC", platform: "comeet" }).length, 1);
  assert.equal(selectCompanies(companies, held, { platform: "comeet" }).length, 30);
  assert.equal(selectCompanies(companies, held, { platform: "eploy" }).length, 20);
  assert.throws(() => selectCompanies(companies, held, { company: "Unknown Company XYZ" }), /unknown/i);
  assert.throws(() => selectCompanies(companies, held, { platform: "unknown_platform" }), /platform/i);
  assert.throws(() => selectCompanies(companies, held, { company: "aquasec", platform: "jobtrain" }), /platform/i);
  assert.throws(() => selectCompanies(companies, held, { company: "aquasec", all: true }), /choose/i);
  assert.throws(() => selectCompanies([...companies, { ...companies[0]!, slug: "other", name: "Aqua Security" }], held, { company: "Aqua Security" }), /ambiguous/i);
});

const engine = (seen: string[], limited = false): PlatformEngine => async (company, options) => {
  seen.push(company.slug); const now = options.now || new Date();
  return { rows: [], rawJobs: ["GB", "DE", ""].map((country, i) => ({
    jobId: `fixture-${i}`, jobUrl: `https://example.org/${company.slug}/jobs/${i}`, title: "Software Engineer",
    description: "Build and maintain software services. Collaborate with engineers, review code, test applications and investigate production defects.",
    postedDate: now.toISOString().slice(0, 10), company: company.name, locations: [{ country, city: "London" }],
  })), report: { sourceUrl: company.careersUrl, scrapedAt: now.toISOString(), process: company.platform,
    status: "ok", candidates: 3, window: dateWindow(now), limited, issues: [], skipped: [] } };
};

test("CLI writes UK-only 15-column company and combined exports for a complete run", async () => {
  const fixture = await dashboardFixture(); const out = join(fixture.root, "output"); const seen: string[] = [];
  try {
    assert.equal(await runUniversalCli(["--company", "Aqua Security", "--out", out], { comeet: engine(seen) }), 0);
    const name = (await readdir(out)).find(name => name.includes("-aquasec-"));
    assert.ok(name, "Single-company output directory must include the company slug.");
    const folder = join(out, name);
    assert.match(folder, /\d{4}-\d{2}-\d{2}-aquasec-/);
    assert.deepEqual(seen, ["aquasec"]);
    const rows = JSON.parse(await readFile(join(folder, "companies.json"), "utf8"));
    assert.equal(rows.length, 1); assert.equal(rows[0].country, "UK");
    assert.deepEqual(Object.keys(rows[0]), [...COLUMNS]);
    assert.equal((await readFile(join(folder, "aquasec/jobs.csv"), "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/)[0], COLUMNS.join(","));
    assert.deepEqual(JSON.parse(await readFile(join(folder, "aquasec/jobs.json"), "utf8")), rows);
    const deliveries = await (await fetch(`${fixture.base}/api/deliveries`)).json();
    assert.deepEqual(deliveries.deliveries.map((delivery: { name: string; rows: number }) => [delivery.name, delivery.rows]), [[name, 1]]);
    const download = await fetch(`${fixture.base}/api/deliveries/${name}/companies.csv`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), (await readFile(join(folder, "companies.csv"), "utf8")).replace(/^\uFEFF/, ""));
  } finally { await fixture.close(); }
});

test("default CLI dispatches all 75 through registry", async () => {
  const out = await mkdtemp(join(tmpdir(), "universal-cli-all-")); const seen: string[] = [];
  try {
    const collector = engine(seen);
    const mockRegistry = Object.fromEntries(
      PLATFORMS.map(p => [p, collector])
    );
    assert.equal(await runUniversalCli(["--out", out], mockRegistry), 0);
    assert.equal(seen.length, 75); assert.equal(new Set(seen).size, 75);
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("partial CLI run blocks combined CSV/JSON and keeps diagnostics; invalid args create no run", async () => {
  const out = await mkdtemp(join(tmpdir(), "universal-cli-partial-"));
  try {
    await assert.rejects(runUniversalCli(["--company", "aquasec", "--out", out, "--max-pages", "0"]), /maxPages/i);
    assert.deepEqual(await readdir(out), []);
    assert.equal(await runUniversalCli(["--company", "aquasec", "--out", out], { comeet: engine([], true) }), 2);
    const folder = join(out, (await readdir(out))[0]!);
    await assert.rejects(readFile(join(folder, "companies.csv")), /ENOENT/);
    await assert.rejects(readFile(join(folder, "companies.json")), /ENOENT/);
    await assert.rejects(readFile(join(folder, "aquasec/jobs.csv")), /ENOENT/);
    assert.equal(JSON.parse(await readFile(join(folder, "aquasec/scrape-report.json"), "utf8")).status, "partial");
  } finally { await rm(out, { recursive: true, force: true }); }
});
