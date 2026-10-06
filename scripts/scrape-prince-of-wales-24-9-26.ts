#!/usr/bin/env tsx
/**
 * Scrape the Prince of Wales careers board (careers.pwh.org.uk) into the 24 September 2026
 * 15-column contract, then optionally merge the rows into the combined master.
 *
 * Source: the board is an AngularJS app whose own controller calls its public API
 *   GET /api/liveadverts/filter/-in-?country=United Kingdom&searchTerm=&location=&extraDataFilters=&distanceMiles=10
 *   GET /api/liveadverts/{AdvertId}                       (full advert body HTML)
 * served by https://postingpandaapi-live.azurewebsites.net/ with the board as Referer/Origin.
 * The public advert page is https://careers.pwh.org.uk/job/{AdvertId}.
 *
 * Rules applied (runbook MAIN_UK_Scrape.md, 24 Sep 2026 run):
 *  - two-month posting window: postedDate (source DateCreated) must be >= --cutoff
 *  - a structured expiry date before the check date means the advert is expired
 *  - country must be United Kingdom
 *  - salaryRange holds only compact annual figures (`£N` / `£N-£N`); hourly pay stays in the description
 *  - employmentType is the contract type (EmploymentType), worktype stays blank without source evidence
 *  - `company` uses the requester's requested label; the board identity is recorded in the report
 *
 * Usage (from web_scrapper_project/):
 *   npx tsx scripts/scrape-prince-of-wales-24-9-26.ts --delivery "D:\...\2026-09-24-main-uk-scrape"
 *   npx tsx scripts/scrape-prince-of-wales-24-9-26.ts --delivery "..." --apply --merge
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = "https://postingpandaapi-live.azurewebsites.net/api/";
const BOARD = "https://careers.pwh.org.uk";
const LIST_URL = `${API}liveadverts/filter/-in-?country=United%20Kingdom&searchTerm=&location=&extraDataFilters=&distanceMiles=10`;
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: `${BOARD}/`,
  Origin: BOARD,
};

/** Requester's label for this source (folder name stays prince-of-wales-medical-centre). */
const COMPANY_LABEL = "Prince of Wales Medical Centre";
/** Board employer branding, disclosed in the report. */
const BOARD_EMPLOYER = "The Prince of Wales Hospice";
const FOLDER = "prince-of-wales-medical-centre";
/** County stated by the board's own address line for the hospice site postcode (WF8 4BG). */
const SITE_COUNTY = "West Yorkshire";

const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype", "location", "city",
  "state", "country", "ats",
] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

type Advert = {
  AdvertId: number | string;
  JobReference?: string;
  JobTitle?: string;
  Address?: string;
  County?: string;
  PostCode?: string;
  Country?: string;
  Employment?: string;
  EmploymentType?: string;
  SalaryDisplay?: string;
  SalaryType?: string;
  SalaryExtra?: string;
  JobDescription?: string;
  DateCreated?: string;
  DateAdded?: string;
  ExtraData?: unknown;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£",
  euro: "€", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", bull: "•", eacute: "é", egrave: "è", ouml: "ö",
  auml: "ä", uuml: "ü", copy: "©", reg: "®", trade: "™", deg: "°",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    // mojibake guard: "Â£" should be "£" if a UTF-8 pound sign was mis-decoded upstream
    .replace(/\u00c2(?=[\u00a3\u00a9\u00ae])/g, "");
}

/** Advert body HTML -> plain text with paragraph/list breaks preserved. */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|li|ul|ol|div|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*(li)[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0]+/g, " ").replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIsoDate(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  return "";
}

