#!/usr/bin/env tsx
/**
 * Regenerate the master CSV and JSON from per-company folders.
 * 
 * Usage: npx tsx scripts/regenerate-master.ts --root "../output/2026-09-24-main-uk-scrape"
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype", "location", "city",
  "state", "country", "ats",
] as const;

type Row = Record<string, string>;

const LABEL_TO_FOLDER: Record<string, string> = {
  "P Ducker Systems Ltd": "p-ducker-systems-ltd",
  "Partnering Health Ltd": "partnering-health-ltd",
  "PGS LTD": "pgs-ltd",
  "Pinpoint Group Recruitment Ltd": "pinpoint-group-recruitment-ltd",
  "Pinpoint Resourcing ltd": "pinpoint-resourcing-ltd",
  "PPG Health In Justice": "ppghealthinjusticeweb",
  "PRDC Dental": "rodericks-dental-partners",
  "Prince of Wales Medical Centre": "prince-of-wales-medical-centre",
  "Operations Resources": "operations-resources-limited",
};

// Order matters for reproducible output
const COMPANY_ORDER = [
  "P Ducker Systems Ltd",
  "Partnering Health Ltd",
  "PGS LTD",
  "Pinpoint Group Recruitment Ltd",
  "Pinpoint Resourcing ltd",
  "PPG Health In Justice",
  "PRDC Dental",
  "Prince of Wales Medical Centre",
  "Operations Resources",
];

function csvField(value: string): string {
  if (!value) return "";
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map(c => csvField(row[c] ?? "")).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]) {
  const args = { root: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i] ?? "";
  }
  if (!args.root) throw new Error("--root <folder> is required");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);

  if (!existsSync(root)) {
    throw new Error(`Root folder does not exist: ${root}`);
  }

  const allRows: Row[] = [];

  for (const label of COMPANY_ORDER) {
    const folder = LABEL_TO_FOLDER[label];
    const companyPath = join(root, "jobs company wise", folder);
    const jsonPath = join(companyPath, "jobs.json");

    if (!existsSync(jsonPath)) {
      console.log(`Skipping ${label} (${jsonPath} not found)`);
      continue;
    }

    const rows: Row[] = JSON.parse(readFileSync(jsonPath, "utf8"));
    console.log(`${label}: ${rows.length} rows from ${folder}`);
    allRows.push(...rows);
  }

  console.log(`\nTotal: ${allRows.length} rows`);

  const masterJson = JSON.stringify(allRows, null, 2);
  const masterCsv = rowsToCsv(allRows);

  writeFileSync(join(root, "companies.json"), masterJson, "utf8");
  writeFileSync(join(root, "companies.csv"), masterCsv, "utf8");

  console.log(`\nWrote companies.csv and companies.json to ${root}`);
}

main();
