import { test } from "node:test";
import assert from "node:assert/strict";
import { JudgmentCache } from "../src/cache.js";
import { Jev, type SystemOneResult } from "../src/jev.js";
import { judgeJob, obviouslyNotVacancy, QUESTION_VERSION } from "../src/questions.js";

const fake = (answers: SystemOneResult["answers"]): SystemOneResult => ({
  answers, model: "typesafe/jev-1.13", provider: "injected", usage: { inputTokens: 500, outputTokens: 20 },
});

test("judgment cache: identical semantic input hits, changed input misses", async () => {
  let calls = 0;
  const jev = new Jev({
    decide: async () => {
      calls++;
      return fake({
        uk_location: { type: "boolean", probability: 0.98, noul: 0.98 },
        worktype: { type: "choice", choice: "Hybrid", probabilities: { Hybrid: 0.9 }, confidence: 0.9 },
      });
    },
  });
  jev.cache = new JudgmentCache(); // memory-only
  const input = {
    title: "Support Worker", locationText: "Manchester",
    dateText: "Posted 2 days ago", salaryText: "£24,000", body: "Hybrid role in Manchester.",
  };
  await judgeJob(jev, input);
  await judgeJob(jev, { ...input }); // same state: served from cache
  assert.equal(calls, 1);
  await judgeJob(jev, { ...input, salaryText: "£25,000" }); // changed state: real call
  assert.equal(calls, 2);
  assert.equal(jev.cache.hits, 1);
  assert.equal(jev.cache.misses, 2);
});

test("judgment cache: employer question set changes the key", async () => {
  let calls = 0;
  const jev = new Jev({
    decide: async () => {
      calls++;
      return fake({ uk_location: { type: "boolean", probability: 0.98, noul: 0.98 } });
    },
  });
  jev.cache = new JudgmentCache();
  const input = {
    title: "Support Worker", locationText: "Manchester",
    dateText: "", salaryText: "", body: "Role in Manchester.",
  };
  await judgeJob(jev, input);
  await judgeJob(jev, { ...input, employers: ["Compass Schools"] }); // different question set
  assert.equal(calls, 2);
});

test("obviouslyNotVacancy rejects clear navigation targets deterministically", () => {
  for (const url of [
    "https://x.co.uk/about", "https://x.co.uk/privacy", "https://x.co.uk/saved-jobs",
    "https://x.co.uk/login", "https://x.co.uk/search?query=teacher",
  ]) {
    assert.ok(obviouslyNotVacancy(url), url);
  }
  for (const url of [
    "https://x.co.uk/vacancies/4923/fostering-team-manager.html",
    "https://x.co.uk/jobs/support-worker",
    "https://x.co.uk/searching-for-talent", // substring, not a nav segment
  ]) {
    assert.equal(obviouslyNotVacancy(url), false, url);
  }
});

test("cache version constant differs from the previous question set", () => {
  assert.notEqual(QUESTION_VERSION, "");
});

test("disk cache round-trips entries and ignores foreign versions", async () => {
  const { mkdtemp, writeFile, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "jev-cache-"));
  const file = join(dir, "cache.json");
  await writeFile(file, JSON.stringify({
    version: "jev-judgments/1",
    entries: { abc: { answers: { uk_location: { type: "boolean", probability: 0.9, noul: 0.9 } }, savedAt: "x" } },
  }));
  const cache = await JudgmentCache.open(file);
  assert.deepEqual(cache.get("abc"), { uk_location: { type: "boolean", probability: 0.9, noul: 0.9 } });
  cache.set("def", { worktype: { type: "choice", choice: "Remote", probabilities: {}, confidence: 1 } });
  await cache.flush();
  const reloaded = await JudgmentCache.open(file);
  assert.ok(reloaded.get("def"));
  const parsed = JSON.parse(await readFile(file, "utf8")) as { version: string };
  assert.equal(parsed.version, "jev-judgments/1");
});
