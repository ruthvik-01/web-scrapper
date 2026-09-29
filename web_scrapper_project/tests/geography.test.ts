import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJobs } from "../src/extract.js";
import { Geography, type GeoLookup } from "../src/geography.js";
import { normalizeJobs, type RawJob } from "../src/normalize.js";
import { outputRows } from "../src/output.js";

const now = new Date("2026-09-15T12:00:00Z");
const place = (name: string, county: string, country = "England") => ({
  name_1: name, local_type: "Town", county_unitary: county, country,
});
const lookup: GeoLookup = async url => {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith("/postcodes/")) {
    if (parsed.pathname.includes("ME2")) return { result: { country: "England", outcode: "ME2", admin_district: "Medway" } };
    return { result: { country: parsed.pathname.includes("BAD") ? "Canada" : "England", admin_district: "Tameside" } };
  }
  const records: Record<string, unknown[]> = {
    Hattersley: [place("Hattersley", "Tameside")],
    Elgin: [place("Elgin", "Moray", "Scotland")],
    "Merthyr Tydfil": [place("Merthyr Tydfil", "Merthyr Tydfil", "Wales")],
    Chatham: [place("Chatham", "Medway")],
    Leamington: [place("Leamington Hastings", "Warwickshire"), place("Royal Leamington Spa", "Warwickshire")],
    Reading: [place("Reading", "Reading")],
    London: [place("London", "Greater London")],
    Portsmouth: [{ ...place("Portsmouth", "Portsmouth"), local_type: "City" }],
    Falmer: [place("Falmer", "East Sussex")],
    Atherton: [place("Atherton", "Wigan")],
    Bangor: [place("Bangor", "Gwynedd", "Wales")],
    Strood: [
      { ...place("Strood", "Medway"), outcode: "ME2", local_type: "Suburban Area" },
      { ...place("Strood", "Kent"), outcode: "TN17", local_type: "Hamlet" },
    ],
  };
  return { result: records[parsed.searchParams.get("q") || ""] || [] };
};
const base: RawJob = {
  jobId: "1", title: "Engineer", description: "Build", jobUrl: "https://example.com/vacancies/1/engineer.html",
  postedDate: "2026-09-08", ats: "Eploy", locations: [{ city: "Preston", state: "Lancashire", country: "GB" }],
};

test("role-labelled postcode verifies UK without using unrelated contact addresses or overriding foreign country", async () => {
  const geo = new Geography(lookup);
  const job = {...base, locations:[{}], visibleLocation:"Named depot",
    roleDescription:"Role: Driver\nLocation: Named depot, SO30 2PA\nDuties: Collections."};
  const fixed = await geo.resolve(job);
  assert.equal(fixed.locations[0]!.country,"UK");
  assert.equal(fixed.locations[0]!.city,"");
  assert.equal(geo.evidence[0]!.sourceLocations[0]!.postcode,"SO30 2PA");
  assert.deepEqual(job.locations,[{}]);
  const contact = await new Geography(lookup).resolve({...job,roleDescription:"Role: Driver\nContact head office: SO30 2PA"});
  assert.equal(normalizeJobs([contact],now).rows.length,0);
  const invalid = await new Geography(async () => ({result:null})).resolve(job);
  assert.equal(normalizeJobs([invalid],now).rows.length,0);
  const foreign = await new Geography(lookup).resolve({...job,locations:[{country:"Canada"}]});
  assert.equal(normalizeJobs([foreign],now).rows.length,0);
});

test("MWH 3440/3492/3493: visible Hattersley replaces conflicting Preston address", async () => {
  const fixed = await new Geography(lookup).resolve({ ...base, visibleLocation: "Hattersley" });
  const row = normalizeJobs([fixed], now).rows[0]!;
  assert.equal(row.location, "Hattersley, Tameside, UK");
  assert.equal(row.city, "Hattersley");
  assert.equal(row.state, "Tameside");
});

