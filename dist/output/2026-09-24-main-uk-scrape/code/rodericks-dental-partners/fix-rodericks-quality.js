#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Fix Rodericks Dental Partners data quality issues:
 * 1. Re-extract descriptions to exclude page controls and other job cards
 * 2. Recover Contract Type, Posted Date, and Closing Date from description footer
 * 3. Clean city values (remove addresses, postcodes)
 * 4. Fix HTML entities in location/title
 *
 * Usage (from web_scrapper_project/):
 *   npx tsx scripts/fix-rodericks-quality.ts --input "../output/2026-09-24-main-uk-scrape/jobs company wise/rodericks-dental-partners"
 *   npx tsx scripts/fix-rodericks-quality.ts --input "..." --apply
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const COLUMNS = [
    "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
    "company", "salaryRange", "employmentType", "worktype", "location",
    "city", "state", "country", "ats",
];
/** Named HTML entities commonly found in the data */
const NAMED_ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    pound: "\u00a3", euro: "\u20ac", hellip: "\u2026",
    mdash: "\u2014", ndash: "\u2013", rsquo: "\u2019", lsquo: "\u2018",
    ldquo: "\u201c", rdquo: "\u201d", bull: "\u2022",
    eacute: "\u00e9", egrave: "\u00e8", ouml: "\u00f6",
    auml: "\u00e4", uuml: "\u00fc", copy: "\u00a9", reg: "\u00ae",
    trade: "\u2122", deg: "\u00b0",
};
function decodeEntities(input) {
    return input
        .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
        .replace(/\u00c2(?=[\u00a3\u00a9\u00ae])/g, "");
}
/**
 * Parse the Rodericks description to extract:
 * - Clean description (remove footer with navigation, forms, other jobs)
 * - Contract Type
 * - Posted Date
 * - Closing Date
 */
