import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import { outputCsv, type OutputRow } from "../src/output.js";

const target = process.argv[2] || "all";
const root = resolve(process.argv[3] || "../output/2026-09-28-main-uk-scrape");
const recovery = resolve(root, "source-cache/mountain-export-rows.json");
const runDate = "2026-09-28";

async function saveCompany(slug: string, name: string, rows: OutputRow[], report: object) {
  const dir = resolve(root, "jobs company wise", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "jobs.csv"), outputCsv(rows));
  await writeFile(resolve(dir, "jobs.json"), JSON.stringify(rows, null, 2));
  await writeFile(resolve(dir, "export-rows.json"), JSON.stringify(rows, null, 2));
  await writeFile(resolve(dir, "scrape-report.json"), JSON.stringify({ company: name, ...report }, null, 2));
}

function compact(text: string) { return text.replace(/\s+/g, " ").trim(); }

let mountainRows: OutputRow[] = [];
let mountain: OutputRow[] = [];
if (target === "all" || target === "mountain-healthcare-ltd") {
mountainRows = JSON.parse(await readFile(recovery, "utf8")) as OutputRow[];
const mountainSource = JSON.parse(await readFile(resolve(root, "source-cache/mountain-scrape-result.json"), "utf8")) as {
  rawJobs: Array<{ jobUrl: string; salaryRange: string }>;
};
const rawByUrl = new Map(mountainSource.rawJobs.map(job => [job.jobUrl, job]));
const hourlyMoved: string[] = [];
for (const source of mountainRows) {
  const id = /-jp-([a-z0-9]+)$/i.exec(source.jobUrl)?.[1];
  if (!id) throw new Error(`Missing Occy ID: ${source.jobUrl}`);
  const text = source.state.trim();
  let place: [string, string];
  if (text === "Carlisle / Barrow / Kendal / Workington") place = ["", ""];
  else if (text === "Penrith, Cumbria") place = ["Penrith", "Cumbria"];
  else if (text === "Stoke-on-Trent Staffordshire") place = ["Stoke-on-Trent", "Staffordshire"];
  else if (text === "Milton Keynes Buckinghamshire") place = ["Milton Keynes", "Buckinghamshire"];
  else if (text === "Salford Surrey") place = ["Salfords", "Surrey"];
  else if (text === "Earley, Reading") place = ["Earley", "Reading"];
  else if (text === "Nottinghamshire") place = ["", "Nottinghamshire"];
  else place = [text, ""];
  let salaryRange = source.salaryRange.replace(/^(£\d+)-\1$/u, "$1");
  let description = source.description.replace(/^null\s*/u, "");
  if (/\bHOUR\b/i.test(rawByUrl.get(source.jobUrl)?.salaryRange || "")) {
    // Occy hourly pay remains in the description with its original pay period.
    salaryRange = "";
    hourlyMoved.push(id);
  }
  if (salaryRange === "£10-£1000000") salaryRange = "";
  if (salaryRange === "£31104") {
    salaryRange = "£31103.80";
    description += "\nSource annual salary: £31,103.80 per year.";
  }
  const [city, state] = place;
  mountain.push({
    ...source,
    jobId: id,
    company: "Mountain Healthcare Ltd",
    employmentType: source.employmentType === "PERMANENT" ? "Permanent" : source.employmentType,
    description,
    salaryRange,
    city,
    state,
    location: text === "Carlisle / Barrow / Kendal / Workington"
      ? "Carlisle / Barrow-in-Furness / Kendal / Workington, United Kingdom"
      : [city, state, "United Kingdom"].filter(Boolean).join(", "),
    country: "United Kingdom",
  });
}
await saveCompany("mountain-healthcare-ltd", "Mountain Healthcare Ltd", mountain, {
  sourceUrl: "https://mountainhealthcare.co.uk/careers/",
  vacancyBoard: "https://app.occy.com/p/jobs/01GX62MRAX06NZZG910C9WC4YE",
  sourceVacancies: mountainRows.length,
  rows: mountain.length,
  hourlyPayMovedToDescription: hourlyMoved,
  notes: ["Source lists 27 positions; the four-city custody role is one vacancy row.", "The board's map iframe generated robots.txt warnings for Google Maps; vacancy pages themselves were read."],
});
}

