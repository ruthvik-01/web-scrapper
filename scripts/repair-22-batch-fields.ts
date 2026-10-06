import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { outputCsv, type OutputRow } from "../src/output.js";

const workspace = resolve(import.meta.dirname, "..", "..");
const source = resolve(workspace, "output", "22-9-26 batch");
const destination = resolve(workspace, "output", "22-9-26 batch-corrected-fields");
const ltfRun = resolve(workspace, "output", "2026-10-06-project-cleanup", "archive", "jev-runs", "longtermfutures-co-uk-1790058116121");
const priorTcfm = resolve(workspace, "output", "akhil-tcfm-verified-2026-09-18", "tcfm", "jobs.csv");

type Row = OutputRow & Record<string, string>;
const companies = [
  ["exchange-street", "Exchange Street Claims & Financial Services"],
  ["long-term-futures", "Long Term Futures"],
  ["tcfm", "TCFM"],
  ["osborneclarke", "Osborne Clarke"],
  ["get-recruited", "Get Recruited (UK) Ltd"],
] as const;

const clean = (value: string | undefined): string => (value || "").replace(/\s+/g, " ").trim();
const sourceJobId = (url: string): string =>
  /\/vacancies\/(\d+)\//i.exec(url)?.[1]
  || /\/external_job\/[^/?#]*-(\d+)\/?(?:[?#]|$)/i.exec(url)?.[1]
  || /\/careers\/\d+\/[^/]+\/[^/?#]*-(\d+)\/?(?:[?#]|$)/i.exec(url)?.[1]
  || "";
const usablePlace = (value: string): string => /^(?:remote|all of uk|uk wide|nationwide|not specified|n\/a)$/i.test(value) ? "" : value;

async function rowsAt(path: string): Promise<Row[]> {
  return JSON.parse(await readFile(path, "utf8")) as Row[];
}

async function placeState(city: string, cache: Map<string, Promise<string>>): Promise<string> {
  if (!city) return "";
  if (!cache.has(city)) cache.set(city, (async () => {
    const response = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(city)}&limit=100`, {
      headers: { "User-Agent": "UKCompanyJobScraper/0.1" }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return "";
    const payload = await response.json() as { result?: Record<string, unknown>[] };
    const key = (value: unknown) => String(value || "").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
    const matches = (payload.result || []).filter(place =>
      [place.name_1, place.name_2].some(name => key(name) === key(city)) &&
      /^(England|Scotland|Wales|Northern Ireland)$/i.test(String(place.country || "")),
    );
    const states = [...new Set(matches.map(place => String(place.county_unitary || place.district_borough || place.region || "").trim()).filter(Boolean))];
    return states.length === 1 ? states[0]! : "";
  })());
  return cache.get(city)!;
}

function exchangeLocation(row: Row): void {
  const match = /Town\/City:\s*([\s\S]*?)\s*County:\s*([\s\S]*?)\s*Salary\/Rate:/i.exec(row.description || "");
  if (!match) return;
  const city = usablePlace(clean(match[1]));
  const state = usablePlace(clean(match[2]));
  if (city) row.city = city;
  if (state) row.state = state;
}

function osborneLocation(row: Row): void {
  if (row.city) return;
  const match = /\bbased (?:in|out of) (?:our |the )?([A-Z][A-Za-z]*(?:\s+(?:or|and|,)\s*[A-Z][A-Za-z]*)*) offices?\b/.exec(row.description || "");
  if (match && !/\s(?:or|and|,)\s/.test(match[1]!)) row.city = match[1]!;
}

function longTermFuturesLocation(row: Row): void {
  if (row.city) return;
  const match = /\bLocation\s*:\s*([\s\S]{2,160}?)(?=\s*(?:Pay|Salary|Daily Rate|Weekly Pay|Start Date|Hours|Contract)\s*:|\n|$)/i.exec(row.description || "");
  if (!match) return;
  const parts = clean(match[1]).replace(/\s+[–-]\s+commutable from\b[\s\S]*$/i, "").split(/\s*,\s*/);
  const city = usablePlace(parts[0] || "");
  const state = usablePlace(parts[1] || "");
  if (city) row.city = city;
  if (state) row.state = state;
}

await rm(destination, { recursive: true, force: true });
await mkdir(resolve(destination, "jobs company wise"), { recursive: true });
await cp(resolve(source, "code"), resolve(destination, "code"), { recursive: true });

const prior = new Map<string, Row>();
for (const row of await rowsAt(resolve(workspace, "output", "akhil-tcfm-verified-2026-09-18", "tcfm", "export-rows.json"))) prior.set(row.jobUrl, row);
const stateCache = new Map<string, Promise<string>>();
const allRows: Row[] = [];
const summaries: Record<string, unknown>[] = [];

for (const [slug, company] of companies) {
  const from = slug === "long-term-futures"
    ? resolve(ltfRun, "jobs.json")
    : resolve(source, "jobs company wise", slug, "export-rows.json");
  const rows = await rowsAt(from);
  for (const row of rows) {
    row.company = company;
    row.jobId ||= sourceJobId(row.jobUrl);
    if (slug === "exchange-street") exchangeLocation(row);
    if (slug === "long-term-futures") longTermFuturesLocation(row);
    if (slug === "osborneclarke") osborneLocation(row);
    if (slug === "tcfm") {
      const verified = prior.get(row.jobUrl);
      if (verified) {
        row.jobId = verified.jobId || row.jobId;
        row.city = verified.city || row.city;
        row.state = verified.state || row.state;
      }
    }
    if (row.city && !row.state) row.state = await placeState(row.city, stateCache);
    if (row.city || row.state) row.location = [row.city, row.state, "UK"].filter(Boolean).join(", ");
    row.country = "UK";
    row.ats = "Custom";
  }
  const folder = resolve(destination, "jobs company wise", slug);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, "jobs.csv"), outputCsv(rows), "utf8");
  await writeFile(resolve(folder, "export-rows.json"), JSON.stringify(rows, null, 2) + "\n");
  await cp(resolve(source, "jobs company wise", slug, "scrape-report.json"), resolve(folder, "scrape-report.json"));
  await writeFile(resolve(folder, "correction.json"), JSON.stringify({
    jobIds: "Extracted only from visible source references or supported URL patterns.",
    geography: "Filled only from labelled employer-page locations, a verified TCFM run, or an unambiguous Postcodes.io place match. Blank fields remain unavailable in the source.",
    liveRefresh: slug === "long-term-futures" ? "Fresh live run at 2026-09-22T11:52Z; 81 current vacancies replaced the stale 339-row result." : "Original live scrape retained.",
  }, null, 2) + "\n");
  allRows.push(...rows);
  summaries.push({
    company, rows: rows.length,
    missingJobId: rows.filter(row => !row.jobId).length,
    missingCity: rows.filter(row => !row.city).length,
    missingState: rows.filter(row => !row.state).length,
  });
}

await writeFile(resolve(destination, "companies.csv"), outputCsv(allRows), "utf8");
await writeFile(resolve(destination, "correction-report.json"), JSON.stringify({
  sourceDelivery: source,
  correctedAt: new Date().toISOString(),
  companies: summaries,
  totalRows: allRows.length,
}, null, 2) + "\n");
await writeFile(resolve(destination, "README.md"), `# Corrected 22-9-26 batch\n\nThis replaces the earlier delivery because it had missing job IDs and incomplete source geography. Long Term Futures was refreshed from its live board and now has 81 current rows rather than 339 stale rows. City/state values are populated only where employer evidence or an unambiguous Postcodes.io match exists.\n`);
console.log(JSON.stringify({ destination, summaries, totalRows: allRows.length }, null, 2));
