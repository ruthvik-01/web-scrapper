#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LABEL_TO_FOLDER = void 0;
exports.relabelCsv = relabelCsv;
exports.relabelJson = relabelJson;
/**
 * Relabel the `company` column values of the 24 September 2026 delivery to the
 * requested spreadsheet names.
 *
 * Requested (user) names, 24 September 2026:
 *   Rodericks Dental Partners  -> PRDC Dental
 *   Operations Resources Limited -> Operations Resources
 *   Pinpoint Resourcing Ltd    -> Pinpoint Resourcing ltd
 *
 * The rewrite is field-accurate and byte-preserving: only the `company` field is
 * touched, so descriptions that mention the same phrases are never modified.
 *
 * Usage (from web_scrapper_project/):
 *   npx tsx scripts/relabel-company-labels.ts --root "D:\\...\\2026-09-24-main-uk-scrape"
 *   npx tsx scripts/relabel-company-labels.ts --root "..." --apply
 *
 * Without --apply it is a dry run: it reports the replacement counts it would make.
 */
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Old label -> requested label, with the row count expected in each file. */
const COMPANY_MAP = {
    "Rodericks Dental Partners": { to: "PRDC Dental", rows: 346 },
    "Operations Resources Limited": { to: "Operations Resources", rows: 3 },
    "Pinpoint Resourcing Ltd": { to: "Pinpoint Resourcing ltd", rows: 10 },
};
/** Requested label -> delivery folder that holds its rows (folder names unchanged). */
exports.LABEL_TO_FOLDER = {
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
/** Delivery folders whose per-company jobs.csv/jobs.json carry a mapped label. */
const MAPPED_FOLDERS = {
    "rodericks-dental-partners": "Rodericks Dental Partners",
    "operations-resources-limited": "Operations Resources Limited",
    "pinpoint-resourcing-ltd": "Pinpoint Resourcing Ltd",
};
/** Order-insensitive canonical form of a label -> count map. */
function canonicalCounts(counts) {
    return JSON.stringify(Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b)));
}
/** Split one CSV record into fields, keeping each field's raw start/end offsets. */
function parseRecord(text, start) {
    const fields = [];
    let i = start;
    const n = text.length;
    for (;;) {
        const from = i;
        if (text[i] === '"') {
            i++;
            for (;;) {
                if (i >= n)
                    break;
                if (text[i] === '"') {
                    if (text[i + 1] === '"') {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
        }
        else {
            while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r")
                i++;
        }
        fields.push({ raw: text.slice(from, i), from, to: i });
        if (i >= n)
            return { fields, next: n };
        if (text[i] === ",") {
            i++;
            continue;
        }
        const next = text[i] === "\r" && text[i + 1] === "\n" ? i + 2 : i + 1;
        return { fields, next };
    }
}
function unquote(raw) {
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        return raw.slice(1, -1).replace(/""/g, '"');
    }
    return raw;
}
/** Field-accurate, byte-preserving rewrite of the `company` column of a CSV. */
function relabelCsv(text, map) {
    const header = parseRecord(text, 0);
    const companyCol = header.fields.findIndex((f) => unquote(f.raw) === "company");
    if (companyCol < 0)
        throw new Error("CSV header has no `company` column");
    const counts = new Map();
    const edits = [];
    let i = header.next;
    let recordIndex = 0;
    while (i < text.length) {
        const { fields, next } = parseRecord(text, i);
        const field = fields[companyCol];
        if (field) {
            const value = unquote(field.raw);
            const target = map[value];
            if (target) {
                counts.set(value, (counts.get(value) ?? 0) + 1);
                edits.push({ from: field.from, to: field.to, value: target.to, quoted: field.raw.startsWith('"') });
            }
        }
        recordIndex++;
        i = next;
    }
    if (recordIndex === 0)
        throw new Error("CSV has a header but no data rows");
    let out = "";
    let last = 0;
    for (const e of edits) {
        out += text.slice(last, e.from) + (e.quoted ? `"${e.value.replace(/"/g, '""')}"` : e.value);
        last = e.to;
    }
    out += text.slice(last);
    const replacements = [...counts.entries()].map(([oldLabel, count]) => ({ oldLabel, newLabel: map[oldLabel].to, count }));
    return { text: out, replacements };
}
/** Targeted rewrite of the JSON `"company": "<old>"` tokens. */
function relabelJson(text, map) {
    let out = text;
    const replacements = [];
    for (const [oldLabel, { to }] of Object.entries(map)) {
        const needle = `"company": ${JSON.stringify(oldLabel)}`;
        const next = `"company": ${JSON.stringify(to)}`;
        const count = out.split(needle).length - 1;
        if (count > 0)
            out = out.split(needle).join(next);
        replacements.push({ oldLabel, newLabel: to, count });
    }
    return { text: out, replacements };
}
function parseArgs(argv) {
    const args = { root: "", apply: false, report: "" };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--root")
            args.root = argv[++i] ?? "";
        else if (a === "--apply")
            args.apply = true;
        else if (a === "--report")
            args.report = argv[++i] ?? "";
    }
    if (!args.root)
        throw new Error("--root <delivery folder> is required");
    return args;
}
function plan(root) {
    const masterExpected = Object.fromEntries(Object.entries(COMPANY_MAP).map(([old, v]) => [old, v.rows]));
    const files = [
        { path: (0, node_path_1.join)(root, "companies.csv"), kind: "csv", expected: masterExpected },
        { path: (0, node_path_1.join)(root, "companies.json"), kind: "json", expected: masterExpected },
        { path: (0, node_path_1.join)(root, "jobs company wise", "companies.json"), kind: "json", expected: masterExpected },
    ];
    for (const [folder, oldLabel] of Object.entries(MAPPED_FOLDERS)) {
        const expected = { [oldLabel]: COMPANY_MAP[oldLabel].rows };
        files.push({ path: (0, node_path_1.join)(root, "jobs company wise", folder, "jobs.csv"), kind: "csv", expected });
        files.push({ path: (0, node_path_1.join)(root, "jobs company wise", folder, "jobs.json"), kind: "json", expected });
    }
    return files;
}
function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = [];
    let failures = 0;
    for (const file of plan(args.root)) {
        if (!(0, node_fs_1.existsSync)(file.path)) {
            console.error(`MISSING ${file.path}`);
            failures++;
            continue;
        }
        const before = (0, node_fs_1.readFileSync)(file.path, "utf8");
        const result = file.kind === "csv" ? relabelCsv(before, COMPANY_MAP) : relabelJson(before, COMPANY_MAP);
        const seen = Object.fromEntries(result.replacements.map((r) => [r.oldLabel, r.count]));
        const ok = canonicalCounts(seen) === canonicalCounts(file.expected);
        console.log(`${ok ? "ok  " : "FAIL"} ${file.path}`);
        for (const r of result.replacements) {
            console.log(`       ${r.count} x "${r.oldLabel}" -> "${r.newLabel}"`);
        }
        if (!ok) {
            console.error(`       expected ${canonicalCounts(file.expected)}`);
            failures++;
        }
        const after = result.text;
        if (args.apply && ok) {
            if (Buffer.byteLength(after, "utf8") === Buffer.byteLength(before, "utf8") && after === before) {
                console.log("       unchanged (already relabelled)");
            }
            else {
                (0, node_fs_1.writeFileSync)(file.path, after, "utf8");
            }
        }
        report.push({ file: file.path, kind: file.kind, expected: file.expected, seen, applied: args.apply && ok });
    }
    if (args.report) {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(args.report), { recursive: true });
        (0, node_fs_1.writeFileSync)(args.report, JSON.stringify({ applied: args.apply, failures, files: report }, null, 2), "utf8");
        console.log(`report: ${args.report}`);
    }
    if (failures > 0)
        process.exitCode = 1;
}
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("relabel-company-labels.ts")) {
    main();
}