function parseRodericksDescription(raw) {
    const lines = raw.split("\n");
    let cutIndex = lines.length;
    let employmentType = "";
    let postedDate = "";
    let closingDate = "";
    // Find metadata markers: "Job Reference" signals start of metadata block
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
        // Privacy notice starts here
        if (line.startsWith("At Rodericks Dental Partners Group, we believe") && i > 10) {
            cutIndex = Math.min(cutIndex, i);
        }
    }
    // Find "Jobs in the same category"
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Jobs in the same category")) {
            cutIndex = Math.min(cutIndex, i);
        }
    }
    let cleanDescription = lines.slice(0, cutIndex).join("\n").trim();
    // Remove leading "Vacancies" header if present
    cleanDescription = cleanDescription.replace(/^Vacancies\s*\n/i, "");
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
function parseDate(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return "";
    const match = /^(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})$/.exec(trimmed);
    if (match) {
        const day = match[1].padStart(2, "0");
        const months = {
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
function normalizeEmploymentType(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return "";
    const normalized = {
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
function cleanCity(city) {
    const trimmed = city.trim();
    if (!trimmed)
        return "";
    const decoded = decodeEntities(trimmed);
    // Postcode pattern
    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(decoded)) {
        return "";
    }
    // Long addresses with practice names - extract the city
    if (decoded.includes(" ") && decoded.length > 25) {
        // Try to find a city name at the end - common patterns:
        // "Practice Name Address City" -> extract "City"
        // "Practice Name, City" -> extract "City"
        const parts = decoded.split(/\s+/);
        // Known suffixes that indicate address parts
        const addressSuffixes = ['Road', 'Street', 'Lane', 'Avenue', 'Way', 'Drive',
            'Place', 'Close', 'Grove', 'Square', 'Court', 'Terrace',
            'Walk', 'Centre', 'Center', 'House', 'Clinic', 'Care'];
        // Find the last part that looks like a city (not address/suffix)
        // Cities usually don't end with address suffixes
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i].replace(/[,+]/, '');
            if (!part)
                continue;
            // Skip common address words
            if (addressSuffixes.some(s => part.toLowerCase() === s.toLowerCase()))
                continue;
            // Skip if it's a number
            if (/^\d+$/.test(part))
                continue;
            // Skip if it looks like a postcode fragment
            if (/^[A-Z]{1,2}\d/i.test(part) && part.length <= 3)
                continue;
            // If this could be a city, return it
            // But check if there are multiple words that together form a city name
            // e.g., "West Bromwich" or "Nottinghamshire"
            if (i > 0) {
                const prevPart = parts[i - 1].replace(/[,+]/, '');
                // Check for compound city names like "West Bromwich"
                const compoundCities = ['West Bromwich', 'West Sussex', 'East Sussex', 'West Yorkshire',
                    'East Riding', 'North Yorkshire', 'South Yorkshire'];
                const potentialCompound = `${prevPart} ${part}`;
                if (compoundCities.includes(potentialCompound)) {
                    return potentialCompound;
                }
            }
            // Return the last non-address word
            return part;
        }
        // Fallback: return last word that's not an address suffix
        return parts[parts.length - 1];
    }
    if (decoded.includes(",") || decoded.includes("+")) {
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
function fixRow(row) {
    const title = decodeEntities(row.title);
    const parsed = parseRodericksDescription(row.description);
    const city = cleanCity(row.city);
    let location = row.location;
    if (city !== row.city) {
        const parts = [city, row.state, row.country].filter(Boolean);
        location = parts.join(", ") || row.location;
    }
    location = decodeEntities(location);
    const employmentType = parsed.employmentType || row.employmentType;
    const postedDate = parsed.postedDate || row.postedDate;
    const closingDate = parsed.closingDate || row.jdDeadline;
    return {
        ...row,
        title,
        description: parsed.cleanDescription,
        employmentType,
        postedDate,
        jdDeadline: closingDate,
        city,
        location,
    };
}
function csvField(value) {
    if (!value)
        return "";
    return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function rowsToCsv(rows) {
    const lines = [COLUMNS.join(",")];
    for (const row of rows) {
        lines.push(COLUMNS.map(c => csvField(row[c] ?? "")).join(","));
    }
    return `${lines.join("\n")}\n`;
}
function parseArgs(argv) {
    const args = { input: "", apply: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--input")
            args.input = argv[++i] ?? "";
        else if (a === "--apply")
            args.apply = true;
    }
    if (!args.input)
        throw new Error("--input <folder> is required");
    return args;
}
function main() {
    const args = parseArgs(process.argv.slice(2));
    const inputFolder = (0, node_path_1.resolve)(args.input);
    if (!(0, node_fs_1.existsSync)(inputFolder)) {
        throw new Error(`Input folder does not exist: ${inputFolder}`);
    }
    const jsonPath = (0, node_path_1.join)(inputFolder, "jobs.json");
    const jsonContent = (0, node_fs_1.readFileSync)(jsonPath, "utf8");
    const rows = JSON.parse(jsonContent);
    console.log(`Read ${rows.length} rows from ${jsonPath}`);
    const fixedRows = rows.map(fixRow);
    // Count changes
    let descriptionChanged = 0;
    let employmentTypeFilled = 0;
    let cityChanged = 0;
    let titleDecoded = 0;
    let postedDateFilled = 0;
    let closingDateFilled = 0;
    for (let i = 0; i < rows.length; i++) {
        const original = rows[i];
        const fixed = fixedRows[i];
        if (original.description !== fixed.description)
            descriptionChanged++;
        if (!original.employmentType && fixed.employmentType)
            employmentTypeFilled++;
        if (original.city !== fixed.city)
            cityChanged++;
        if (original.title !== fixed.title)
            titleDecoded++;
        if (!original.postedDate && fixed.postedDate)
            postedDateFilled++;
        if (!original.jdDeadline && fixed.jdDeadline)
            closingDateFilled++;
    }
    console.log(`Changes:`);
    console.log(`  Descriptions cleaned: ${descriptionChanged}`);
    console.log(`  employmentType filled: ${employmentTypeFilled}`);
    console.log(`  city values changed: ${cityChanged}`);
    console.log(`  title entities decoded: ${titleDecoded}`);
    console.log(`  postedDate filled: ${postedDateFilled}`);
    console.log(`  jdDeadline filled: ${closingDateFilled}`);
    if (args.apply) {
        const csvPath = (0, node_path_1.join)(inputFolder, "jobs.csv");
        (0, node_fs_1.writeFileSync)(csvPath, "\uFEFF" + rowsToCsv(fixedRows), "utf8");
        (0, node_fs_1.writeFileSync)(jsonPath, JSON.stringify(fixedRows, null, 2), "utf8");
        console.log(`\nWrote ${fixedRows.length} rows to ${csvPath} and ${jsonPath}`);
    }
    else {
        console.log(`\n--apply not specified, no files written (dry run)`);
        console.log(`Run with --apply to write the changes.`);
    }
}
main();
