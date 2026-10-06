import test from "node:test";
import assert from "node:assert/strict";
import { loadCompanies, loadHeldCompanies, validateCompanies, selectCompany } from "../src/companies.js";
import type { UniversalCompany } from "../src/companies.js";
import { scrapeUniversalCompany, scrapeAllCompanies } from "../universal.js";
import type { CollectedResult, PlatformEngine } from "../src/platforms.js";
import { dateWindow, type RawJob } from "../src/normalize.js";

const now = new Date("2026-10-05T05:00:00Z");
const company = { name: "Example", slug: "example", careersUrl: "https://www.comeet.com/jobs/example/XX.001/", platform: "comeet" as const, country: "UK" as const };
const raw = (id: string, country = "GB"): RawJob => ({
  jobId: id, title: "Software Engineer", description: "Build and maintain software services. Collaborate with engineers to review code, test applications and investigate production defects.",
  jobUrl: `https://example.org/jobs/${id}`, company: "Source Employer", postedDate: "2026-10-01", locations: [{ city: "London", country }],
});
const collected = (jobs: RawJob[]): CollectedResult => ({ rows: [], rawJobs: jobs, report: {
  sourceUrl: company.careersUrl, scrapedAt: now.toISOString(), process: "fixture", status: "ok", candidates: jobs.length,
  window: dateWindow(now), skipped: [], issues: [], limited: false,
} });
const engine = (result: CollectedResult): PlatformEngine => async () => structuredClone(result);

test("catalog has 75 valid UK configs covering required platforms", async () => {
  const configs = await loadCompanies();
  assert.equal(configs.length, 75);
  assert.equal(configs.filter(c => c.platform === "comeet").length, 30);
  assert.equal(configs.filter(c => c.platform === "eploy").length, 20);
  assert.equal(configs.filter(c => c.platform === "jobtrain").length, 1);
  assert.ok((await loadHeldCompanies()).length >= 0);
  assert.equal((await selectCompany("alice")).slug, "alice");
  await assert.rejects(selectCompany("does-not-exist"), /unknown/i);
});
test("invalid, duplicate and NHS configurations cannot execute", () => {
  assert.throws(() => validateCompanies([company, company]), /unique/i);
  assert.throws(() => validateCompanies([{ ...company, careersUrl: "https://beta.jobs.nhs.uk/candidate/jobadvert/1" }]), /NHS/i);
  assert.throws(() => validateCompanies([{ ...company, platform: "unknown" }]), /platform/i);
  assert.throws(() => validateCompanies([{ ...company, country: "US" }]), /UK/i);
  assert.throws(() => validateCompanies([{ ...company, slug: "../escape" }]), /slug/i);
});
test("universal finishing rejects foreign, unknown and NHS jobs and retains only UK mixed locations", async () => {
  const jobs = [raw("uk"), raw("foreign", "CA"), { ...raw("unknown"), locations: [{ city: "London" }] },
    { ...raw("nhs"), jobUrl: "https://jobs.nhs.uk/candidate/jobadvert/1" },
    { ...raw("mixed"), locations: [{ city: "London", country: "GB" }, { city: "Berlin", country: "DE" }] }];
  const result = await scrapeUniversalCompany(company, { now }, { comeet: engine(collected(jobs)) });
  assert.deepEqual(result.rows.map(row => row.jobId), ["uk", "mixed"]);
  assert.equal(result.report.ukScopeExcluded.length, 1);
  assert.equal(result.report.exportReady, true);
  assert.equal(result.rawJobs.length, 5);
});
test("source employer filtering precedes display rename; fallback metadata cannot establish scope", async () => {
  const config = { ...company, employerNames: ["Allowed"], exportCompanyName: "Display" };
  const jobs = [{ ...raw("allowed"), company: "Allowed" }, raw("other"), { ...raw("missing"), company: undefined }];
  const result = await scrapeUniversalCompany(config, { now }, { comeet: engine(collected(jobs)) });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]!.company, "Display");
  assert.equal(result.rawJobs[0]!.company, "Allowed");
  assert.equal(result.report.scopeExcluded.length, 2);
});
test("verified resolved geography survives finishing but cannot override a foreign country", async () => {
  const jobs = [{ ...raw("resolved"), locations: [{ city: "London", state: "Greater London" }] }, raw("foreign", "CA")];
  const source = collected(jobs);
  source.report.locationEvidence = jobs.map(job => ({ jobId: job.jobId!, jobUrl: job.jobUrl, visibleLocation: "London",
    sourceLocations: job.locations, resolvedLocations: [{ city: "London", state: "Greater London", country: "UK", resolved: true }], notes: [] }));
  const result = await scrapeUniversalCompany(company, { now }, { comeet: engine(source) });
  assert.deepEqual(result.rows.map(row => row.jobId), ["resolved"]);
});
test("partial collection preserves rows and diagnostics but blocks export; empty is no_matches", async () => {
  const source = collected([raw("uk")]); source.report.limited = true;
  const result = await scrapeUniversalCompany(company, { now }, { comeet: engine(source) });
  assert.equal(result.report.status, "partial"); assert.equal(result.report.exportReady, false);
  const empty = await scrapeUniversalCompany(company, { now }, { comeet: engine(collected([])) });
  assert.equal(empty.report.status, "no_matches"); assert.equal(empty.report.exportReady, false);
});
test("sequential batch records failed company and continues", async () => {
  const configs = [company, { ...company, slug: "second" }]; let calls = 0;
  const registry = { comeet: async () => { if (++calls === 1) throw new Error("blocked source"); return collected([raw("uk")]); } };
  const results = await scrapeAllCompanies(configs, { now, concurrency: 1 }, registry);
  assert.equal(results.length, 2); assert.equal(results[0]!.report.status, "failed"); assert.equal(results[1]!.rows.length, 1);
});
test("same vacancy retains two explicit UK bases, source missing dates and annual pay", async () => {
  const job = { ...raw("multi"), postedDate: undefined, salaryRange: "£45000-£50000 per annum", employmentType: "Full-time",
    locations: [{ city: "London", country: "GB" }, { city: "Manchester", country: "GB" }] };
  const result = await scrapeUniversalCompany(company, { now }, { comeet: engine(collected([job])) });
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0]!.postedDate, "");
  assert.equal(result.rows[0]!.salaryRange, "£45000-£50000"); assert.equal(result.rows[0]!.employmentType, "Full-time");
  assert.match(result.rows[0]!.location, /London.*Manchester/);
});
test("source title prefixes enforce scope and collector gets no identity fallback for an employer-scoped board", async () => {
  const config = { ...company, employerNames: ["Allowed"], titlePrefixes: ["School"] };
  const registry = { comeet: async (_company: UniversalCompany, options: { company?: string }) => {
    assert.equal(options.company, undefined);
    return collected([{ ...raw("a"), company: "Allowed", title: "School: Engineer" }, { ...raw("b"), company: "Allowed", title: "Schooling Engineer" }]);
  } };
  const result = await scrapeUniversalCompany(config, { now }, registry);
  assert.deepEqual(result.rows.map(row => row.jobId), ["a"]);
});
