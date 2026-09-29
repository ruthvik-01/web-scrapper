#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Verify (and optionally repackage) the 24 September 2026 UK delivery.
 *
 * Checks performed:
 *  - exact 15-column CSV contract, row widths, required identity fields
 *  - unique jobId, jobUrl, and jobId+jobUrl pairs; ats + country values
 *  - company labels limited to the nine requested names, with expected counts
 *  - companies.json equals companies.csv; `jobs company wise/companies.json` equals both
 *  - each per-company jobs.csv/jobs.json equals its slice of the master
 *    (company label -> delivery folder mapping is explicit below)
 *  - populated dates parse as YYYY-MM-DD; salaries follow the compact pound format
 *  - no NHS Jobs hosts anywhere
 *  - final.zip entry set, per-entry SHA-256 equality with disk, and ZIP/disk master equality
 *  - optional --compare <folder>: every deliverable file hashes identically there
 *
 * Usage (from web_scrapper_project/):
 *   npx tsx scripts/verify-package-24-9-26.ts --root "D:\...\2026-09-24-main-uk-scrape"
 *   npx tsx scripts/verify-package-24-9-26.ts --root "..." --package        # rebuild final.zip
 *   npx tsx scripts/verify-package-24-9-26.ts --root "..." --compare "D:\...\2026-09-24-verified"
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const fflate_1 = require("fflate");
const COLUMNS = [
    "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
    "company", "salaryRange", "employmentType", "worktype", "location", "city",
    "state", "country", "ats",
];
/** Requested company label -> delivery folder holding its rows. */
const LABEL_TO_FOLDER = {
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
/** Folders that must stay header-only / empty (no rows attributed under this folder). */
const EMPTY_FOLDERS = ["prdc-dental"];
const EXPECTED_ROWS = {
    "P Ducker Systems Ltd": 1,
    "Partnering Health Ltd": 5,
    "PGS LTD": 5,
    "Pinpoint Group Recruitment Ltd": 6,
    "Pinpoint Resourcing ltd": 10,
    "PPG Health In Justice": 154,
    "PRDC Dental": 346,
    "Prince of Wales Medical Centre": 6,
    "Operations Resources": 3,
};
const problems = [];
const notes = [];
function fail(message) {
    problems.push(message);
}
function note(message) {
    notes.push(message);
}
function sha256(buf) {
    return (0, node_crypto_1.createHash)("sha256").update(buf).digest("hex");
}
/** RFC4180-ish parser: keeps quoted commas and newlines inside fields. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                quoted = false;
                i++;
                continue;
            }
            field += c;
            i++;
            continue;
        }
        if (c === '"') {
            quoted = true;
            i++;
            continue;
        }
        if (c === ",") {
            row.push(field);
            field = "";
            i++;
            continue;
        }
        if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n")
                i += 2;
            else
                i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }
        field += c;
        i++;
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
function readRows(path) {
    const text = (0, node_fs_1.readFileSync)(path, "utf8").replace(/^\uFEFF/, "");
    const parsed = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
    const header = parsed.shift() ?? [];
    const rows = parsed.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
    return { header, rows };
}
function readJsonRows(path) {
    return JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
}
function canonicalRow(row) {
    return JSON.stringify(COLUMNS.map((c) => [c, row[c] ?? ""]));
}
/** Recursively list files (posix-style relative paths) that satisfy `include`. */
function listFiles(root, include) {
    const out = [];
    const walk = (dir) => {
        for (const entry of (0, node_fs_1.readdirSync)(dir, { withFileTypes: true })) {
            const abs = (0, node_path_1.join)(dir, entry.name);
            const rel = (0, node_path_1.relative)(root, abs).split(node_path_1.sep).join("/");
            if (entry.isDirectory()) {
                walk(abs);
            }
            else if (entry.isFile() && include(rel)) {
                out.push(rel);
            }
        }
    };
    walk(root);
    return out.sort();
}
/** The ZIP mirrors the delivery root: master CSV plus each company folder and the code snapshots. */
function zipInclude(rel) {
    return rel === "companies.csv" || rel.startsWith("jobs company wise/") || rel.startsWith("code/");
}
function parseArgs(argv) {
    const args = { root: "", compare: "", package: false, report: "" };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--root")
            args.root = argv[++i] ?? "";
        else if (a === "--compare")
            args.compare = argv[++i] ?? "";
        else if (a === "--package")
            args.package = true;
        else if (a === "--report")
            args.report = argv[++i] ?? "";
    }
    if (!args.root)
        throw new Error("--root <delivery folder> is required");
    return args;
}
function main() {
    const args = parseArgs(process.argv.slice(2));
    const root = args.root;
    // --- master CSV and JSON equality ----------------------------------------
    const masterCsv = (0, node_path_1.join)(root, "companies.csv");
    const { header, rows: csvRows } = readRows(masterCsv);
    if (header.join(",") !== COLUMNS.join(","))
        fail(`CSV header mismatch: ${header.join(",")}`);
    note(`master rows: ${csvRows.length}`);
    const jsonRows = readJsonRows((0, node_path_1.join)(root, "companies.json"));
    const wiseRows = readJsonRows((0, node_path_1.join)(root, "jobs company wise", "companies.json"));
    if (jsonRows.length !== csvRows.length)
        fail(`companies.json rows ${jsonRows.length} != csv rows ${csvRows.length}`);
    for (let i = 0; i < csvRows.length; i++) {
        if (canonicalRow(jsonRows[i] ?? {}) !== canonicalRow(csvRows[i])) {
            fail(`companies.json row ${i + 1} differs from CSV`);
            break;
        }
        if (canonicalRow(wiseRows[i] ?? {}) !== canonicalRow(csvRows[i])) {
            fail(`jobs company wise/companies.json row ${i + 1} differs from CSV`);
            break;
        }
    }
    // --- per-row field rules --------------------------------------------------
    const ids = new Set();
    const urls = new Set();
    const pairs = new Set();
    const salaryPattern = /^£\d+(?:-£\d+)?$/;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    let blankDates = 0;
    let blankSalary = 0;
    for (const [i, row] of csvRows.entries()) {
        const line = i + 2;
        if (!row.jobId)
            fail(`row ${line}: blank jobId`);
        if (!/^https?:\/\//.test(row.jobUrl))
            fail(`row ${line}: invalid jobUrl`);
        if (ids.has(row.jobId))
            fail(`row ${line}: duplicate jobId ${row.jobId}`);
        if (urls.has(row.jobUrl))
            fail(`row ${line}: duplicate jobUrl ${row.jobUrl}`);
        if (pairs.has(`${row.jobId}|${row.jobUrl}`))
            fail(`row ${line}: duplicate jobId+jobUrl`);
        ids.add(row.jobId);
        urls.add(row.jobUrl);
        pairs.add(`${row.jobId}|${row.jobUrl}`);
        if (row.country && row.country !== "United Kingdom")
            fail(`row ${line}: country "${row.country}"`);
        if (row.ats !== "Custom")
            fail(`row ${line}: ats "${row.ats}"`);
        if (row.salaryRange && !salaryPattern.test(row.salaryRange))
            fail(`row ${line}: salaryRange "${row.salaryRange}"`);
        for (const field of ["postedDate", "jdDeadline"]) {
            const value = row[field];
            if (!value)
                continue;
            if (!datePattern.test(value) || Number.isNaN(Date.parse(value)))
                fail(`row ${line}: ${field} "${value}"`);
        }
        if (row.jobUrl.includes("jobs.nhs.uk"))
            fail(`row ${line}: NHS Jobs URL`);
        if (!row.postedDate)
            blankDates++;
        if (!row.salaryRange)
            blankSalary++;
    }
    note(`blank postedDate: ${blankDates}; blank salaryRange: ${blankSalary}`);
    // --- labels and counts ----------------------------------------------------
    const counts = new Map();
    for (const row of csvRows)
        counts.set(row.company, (counts.get(row.company) ?? 0) + 1);
    for (const label of counts.keys()) {
        if (!(label in EXPECTED_ROWS))
            fail(`unexpected company label "${label}"`);
    }
    for (const [label, expected] of Object.entries(EXPECTED_ROWS)) {
        const actual = counts.get(label) ?? 0;
        if (actual !== expected)
            fail(`company "${label}" has ${actual} rows, expected ${expected}`);
        note(`label "${label}": ${actual}`);
    }
    const total = Object.values(EXPECTED_ROWS).reduce((a, b) => a + b, 0);
    if (csvRows.length !== total)
        fail(`row total ${csvRows.length} != expected ${total}`);
    // --- per-company folders --------------------------------------------------
    for (const [label, folder] of Object.entries(LABEL_TO_FOLDER)) {
        const dir = (0, node_path_1.join)(root, "jobs company wise", folder);
        const slice = csvRows.filter((r) => r.company === label);
        const csvPath = (0, node_path_1.join)(dir, "jobs.csv");
        const jsonPath = (0, node_path_1.join)(dir, "jobs.json");
        if (!(0, node_fs_1.existsSync)(csvPath) || !(0, node_fs_1.existsSync)(jsonPath)) {
            fail(`folder ${folder}: jobs.csv/jobs.json missing`);
            continue;
        }
        const { header: folderHeader, rows: folderRows } = readRows(csvPath);
        const folderJson = readJsonRows(jsonPath);
        if (folderHeader.join(",") !== COLUMNS.join(","))
            fail(`folder ${folder}: header mismatch`);
        note(`folder ${folder}: ${folderRows.length} rows (master slice ${slice.length})`);
        if (folderRows.length !== slice.length)
            fail(`folder ${folder}: ${folderRows.length} rows != master slice ${slice.length}`);
        if (folderJson.length !== folderRows.length)
            fail(`folder ${folder}: jobs.json ${folderJson.length} rows != jobs.csv ${folderRows.length}`);
        for (let i = 0; i < Math.min(folderRows.length, slice.length); i++) {
            if (canonicalRow(folderRows[i]) !== canonicalRow(slice[i])) {
                fail(`folder ${folder}: row ${i + 1} differs from master slice`);
                break;
            }
            if (canonicalRow(folderJson[i]) !== canonicalRow(folderRows[i])) {
                fail(`folder ${folder}: jobs.json row ${i + 1} differs from jobs.csv`);
                break;
            }
        }
    }
    for (const folder of EMPTY_FOLDERS) {
        const dir = (0, node_path_1.join)(root, "jobs company wise", folder);
        const csvPath = (0, node_path_1.join)(dir, "jobs.csv");
        const jsonPath = (0, node_path_1.join)(dir, "jobs.json");
        if (!(0, node_fs_1.existsSync)(csvPath) || !(0, node_fs_1.existsSync)(jsonPath)) {
            fail(`folder ${folder}: jobs.csv/jobs.json missing`);
            continue;
        }
        const { rows } = readRows(csvPath);
        if (rows.length !== 0)
            fail(`folder ${folder}: expected header-only CSV, found ${rows.length} rows`);
        if (readJsonRows(jsonPath).length !== 0)
            fail(`folder ${folder}: expected empty jobs.json`);
        note(`folder ${folder}: 0 rows (header-only) — no rows attributed under this folder`);
    }
    // --- ZIP ------------------------------------------------------------------
    const zipPath = (0, node_path_1.join)(root, "final.zip");
    if (args.package) {
        const entries = {};
        for (const rel of listFiles(root, zipInclude)) {
            entries[rel] = new Uint8Array((0, node_fs_1.readFileSync)((0, node_path_1.join)(root, ...rel.split("/"))));
        }
        (0, node_fs_1.writeFileSync)(zipPath, (0, fflate_1.zipSync)(entries, { level: 6 }));
        note(`final.zip rebuilt with ${Object.keys(entries).length} entries`);
    }
    if (!(0, node_fs_1.existsSync)(zipPath)) {
        fail("final.zip missing");
    }
    else {
        const unzipped = (0, fflate_1.unzipSync)(new Uint8Array((0, node_fs_1.readFileSync)(zipPath)));
        const zipNames = Object.keys(unzipped).sort();
        const expectedNames = listFiles(root, zipInclude);
        if (zipNames.join("|") !== expectedNames.join("|")) {
            const missing = expectedNames.filter((n) => !zipNames.includes(n));
            const extra = zipNames.filter((n) => !expectedNames.includes(n));
            fail(`ZIP entries differ (missing: ${missing.join(", ") || "-"}; extra: ${extra.join(", ") || "-"})`);
        }
        for (const rel of zipNames) {
            const diskPath = (0, node_path_1.join)(root, ...rel.split("/"));
            if (!(0, node_fs_1.existsSync)(diskPath)) {
                fail(`ZIP has ${rel} but disk does not`);
                continue;
            }
            if (sha256(Buffer.from(unzipped[rel])) !== sha256((0, node_fs_1.readFileSync)(diskPath))) {
                fail(`ZIP entry ${rel} differs from disk (sha256)`);
            }
        }
        const zipMaster = unzipped["companies.csv"];
        if (!zipMaster)
            fail("ZIP master CSV missing");
        else if (sha256(Buffer.from(zipMaster)) !== sha256((0, node_fs_1.readFileSync)(masterCsv)))
            fail("ZIP master CSV differs from disk");
        note(`final.zip: ${zipNames.length} entries, every entry matches disk, master CSV matches`);
    }
    // --- optional copy comparison --------------------------------------------
    if (args.compare) {
        const deliverable = listFiles(root, (rel) => rel !== "verification.json" && !rel.startsWith("archive/"));
        for (const rel of deliverable) {
            const other = (0, node_path_1.join)(args.compare, ...rel.split("/"));
            if (!(0, node_fs_1.existsSync)(other)) {
                fail(`compare: ${rel} missing in ${args.compare}`);
                continue;
            }
            if (sha256((0, node_fs_1.readFileSync)((0, node_path_1.join)(root, ...rel.split("/")))) !== sha256((0, node_fs_1.readFileSync)(other))) {
                fail(`compare: ${rel} differs from copy`);
            }
        }
        note(`compared ${deliverable.length} files against ${args.compare}`);
    }
    for (const line of notes)
        console.log(`  ${line}`);
    if (problems.length > 0) {
        console.error(`\nFAILED with ${problems.length} problem(s):`);
        for (const p of problems)
            console.error(` - ${p}`);
        process.exitCode = 1;
    }
    else {
        console.log(`\nPASS: ${root}`);
    }
    if (args.report) {
        (0, node_fs_1.writeFileSync)(args.report, JSON.stringify({ root, status: problems.length === 0 ? "pass" : "fail", notes, problems }, null, 2), "utf8");
        console.log(`report: ${args.report}`);
    }
}
if (process.argv[1]?.endsWith("verify-package-24-9-26.ts"))
    main();
