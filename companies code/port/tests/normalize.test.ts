import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLUMNS, canonicalUrl, dateWindow, normalizeJobs, parsePostedDate,
  plainText, subtractMonths, toCsv, ukLocation, type RawJob,
} from "../src/normalize.js";

const now = new Date("2026-09-15T12:00:00Z");
export const sample: RawJob = {
  jobId: "101", title: "Software Engineer", description: "<p>Build <b>software</b>.</p>",
  jobUrl: "https://example.com/jobs/101", postedDate: "2026-08-20", jdDeadline: "2026-10-01",
  company: "ABC Company", salaryRange: "GBP 50000 - 70000 YEAR",
  employmentType: "FULL_TIME", worktype: "Hybrid", ats: "Example",
  locations: [
    { location: "London, England, UK", city: "London", state: "England", country: "GB" },
    { location: "Manchester, England, UK", city: "Manchester", state: "England", country: "GB" },
    { location: "Birmingham, England, UK", city: "Birmingham", state: "England", country: "GB" },
    { location: "New York, NY, US", city: "New York", state: "NY", country: "US" },
  ],
};

test("exact 15 columns; one row per UK location with identical shared fields", () => {
  const { rows, skipped } = normalizeJobs([sample], now);
  assert.equal(rows.length, 3);
  assert.deepEqual(skipped, []);
  assert.deepEqual(rows.map(row => row.city), ["London", "Manchester", "Birmingham"]);
  assert.deepEqual(Object.keys(rows[0]!), [...COLUMNS]);
  for (const row of rows) {
    assert.equal(row.jobId, "101");
    assert.equal(row.country, "UK");
    for (const column of COLUMNS.filter(column => !["location", "city", "state"].includes(column))) {
      assert.equal(row[column], rows[0]![column], column);
    }
  }
});

test("inclusive two-calendar-month window excludes older and future jobs", () => {
  const dates = ["2026-07-14", "2026-07-15", "2026-09-15", "2026-09-16"];
  const result = normalizeJobs(dates.map(postedDate => ({ ...sample, postedDate })), now);
  assert.deepEqual([...new Set(result.rows.map(row => row.postedDate))], ["2026-07-15", "2026-09-15"]);
  assert.equal(result.skipped.length, 1); // Repeated URL/reason is reported once.
  assert.deepEqual(dateWindow(now), { from: "2026-07-15", to: "2026-09-15" });
});

test("month subtraction clamps month-end and handles leap years", () => {
  assert.equal(subtractMonths("2026-04-30", 2), "2026-02-28");
  assert.equal(subtractMonths("2024-04-30", 2), "2024-02-29");
  assert.equal(subtractMonths("2026-01-31", 2), "2025-11-30");
});

test("UK calendar date does not depend on host timezone", () => {
  assert.deepEqual(dateWindow(new Date("2026-09-14T23:30:00Z")), { from: "2026-07-15", to: "2026-09-15" });
  assert.equal(parsePostedDate("2026-07-14T23:30:00Z", now), "2026-07-15");
});

test("supported absolute and exact relative posting dates", () => {
  for (const value of ["2026-07-15", "15/07/2026", "15 July 2026", "July 15, 2026", "2 months ago"]) {
    assert.equal(parsePostedDate(value, now), "2026-07-15", value);
  }
  assert.equal(parsePostedDate("Posted: 3 days ago", now), "2026-09-12");
  assert.equal(parsePostedDate("yesterday", now), "2026-09-14");
  assert.equal(parsePostedDate("today", now), "2026-09-15");
});

test("present ambiguous and invalid dates never become today's date", () => {
  for (const value of ["recently", "30+ days ago", "2026-02-30", "31/04/2026", "invalid"]) {
    assert.equal(parsePostedDate(value, now), "", value);
    assert.equal(normalizeJobs([{ ...sample, postedDate: value }], now).rows.length, 0);
  }
});

test("missing source dates use the run's UK calendar day dynamically and are audited", () => {
  const missing = { ...sample, postedDate: undefined, jdDeadline: undefined };
  const first = normalizeJobs([missing], now);
  const later = normalizeJobs([missing], new Date("2026-10-20T12:00:00Z"));
  assert.equal(first.rows.length, 3);
  assert.ok(first.rows.every(row => row.postedDate === "2026-09-15"));
  assert.ok(later.rows.every(row => row.postedDate === "2026-10-20"));
  assert.deepEqual(first.dateFallbacks, [{ jobId: "101", jobUrl: sample.jobUrl, assignedDate: "2026-09-15" }]);
  assert.equal(normalizeJobs([{ ...sample, postedDate: "2026-06-01" }], now).rows.length, 0);
  assert.equal(normalizeJobs([missing], new Date("2026-09-14T23:30:00Z")).rows[0]!.postedDate, "2026-09-15");
});

test("explicit UK country required; foreign London and Crown Dependencies excluded", () => {
  assert.equal(ukLocation({ location: "London" }), undefined);
  assert.equal(ukLocation({ location: "London, UK", country: "Canada" }), undefined);
  for (const country of ["US", "Ireland", "Jersey", "Guernsey", "Isle of Man"]) {
    assert.equal(ukLocation({ city: "Somewhere", country }), undefined);
  }
  for (const country of ["UK", "U.K.", "GB", "GBR", "United Kingdom"]) {
    assert.equal(ukLocation({ city: "London", country })?.country, "UK");
  }
  assert.equal(ukLocation({ location: "Belfast, Northern Ireland" })?.city, "Belfast");
  assert.equal(ukLocation({ location: "Remote, UK" })?.city, "");
});

test("duplicates are removed without collapsing different vacancies or salaries", () => {
  const one = { ...sample, locations: [sample.locations[0]!] };
  const result = normalizeJobs([one, one, { ...one, jobId: "102" }, { ...one, salaryRange: "GBP 90000 YEAR" }], now);
  assert.equal(result.rows.length, 3);
});

test("generated job IDs stay the same across locations and runs", () => {
  const first = normalizeJobs([{ ...sample, jobId: "" }], now).rows;
  const second = normalizeJobs([{ ...sample, jobId: "" }], now).rows;
  assert.match(first[0]!.jobId, /^generated-/);
  assert.equal(new Set(first.map(row => row.jobId)).size, 1);
  assert.deepEqual(first, second);
});

test("HTML descriptions, CSV escaping, and spreadsheet formula protection", () => {
  assert.equal(plainText("<p>First</p><p>Second &amp; third</p>"), "First\nSecond & third");
  assert.equal(plainText("&lt;p&gt;First&lt;/p&gt;"), "First");
  const rows = normalizeJobs([{ ...sample, title: '=HYPERLINK("bad")', description: "line 1\nline 2, text" }], now).rows;
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("\uFEFF" + COLUMNS.join(",")));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"bad\"\")\""));
  assert.ok(csv.includes('"line 1\nline 2, text"'));
  assert.equal(rows[0]!.title, '=HYPERLINK("bad")');
});

test("URL canonicalization strips only tracking and rejects unsafe protocols", () => {
  assert.equal(canonicalUrl("/jobs/101?utm_source=test&lang=en#apply", "https://example.com"), "https://example.com/jobs/101?lang=en");
  assert.equal(canonicalUrl("javascript:alert(1)"), "");
  assert.equal(canonicalUrl("https://user:password@example.com"), "");
});