test("Walkers 166 and Alzheimer's 4153: preserve real visible job city, not HQ", async () => {
  for (const [label, expectedState] of [["Elgin", "Moray"], ["Merthyr Tydfil", "Merthyr Tydfil"]]) {
    const fixed = await new Geography(lookup).resolve({ ...base, visibleLocation: label });
    const row = normalizeJobs([fixed], now).rows[0]!;
    assert.equal(row.city, label);
    assert.equal(row.state, expectedState);
  }
});

test("Guide Dogs 1027: Leamington and Reading become two rows with identical shared fields", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, jobId: "1027", visibleLocation: "Leamington, Reading", locations: [{ country: "United Kingdom" }],
  });
  const normalized = normalizeJobs([fixed], now);
  assert.deepEqual(normalized.rows.map(row => row.city), ["Leamington", "Reading"]);
  const rows = outputRows({ rows: normalized.rows, report: {
    process: "STATIC + API", status: "ok", candidates: 1, window: { from: "2026-07-15", to: "2026-09-15" },
    skipped: [], issues: [], limited: false,
  } });
  for (const field of Object.keys(rows[0]!) as (keyof typeof rows[0])[]) {
    if (!["location", "city", "state"].includes(field)) assert.equal(rows[0]![field], rows[1]![field]);
  }
});

test("TSAT 1848: UK postcode resolves missing country; county is not a second location", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Chatham, Kent",
    locations: [{ city: "Chatham", state: "Kent", country: "", postcode: "ME4 6NR" }],
  });
  const rows = normalizeJobs([fixed], now).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.city, "Chatham");
  assert.equal(rows[0]!.state, "Kent");
  assert.equal(rows[0]!.country, "UK");
});

test("MWH 3462: a job-specific verified postcode establishes UK country", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Hattersley",
    locations: [{ city: "Hattersley", state: "Greater Manchester", country: "", postcode: "SK14 3QU" }],
  });
  assert.equal(normalizeJobs([fixed], now).rows.length, 1);
});

test("a city stored in addressRegion is not discarded as a county facet", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Portsmouth",
    locations: [{ city: "North End", state: "Portsmouth", country: "", postcode: "PO2 0NH" }],
  });
  assert.equal(normalizeJobs([fixed], now).rows[0]!.city, "Portsmouth");
});

test("UK-only gazetteer lookup must not turn ambiguous London/Ontario into a UK job", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "London", locations: [{ city: "London", state: "Ontario", country: "" }],
  });
  assert.equal(normalizeJobs([fixed], now).rows.length, 0);
  const foreign = await new Geography(lookup).resolve({
    ...base, visibleLocation: "London", locations: [{ city: "London", country: "Canada" }],
  });
  assert.equal(normalizeJobs([foreign], now).rows.length, 0);
});

test("remote/nationwide roles must not inherit a headquarters city", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Home Based", locations: [{ city: "London", state: "London", country: "UK" }],
  });
  const row = normalizeJobs([fixed], now).rows[0]!;
  assert.equal(row.city, "");
  assert.equal(row.state, "");
});

test("Tower Hamlets work-arrangement labels retain job-specific address geography without place searches", async () => {
  for (const label of ["Hybrid", "Office", "Office-based", "Community", "Community based"]) {
    const geo = new Geography(async url => {
      assert.ok(new URL(url).pathname.startsWith("/postcodes/"), "Work arrangements must not be geocoded as places");
      return {result: {country:"England", admin_district:"Tower Hamlets"}};
    });
    const fixed = await geo.resolve({
      ...base, visibleLocation:label,
      locations:[{city:"London",state:"Greater London",country:"United Kingdom",postcode:"E1 1BJ",street:"Tower Hamlets Town Hall"}],
    });
    const row = normalizeJobs([fixed],now).rows[0]!;
    assert.equal(row.location,"London, Greater London, UK",label);
    assert.equal(geo.evidence[0]!.visibleLocation,label);
    assert.ok(fixed.notes?.some(note=>note.includes("work arrangement")));
  }
});

