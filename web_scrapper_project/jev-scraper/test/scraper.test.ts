import { test } from "node:test";
import assert from "node:assert/strict";
import { Jev, type SystemOneResult } from "../src/jev.js";
import { judgeJob, choiceValue, boolValue } from "../src/questions.js";
import { parseSalary, isUkCountry } from "../src/normalize.js";
import { dateWindow } from "../src/dates.js";

const fake = (answers: SystemOneResult["answers"]): SystemOneResult => ({
  answers, model: "typesafe/jev-1.13", provider: "injected", usage: { inputTokens: 500, outputTokens: 20 },
});

test("Jev uses an injected decide function and accumulates stats", async () => {
  const jev = new Jev({
    decide: async () => fake({
      uk_location: { type: "boolean", probability: 0.98, noul: 0.98 },
      worktype: { type: "choice", choice: "Hybrid", probabilities: { Hybrid: 0.9 }, confidence: 0.9 },
    }),
  });
  const { answers } = await judgeJob(jev, {
    title: "Support Worker", locationText: "Manchester",
    dateText: "Posted 2 days ago", salaryText: "£24,000", body: "Hybrid role in Manchester.",
  });
  assert.equal(boolValue(answers, "uk_location")?.probability, 0.98);
  assert.equal(choiceValue(answers, "worktype")?.choice, "Hybrid");
  assert.equal(jev.requests, 1);
  assert.equal(jev.inputTokens, 500);
  assert.ok(jev.stats().estimatedCostUsd > 0);
});

test("parseSalary extracts annual £ range and rejects hourly/DOE", () => {
  assert.deepEqual(parseSalary("£42,500 - £45,000 per annum"), {
    range: "£42500-£45000", kind: "annual", text: "£42,500 - £45,000 per annum",
  });
  assert.equal(parseSalary("£12.50 per hour").kind, "hourly");
  assert.equal(parseSalary("Competitive salary, d.o.e").kind, "doe");
  assert.equal(parseSalary("").kind, "none");
});

test("isUkCountry recognises nations and UK synonyms", () => {
  assert.ok(isUkCountry("England"));
  assert.ok(isUkCountry("United Kingdom"));
  assert.ok(!isUkCountry("Canada"));
  assert.ok(!isUkCountry(""));
});

test("dateWindow returns a two-month ISO window", () => {
  const { from, to } = dateWindow(new Date("2026-09-19T12:00:00Z"));
  assert.equal(to, "2026-09-19");
  assert.equal(from, "2026-07-19");
});

test("provider fallback: a hard Jev failure switches to the next provider", async () => {
  const attempted: string[] = [];
  const jev = new Jev({
    providers: [
      { name: "openrouter", endpoint: "test://openrouter", model: "typesafe/jev-1.13", apiKey: "test" },
      { name: "vercel", endpoint: "test://vercel", model: "typesafe-ai/jev", apiKey: "test" },
    ],
    decide: async (_body: unknown, provider) => {
      attempted.push(provider.name);
      // The first provider is rate-limited; the fallback must serve the answer.
      if (provider.name === "openrouter") {
        throw new Error("Jev HTTP 429 via openrouter: Free tier requests are rate-limited.");
      }
      return fake({
        uk_location: { type: "boolean", probability: 0.97, noul: 0.97 },
        worktype: { type: "choice", choice: "Hybrid", probabilities: { Hybrid: 0.9 }, confidence: 0.9 },
      });
    },
  });
  const { answers } = await judgeJob(jev, {
    title: "Support Worker", locationText: "Manchester",
    dateText: "Posted 2 days ago", salaryText: "£24,000", body: "Hybrid role in Manchester.",
  });
  assert.deepEqual(attempted, ["openrouter", "vercel"]);
  assert.equal(boolValue(answers, "uk_location")?.probability, 0.97);
  assert.equal(choiceValue(answers, "worktype")?.choice, "Hybrid");
  // Once a provider is exhausted, later calls go straight to the fallback.
  await judgeJob(jev, {
    title: "Second role", locationText: "Leeds",
    dateText: "", salaryText: "", body: "Hybrid role.",
  });
  assert.equal(attempted.at(-1), "vercel");
  assert.equal(jev.active, "vercel");
});

test("parseDate parses ISO, written, dd/mm/yyyy and relative dates", async () => {
  const { parseDate } = await import("../src/dates.js");
  const now = new Date("2026-09-19T12:00:00Z");
  assert.equal(parseDate("2026-09-10", now), "2026-09-10");
  assert.equal(parseDate("10 September 2026", now), "2026-09-10");
  assert.equal(parseDate("10/09/2026", now), "2026-09-10");
  assert.equal(parseDate("2 days ago", now), "2026-09-17");
  assert.equal(parseDate("not a date", now), "");
  assert.equal(parseDate("", now), "");
});
