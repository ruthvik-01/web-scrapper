#!/usr/bin/env tsx
/** Test script to verify Rodericks fix quality */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype", "location",
  "city", "state", "country", "ats",
] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  pound: "\u00a3", euro: "\u20ac", hellip: "\u2026",
  mdash: "\u2014", ndash: "\u2013", rsquo: "\u2019", lsquo: "\u2018",
  ldquo: "\u201c", rdquo: "\u201d", bull: "\u2022",
  eacute: "\u00e9", egrave: "\u00e8", ouml: "\u00f6",
  auml: "\u00e4", uuml: "\u00fc", copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", deg: "\u00b0",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\u00c2(?=[\u00a3\u00a9\u00ae])/g, "");
}

function parseRodericksDescription(raw: string): {
  cleanDescription: string;
  employmentType: string;
  postedDate: string;
  closingDate: string;
} {
  const lines = raw.split("\n");
  let cutIndex = lines.length;
  let employmentType = "";
  let postedDate = "";
  let closingDate = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "Job Reference" && i > 10) {
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        const metaLine = lines[j].trim();

        if (metaLine === "Contract Type" && j + 1 < lines.length) {
          employmentType = lines[j + 1].trim();
        }
        if (metaLine === "Closing Date" && j + 1 < lines.length) {
          closingDate = parseDate(lines[j + 1].trim());
        }
        if (metaLine === "Posted on" && j + 1 < lines.length) {
          postedDate = parseDate(lines[j + 1].trim());
        }
        if (metaLine === "Apply" && j > i + 5) {
          cutIndex = Math.min(cutIndex, i);
          break;
        }
      }
      cutIndex = Math.min(cutIndex, i);
      break;
    }

    if (line.startsWith("At Rodericks Dental Partners Group, we believe") && i > 10) {
      cutIndex = Math.min(cutIndex, i);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Jobs in the same category")) {
      cutIndex = Math.min(cutIndex, i);
    }
  }

  let cleanDescription = lines.slice(0, cutIndex).join("\n").trim();
  cleanDescription = cleanDescription.replace(/\n\s*Apply\s*$/i, "");
  cleanDescription = cleanDescription
    .split("\n")
    .map(line => line.replace(/[\t\u00a0]+/g, " ").replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanDescription,
    employmentType: normalizeEmploymentType(employmentType),
    postedDate,
    closingDate,
  };
}

function parseDate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const match = /^(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})$/.exec(trimmed);
  if (match) {
    const day = match[1].padStart(2, "0");
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const month = months[match[2].toLowerCase()] || "01";
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return "";
}

function normalizeEmploymentType(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const normalized: Record<string, string> = {
    "full time": "Full Time",
    "part time": "Part Time",
    "full-time": "Full Time",
    "part-time": "Part Time",
    "permanent": "Permanent",
    "temporary": "Temporary",
    "contract": "Contract",
    "fixed term": "Fixed Term",
    "fixed-term": "Fixed Term",
  };

  const lower = trimmed.toLowerCase();
  return normalized[lower] || trimmed.split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function cleanCity(city: string): string {
  const trimmed = city.trim();
  if (!trimmed) return "";

  const decoded = decodeEntities(trimmed);

  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(decoded)) {
    return "";
  }

  if (decoded.includes(",") || decoded.length > 30) {
    const parts = decoded.split(/[,+]+/).map(p => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !/^\d/.test(part) && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(part)) {
        if (!/^(road|street|lane|avenue|way|drive|place|close|grove|square|court|terrace)$/i.test(part)) {
          return part;
        }
      }
    }
  }

  if (decoded.length <= 25 && !decoded.includes(",") && !decoded.includes("+")) {
    return decoded;
  }
  return "";
}

// Main test
const inputFolder = resolve("../output/2026-09-24-main-uk-scrape/jobs company wise/rodericks-dental-partners");
const jsonPath = join(inputFolder, "jobs.json");
const jsonContent = readFileSync(jsonPath, "utf8");
const rows: Row[] = JSON.parse(jsonContent);

console.log(`Testing ${rows.length} rows\n`);

// Show before/after for first 3 rows
for (let i = 0; i < Math.min(3, rows.length); i++) {
  const row = rows[i];
  const parsed = parseRodericksDescription(row.description);
  const city = cleanCity(row.city);
  
  console.log(`=== Job ${row.jobId}: ${row.title} ===`);
  console.log(`\nBEFORE Description (first 500 chars):\n${row.description.slice(0, 500)}...\n`);
  console.log(`AFTER Description (first 500 chars):\n${parsed.cleanDescription.slice(0, 500)}...\n`);
  console.log(`BEFORE employmentType: "${row.employmentType}"`);
  console.log(`AFTER employmentType: "${parsed.employmentType}"`);
  console.log(`BEFORE city: "${row.city}"`);
  console.log(`AFTER city: "${city}"`);
  console.log(`BEFORE postedDate: "${row.postedDate}"`);
  console.log(`AFTER postedDate: "${parsed.postedDate}"`);
  console.log(`BEFORE jdDeadline: "${row.jdDeadline}"`);
  console.log(`AFTER jdDeadline: "${parsed.closingDate}"`);
  console.log("\n" + "=".repeat(60) + "\n");
}

// Check for problematic city values
console.log("\n=== Sample city cleanups ===");
const sampleCityChanges: Array<{jobId: string; before: string; after: string}> = [];
for (const row of rows) {
  const cleaned = cleanCity(row.city);
  if (row.city !== cleaned) {
    sampleCityChanges.push({jobId: row.jobId, before: row.city, after: cleaned});
  }
  if (sampleCityChanges.length >= 10) break;
}

for (const change of sampleCityChanges) {
  console.log(`Job ${change.jobId}: "${change.before}" -> "${change.after}"`);
}