test("work-arrangement labels never invent an address or override foreign country", async () => {
  for (const label of ["Hybrid", "Community", "Office"]) {
    const geo = new Geography(async () => { throw new Error("No geographic lookup expected"); });
    const missing = await geo.resolve({...base,visibleLocation:label,locations:[{}]});
    assert.equal(normalizeJobs([missing],now).rows.length,0);
    const countryOnly = await geo.resolve({...base,visibleLocation:label,locations:[{country:"UK"}]});
    const row = normalizeJobs([countryOnly],now).rows[0]!;
    assert.equal(row.city,"");
    assert.equal(row.state,"");
    const foreign = await geo.resolve({...base,visibleLocation:label,locations:[{city:"London",country:"Canada"}]});
    assert.equal(normalizeJobs([foreign],now).rows.length,0);
  }
});

test("unresolved areas are preserved and flagged, never fabricated into cities", async () => {
  const fixed = await new Geography(lookup).resolve({ ...base, visibleLocation: "Southern Water" });
  const normalized = normalizeJobs([fixed], now);
  assert.equal(normalized.rows[0]!.location, "UK");
  assert.equal(fixed.locations[0]!.location, "Southern Water");
  assert.equal(normalized.rows[0]!.city, "");
  assert.ok(normalized.dataNotes[0]?.reason.includes("no city guessed"));
});

test("named work sites are not dropped when another city is resolvable", async () => {
  const fixed = await new Geography(lookup).resolve({ ...base, visibleLocation: "Falmer, Testwood WSW" });
  const rows = normalizeJobs([fixed], now).rows;
  assert.deepEqual(rows.map(row => row.location), ["Falmer, East Sussex, UK", "UK"]);
  assert.ok(rows[1]!.description.includes("Testwood WSW"));
  assert.equal(rows[1]!.city, "");
  assert.ok(fixed.notes?.some(note => note.includes("Testwood WSW")));
});

test("travel coverage is not split into phantom job locations", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Atherton, Travel throughout Manchester, Lancashire, Cheshire",
  });
  const rows = normalizeJobs([fixed], now).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.city, "Atherton");
  assert.equal(rows[0]!.location, "Atherton, Wigan, UK");
  assert.ok(rows[0]!.description.includes("Travel throughout"));
});

test("postcode disambiguation distinguishes Strood/Medway from the Kent hamlet", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Kent, Medway, Strood",
    locations: [{ city: "Strood", state: "Kent", postcode: "ME2 2JP", country: "" }],
  });
  const rows = normalizeJobs([fixed], now).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.city, "Strood");
});

test("Northern Ireland context cannot resolve a same-named Welsh place", async () => {
  const fixed = await new Geography(lookup).resolve({
    ...base, visibleLocation: "Bangor", locations: [{ city: "Bangor", state: "Northern Ireland", country: "UK" }],
  });
  const row = normalizeJobs([fixed], now).rows[0]!;
  assert.equal(row.city, "Bangor");
  assert.equal(row.state, "Northern Ireland");
});

test("Eploy reads primary visible location and worktype, ignoring related-job cards and generic benefits", () => {
  const schema = { "@type": "JobPosting", title: "Engineer", description: "Hybrid working available for this role.",
    jobBenefits: "Hybrid Working (Jobs needs dependent)", jobLocation: { address: { addressLocality: "Preston", addressCountry: "GB", postalCode: "PR1 1AA" } } };
  const html = `<a href="https://www.eploy.co.uk">Eploy</a><div id="fcVacancyDetails">
    <span id="ctl_main_VacV_AllLocations_lblReadonlySelected">Hattersley</span>
    <span id="ctl_related_VacV_AllLocations_lblReadonlySelected">Wrong location</span>
    <script type="application/ld+json">${JSON.stringify(schema)}</script></div>`;
  const job = extractJobs(html, base.jobUrl)[0]!;
  assert.equal(job.visibleLocation, "Hattersley");
  assert.equal(job.worktype, "Hybrid");
  assert.equal(job.locations[0]!.postcode, "PR1 1AA");
  const genericOnly = html.replace("Hybrid working available for this role.", "Build software.");
  assert.equal(extractJobs(genericOnly, base.jobUrl)[0]!.worktype, "");
});