let northwood: OutputRow[] = [];
let cardCount = 0;
if (target === "all" || target === "northwood-hygiene-products-limited") {
const careersUrl = "https://www.northwood.co.uk/careers/";
const listingResponse = await fetch(careersUrl);
if (!listingResponse.ok) throw new Error(`Northwood listing HTTP ${listingResponse.status}`);
const listing = load(await listingResponse.text());
const cards = listing("a.career-card").toArray().map(element => ({
  url: listing(element).attr("href") || "",
  city: compact(listing(element).find(".career-card__location").text()),
})).filter(card => card.url.startsWith("https://www.northwood.co.uk/career/"));
cardCount = cards.length;
for (const card of cards) {
  const response = await fetch(card.url);
  if (!response.ok) throw new Error(`Northwood vacancy HTTP ${response.status}: ${card.url}`);
  const $ = load(await response.text());
  const jobId = /\bpostid-(\d+)\b/.exec($("body").attr("class") || "")?.[1];
  const title = compact($("h1").first().text());
  const detailCity = compact($(".single-post__meta li.location").first().text());
  const city = detailCity || card.city;
  const deadlineText = compact($(".single-post__meta li.date").first().text());
  const dateText = /Applications close\s+(.+)$/i.exec(deadlineText)?.[1] || "";
  const deadline = dateText ? new Date(`${dateText} 12:00:00 UTC`).toISOString().slice(0, 10) : "";
  const description = $(".body-content").first().find("p,li,h2,h3,h4").toArray()
    .map(element => compact($(element).text())).filter(Boolean).join("\n");
  if (!jobId || !title || !city || !description) throw new Error(`Incomplete Northwood vacancy: ${card.url}`);
  if (deadline && deadline < runDate) continue;
  northwood.push({
    jobId, title, description, jobUrl: card.url,
    postedDate: "",
    jdDeadline: deadline,
    company: "Northwood Hygiene Products Limited",
    salaryRange: "", employmentType: "", worktype: "",
    location: `${city}, United Kingdom`, city, state: "", country: "United Kingdom", ats: "Custom",
  });
}
await saveCompany("northwood-hygiene-products-limited", "Northwood Hygiene Products Limited", northwood, {
  sourceUrl: careersUrl, listed: cards.length, rows: northwood.length,
  notes: ["Job IDs come from the source site's WordPress postid values.", "No role-specific salary or work arrangement was inferred where absent."],
});
}

let mega: OutputRow[] = [];
if (target === "all" || target === "mega-food-centre") {
const pdfSource = JSON.parse(await readFile(resolve(root, "source-cache/mega-extracted-row.json"), "utf8")) as OutputRow[];
const pdfText = pdfSource[0]?.description;
if (!pdfText) throw new Error("Missing preserved MegaCentre PDF text");
mega = [{
  jobId: "generated-megacentre-cafe-lead-2026-07",
  title: "Café Lead",
  description: pdfText,
  jobUrl: "https://www.megacentrerayleigh.co.uk/wp-content/uploads/2026/07/CafeLead_JobDescription.pdf",
  postedDate: "",
  jdDeadline: "",
  company: "Mega food centre",
  salaryRange: "£28000",
  employmentType: "Full-time",
  worktype: "",
  location: "Rayleigh, Essex, United Kingdom",
  city: "Rayleigh", state: "Essex", country: "United Kingdom", ats: "Custom",
}];
await saveCompany("mega-food-centre", "Mega food centre", mega, {
  sourceUrl: "https://www.megacentrerayleigh.co.uk/recruitment/",
  rows: 1,
  notes: ["The supplied company label is retained; the source website identifies itself as The MegaCentre Rayleigh.", "The current recruitment page links the Café Lead PDF; neither a posting date nor a closing date is shown."],
});
}

if (target === "all" || target === "mayra-property-services") {
await saveCompany("mayra-property-services", "Mayra Property Services", [], {
  suppliedUrl: "https://wearemayra.com/en/karriere",
  verifiedCompanyUrl: "https://www.mayrapropertyservices.co.uk/",
  rows: 0,
  status: "identity_mismatch_no_verified_vacancies",
  notes: ["The supplied careers URL belongs to Mayra Group GmbH in Stuttgart, Germany, not the London property company.", "The London company's official site has no verified careers listing. No German group jobs were relabelled."],
});
}

if (target === "all") {
const all = [...mountain, ...northwood, ...mega];
await mkdir(root, { recursive: true });
await writeFile(resolve(root, "companies.csv"), outputCsv(all));
await writeFile(resolve(root, "companies.json"), JSON.stringify(all, null, 2));
await writeFile(resolve(root, "batch-report.json"), JSON.stringify({
  runDate, rows: all.length,
  companies: [
    { name: "Mayra Property Services", rows: 0, status: "identity_mismatch_no_verified_vacancies" },
    { name: "Mega food centre", rows: mega.length, status: "ok" },
    { name: "Mountain Healthcare Ltd", rows: mountain.length, sourceVacancies: mountainRows.length, status: "ok_with_map_warnings" },
    { name: "Northwood Hygiene Products Limited", rows: northwood.length, status: "ok" },
  ],
}, null, 2));
console.log(JSON.stringify({ rows: all.length, mountain: mountain.length, northwood: northwood.length, mega: mega.length, mayra: 0, northwoodListed: cardCount }));
} else if (!["mountain-healthcare-ltd", "northwood-hygiene-products-limited", "mega-food-centre", "mayra-property-services"].includes(target)) {
  throw new Error(`Unknown company slug: ${target}`);
}
