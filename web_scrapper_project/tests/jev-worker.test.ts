import assert from "node:assert/strict";
import { test } from "node:test";
import { toParentRows } from "../server/jev-worker.js";

test("toParentRows maps jev rows onto the 15-column parent contract", () => {
  const rows = [
    {
      jobId: "5039", title: "Teacher of Maths", description: "Teach maths.", jobUrl: "https://x/vacancies/5039",
      postedDate: "2026-09-10", jdDeadline: "2026-09-30", company: "Compass Schools",
      salaryRange: "£22,366 - £37,468", employmentType: "Full-time", worktype: "On-site",
      location: "Leicester", city: "Leicester", state: "Leicestershire", country: "UK",
      jevConfidence: "0.93", judged: "jev", ats: "Custom",
    },
    {
      jobId: "x1", title: "T", description: "", jobUrl: "u", postedDate: "", jdDeadline: "",
      company: "", salaryRange: "", employmentType: "", worktype: "", location: "",
      city: "", state: "", country: "", jevConfidence: "", judged: "deterministic", ats: "Custom",
    },
  ];
  const mapped = toParentRows(rows, "Compass Schools") as Record<string, string>[];
  assert.equal(Object.keys(mapped[0]!).length, 15);
  // Contract: the exported CSV always uses the parent's Custom tag.
  assert.equal(mapped[0]!.ats, "Custom");
  assert.equal(mapped[1]!.ats, "Custom");
  assert.equal(mapped[0]!.company, "Compass Schools");
  // Extra jev columns (jevConfidence, judged) must not leak into the export.
  assert.equal(mapped[0]!.jevConfidence, undefined);
});