function extraData(advert: Advert): string[] {
  const raw = advert.ExtraData;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function expiryDate(advert: Advert): string {
  const entry = extraData(advert).find((item) => /^expiry[_:]/i.test(item));
  return entry ? toIsoDate(entry.split(/[_:]/).slice(1).join(":")) : "";
}

function employmentLabel(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Compact annual salary only; hourly or volunteer pay returns "". */
function salaryRange(advert: Advert): string {
  const type = (advert.SalaryType ?? "").toLowerCase();
  if (type !== "annum") return "";
  const amounts = [...(advert.SalaryDisplay ?? "").matchAll(/£\s*([\d,]+)(?:\.\d+)?/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (amounts.length === 0) return "";
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return min === max ? `£${min}` : `£${min}-£${max}`;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvField(row[c] ?? "")).join(","));
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]) {
  const args = { delivery: "", cutoff: "2026-07-24", checkDate: "2026-09-24", apply: false, merge: false, report: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--delivery") args.delivery = argv[++i] ?? "";
    else if (a === "--cutoff") args.cutoff = argv[++i] ?? args.cutoff;
    else if (a === "--check-date") args.checkDate = argv[++i] ?? args.checkDate;
    else if (a === "--apply") args.apply = true;
    else if (a === "--merge") args.merge = true;
    else if (a === "--report") args.report = argv[++i] ?? "";
  }
  if (!args.delivery) throw new Error("--delivery <working folder> is required");
  if (args.merge) args.apply = true;
  return args;
}

function cityState(advert: Advert): { location: string; city: string; state: string } {
  const address = decodeEntities(advert.Address ?? "").trim();
  const postcode = (advert.PostCode ?? "").trim();
  const firstPart = address.split(",")[0].trim();
  // Use the advert's own place when it names one; the hospice site itself is Pontefract (WF8 4BG,
  // stated on the board's advert pages), otherwise leave the city blank rather than guess.
  const namedPlace = firstPart && !/^(the\s)/i.test(firstPart) && !/hospice|area|centre|center/i.test(firstPart);
  const hospiceSite = /hospice|pontefract/i.test(address) || postcode.toUpperCase().startsWith("WF8");
  const city = namedPlace ? firstPart : hospiceSite ? "Pontefract" : "";
  // One advert's County field holds the nation name ("England") instead of a county; the board's own
  // address line for the same postcode (WF8 4BG) states West Yorkshire, so use that rather than the nation.
  const county = (advert.County ?? "").trim();
  const state = /^(england|scotland|wales|northern ireland)$/i.test(county) ? SITE_COUNTY : county;
  const parts = [city, state, "United Kingdom"].filter(Boolean);
  return { location: parts.join(", "), city, state };
}

/** Append rows to a JSON array file without re-serialising the existing rows. */
function appendJsonArray(path: string, rows: Row[]): void {
  const text = readFileSync(path, "utf8");
  const close = text.lastIndexOf("]");
  if (close < 0) throw new Error(`${path} is not a JSON array`);
  const head = text.slice(0, close).replace(/\s*$/, "");
  const needsComma = !head.endsWith("[");
  const body = rows.map((row) => `  ${JSON.stringify(row, null, 2).split("\n").join("\n  ")}`).join(",\n");
  writeFileSync(path, `${head}${needsComma ? "," : ""}\n${body}\n${text.slice(close)}`, "utf8");
}

function main() {
  void mainAsync();
}

async function mainAsync() {
  const args = parseArgs(process.argv.slice(2));
  const folder = join(args.delivery, "jobs company wise", FOLDER);

  const listRaw = await getJson(LIST_URL);
  const list = (Array.isArray(listRaw) ? listRaw : []) as Advert[];
  console.log(`live adverts listed by the board: ${list.length}`);

  const rows: Row[] = [];
  const excluded: { advertId: string; title: string; reason: string }[] = [];
  const references: Record<string, string> = {};

  for (const item of list) {
    const advertId = String(item.AdvertId ?? "");
    const title = decodeEntities(item.JobTitle ?? "").trim();
    if (!advertId) continue;

    const detailRaw = await getJson(`${API}liveadverts/${advertId}`);
    const advert = (Array.isArray(detailRaw) ? detailRaw[0] : detailRaw) as Advert;
    const posted = toIsoDate(advert.DateCreated);
    const deadline = expiryDate(advert);
    const country = (advert.Country ?? "").trim();

    if (country !== "United Kingdom") {
      excluded.push({ advertId, title, reason: `country "${country}" is not the United Kingdom` });
      continue;
    }
    if (posted && posted < args.cutoff) {
      excluded.push({ advertId, title, reason: `posted ${posted}, before the ${args.cutoff} two-month cutoff` });
      continue;
    }
    if (deadline && deadline < args.checkDate) {
      excluded.push({ advertId, title, reason: `structured expiry ${deadline} is before the check date ${args.checkDate}` });
      continue;
    }

    const { location, city, state } = cityState(advert);
    references[advertId] = (advert.JobReference ?? "").trim();
    rows.push({
      jobId: advertId,
      title,
      description: htmlToText(advert.JobDescription ?? ""),
      jobUrl: `${BOARD}/job/${advertId}`,
      postedDate: posted,
      jdDeadline: deadline,
      company: COMPANY_LABEL,
      salaryRange: salaryRange(advert),
      employmentType: employmentLabel(advert.EmploymentType),
      worktype: "",
      location,
      city,
      state,
      country: "United Kingdom",
      ats: "Custom",
    });
    console.log(`  kept  ${advertId}  ${title}  posted=${posted} deadline=${deadline || "-"} salary=${salaryRange(advert) || "-"}`);
  }
  for (const item of excluded) console.log(`  drop  ${item.advertId}  ${item.title}  (${item.reason})`);

  const report = {
    company: COMPANY_LABEL,
    folder: FOLDER,
    boardEmployer: BOARD_EMPLOYER,
    boardUrl: `${BOARD}/`,
    publicJobUrlPattern: `${BOARD}/job/{AdvertId}`,
    extraction: "board's own AngularJS endpoint chain: api/liveadverts/filter + api/liveadverts/{AdvertId} (full advert body)",
    scrapedAt: args.checkDate,
    cutoff: args.cutoff,
    listed: list.length,
    exported: rows.length,
    excluded,
    sourceReferences: references,
    boardBrandingNote:
      `The board at ${BOARD}/ is ${BOARD_EMPLOYER}'s recruitment site (Pontefract, WF8 4BG; recruitment@pwh.org.uk), which is the site behind the requested https://www.pwh.org.uk/ entry. Rows are exported under the requested label "${COMPANY_LABEL}" as instructed; the board identity is recorded here and in the delivery README.`,
    salaryNote: "salaryRange holds annual figures only. Hourly or volunteer pay stays in the description text.",
    worktypeNote: "worktype is blank: no source evidence of remote, hybrid or on-site arrangement.",
  };

  if (args.apply) {
    writeFileSync(join(folder, "jobs.csv"), rowsToCsv(rows), "utf8");
    writeFileSync(join(folder, "jobs.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    writeFileSync(join(folder, "source-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`wrote ${rows.length} rows to ${folder}`);
  } else {
    console.log("dry run: add --apply to write the company folder files");
  }

  if (args.merge) {
    const masterCsv = join(args.delivery, "companies.csv");
    const current = readFileSync(masterCsv, "utf8");
    if (current.includes(`${COMPANY_LABEL}\n`) || new RegExp(`,${COMPANY_LABEL},`).test(current)) {
      throw new Error(`master already contains rows labelled "${COMPANY_LABEL}" — refusing to duplicate`);
    }
    const csvRows = rowsToCsv(rows).split("\n").slice(1).join("\n");
    writeFileSync(masterCsv, `${current.replace(/\n*$/, "\n")}${csvRows}`, "utf8");
    appendJsonArray(join(args.delivery, "companies.json"), rows);
    appendJsonArray(join(args.delivery, "jobs company wise", "companies.json"), rows);
    console.log(`merged ${rows.length} rows into the combined master and its JSON copies`);
  }

  if (args.report) writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!existsSync(folder)) console.error(`warning: ${folder} does not exist`);
}

if (process.argv[1]?.endsWith("scrape-prince-of-wales-24-9-26.ts")) main();
