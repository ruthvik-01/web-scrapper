import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import * as XLSX from "xlsx";
import { Imports, mapImport, publicUrl, suggestMapping } from "../server/imports.js";
import { parseWorkbook } from "../server/parse-workbook.js";
import type { SheetData } from "../server/import-types.js";
import { dashboardFixture } from "./dashboard-helpers.js";
import { zipSync } from "fflate";
import { createDashboard } from "../server/app.js";
import { once } from "node:events";

test("mapping detects alternative headers, metadata rows, and URL-only lists", () => {
  const sheet: SheetData = {
    name: "New firms", links: {},
    rows: [["Export for September"], [], ["Organisation", "Careers Link"], ["Example", "https://example.com/careers"]],
  };
  const mapping = suggestMapping(sheet, 0);
  assert.equal(mapping.headerRow, 2);
  assert.equal(mapping.nameColumn, 0);
  assert.equal(mapping.urlColumn, 1);
  const mapped = mapImport([sheet], mapping, "companies.xlsx");
  assert.equal(mapped.companies[0]!.workbookRow, 4);
  assert.equal(mapped.companies[0]!.name, "Example");
  const urlOnly: SheetData = { name: "Links", links: {}, rows: [["example.org/jobs"], ["https://other.example/careers"]] };
  const guessed = suggestMapping(urlOnly, 0);
  assert.equal(guessed.headerRow, -1);
  assert.equal(mapImport([urlOnly], guessed, "links.csv").companies[0]!.name, "example.org");
});

test("URL mapping uses hyperlinks, rejects unsafe values, and preserves row numbers", () => {
  const sheet: SheetData = { name: "Companies", rows: [
    ["Business", "Link"], ["Linked name", "Click here"], ["Bad", "javascript:alert(1)"], ["Private", "http://127.0.0.1/admin"], [],
  ], links: { "1:1": "https://example.com/jobs" } };
  const result = mapImport([sheet], { sheet: 0, headerRow: 0, nameColumn: 0, urlColumn: 1 }, "file.xlsx");
  assert.equal(result.companies.length, 1);
  assert.equal(result.companies[0]!.careersUrl, "https://example.com/jobs");
  assert.deepEqual(result.rejected.map(row => row.row), [3, 4]);
  assert.equal(result.emptyRows, 1);
  assert.equal(publicUrl("https://user:password@example.com"), "");
  assert.equal(publicUrl("https://example.com/jobs?api_key=secret"), "");
  assert.equal(publicUrl("www.example.com/jobs"), "https://www.example.com/jobs");
  assert.throws(() => mapImport([sheet], { sheet: 0, headerRow: 0, nameColumn: 0, urlColumn: 99 }, "x"), /range/);
});

test("reader supports XLSX, XLSM, XLSB, legacy XLS, CSV and TSV without calculating formulas", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-formats-"));
  try {
    for (const [extension, bookType] of [["xlsx", "xlsx"], ["xlsm", "xlsm"], ["xlsb", "xlsb"], ["xls", "biff8"]] as const) {
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([["Company name", "Website"], ["Müller & Sons", "https://example.org/jobs"]]);
      sheet.A3 = { t: "n", v: 7, f: "1+1" };
      sheet["!ref"] = "A1:B3";
      XLSX.utils.book_append_sheet(book, sheet, "Companies");
      const path = join(root, `source.${extension}`);
      await writeFile(path, XLSX.write(book, { type: "buffer", bookType }));
      const data = await parseWorkbook(path);
      assert.equal(data[0]!.rows[1]![0], "Müller & Sons", extension);
      assert.equal(data[0]!.rows[2]![0], "7", "Use cached formula value; do not execute 1+1.");
    }
    for (const [ext, delimiter] of [["csv", ","], ["tsv", "\t"]]) {
      const path = join(root, `source.${ext}`);
      await writeFile(path, `Employer${delimiter}URL\nExample${delimiter}https://example.com\n`);
      assert.equal((await parseWorkbook(path))[0]!.rows[1]![1], "https://example.com");
    }
    const linksBook = XLSX.utils.book_new();
    const linksSheet = XLSX.utils.aoa_to_sheet([["Company", "Link"], ["Example", "Careers"]]);
    linksSheet.B2 = { t: "s", v: "Careers", f: 'HYPERLINK("https://example.com/jobs","Careers")' };
    XLSX.utils.book_append_sheet(linksBook, linksSheet, "Links");
    const linksPath = join(root, "links.xlsx");
    await writeFile(linksPath, XLSX.write(linksBook, { type: "buffer", bookType: "xlsx" }));
    assert.equal((await parseWorkbook(linksPath))[0]!.links["1:1"], "https://example.com/jobs");
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    await rm(root, { recursive: true, force: true });
  }
});

test("upload preview and explicit commit append/merge companies while preserving exports and taken assignments", async () => {
  const fixture = await dashboardFixture();
  try {
    const csv = [
      "Company name,Website,Public API URL",
      `Alias for existing,${fixture.companies[0]!.careersUrl},`,
      "New Company,https://new.example/careers,https://new.example/jobs.json",
      "No URL,not a url,",
    ].join("\n");
    const before = await readFile(join(fixture.companies[0]!.resultDir!, "jobs.csv"), "utf8");
    const upload = await fetch(`${fixture.base}/api/imports/preview`, {
      method: "POST", headers: { Origin: fixture.base, "X-Workspace-Token": fixture.dashboard.token,
        "Content-Type": "application/octet-stream", "X-Upload-Name": "new-companies.csv" }, body: csv,
    });
    assert.equal(upload.status, 200);
    const preview = await upload.json();
    assert.equal((await (await fetch(`${fixture.base}/api/dashboard`)).json()).companies.length, 8, "Preview must not import yet.");
    const response = await fixture.post(`/api/imports/${preview.id}/commit`, { mapping: preview.sheets[0].mapping });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.added, 1);
    assert.equal(result.merged, 1);
    assert.equal(result.rejected, 1);
    const after = await (await fetch(`${fixture.base}/api/dashboard`)).json();
    assert.equal(after.companies.length, 9);
    assert.equal(after.companies[0].hasOutput, true);
    assert.equal(after.companies[7].taken, true);
    assert.equal(after.companies.find((company: { name: string }) => company.name === "New Company").apiUrl, "https://new.example/jobs.json");
    assert.equal(await readFile(join(fixture.companies[0]!.resultDir!, "jobs.csv"), "utf8"), before);
    const persisted = JSON.parse(await readFile(join(fixture.root, "output/_tracking/ui-state.json"), "utf8"));
    assert.equal(persisted.imports.length, 1);
    assert.equal((await fixture.post(`/api/imports/${preview.id}/commit`, { mapping: preview.sheets[0].mapping })).status, 400, "Consumed preview cannot be imported again.");
  } finally { await fixture.close(); }
});

test("company extraction settings are validated and persisted", async () => {
  const fixture = await dashboardFixture();
  try {
    const id = fixture.companies[1]!.id;
    const settings = { mode: "dom", apiUrl: "", sitemapUrl: "", maxPages: 100, renderWaitMs: 2000, selectors: { title: "h1", description: ".job-description" } };
    assert.equal((await fixture.post(`/api/companies/${id}/settings`, settings)).status, 200);
    const data = await (await fetch(`${fixture.base}/api/dashboard`)).json();
    assert.equal(data.companies[1].mode, "dom");
    assert.equal(data.companies[1].selectors.description, ".job-description");
    assert.equal((await fixture.post(`/api/companies/${id}/settings`, { ...settings, mode: "magic" })).status, 400);
    assert.equal((await fixture.post(`/api/companies/${id}/settings`, { ...settings, apiUrl: "http://127.0.0.1/secrets" })).status, 400);
    assert.equal((await fixture.post(`/api/companies/${id}/settings`, { ...settings, selectors: { execute: "anything" } })).status, 400);
  } finally { await fixture.close(); }
});

test("unsupported uploads and oversized ZIP metadata are rejected without importing data", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-import-limits-"));
  const imports = new Imports(root);
  try {
    await assert.rejects(imports.preview(Buffer.from("anything"), "run.exe"), /Excel/);
    await assert.rejects(imports.preview(Buffer.alloc(10 * 1024 * 1024 + 1), "large.xlsx"), /10 MB/);
    const bytes = Buffer.from(zipSync({ "test.xml": new Uint8Array([1]) }));
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.ok(central >= 0);
    bytes.writeUInt32LE(65 * 1024 * 1024, central + 24);
    await assert.rejects(imports.preview(bytes, "oversized.xlsx"), /expanded workbook/);
    assert.deepEqual(await readdir(root), []);
  } finally { await imports.close(); await rm(root, { recursive: true, force: true }); }
});

test("imported companies and mapped endpoints survive a server restart", async () => {
  const fixture = await dashboardFixture();
  const original = structuredClone(fixture.companies);
  let restarted: Awaited<ReturnType<typeof createDashboard>> | undefined;
  try {
    const csv = `Company,Website,API URL\nExisting alias,${original[0]!.careersUrl},https://feed.example/jobs\nNew saved site,https://persisted.example/jobs,\n`;
    const response = await fetch(`${fixture.base}/api/imports/preview`, {
      method: "POST", headers: { Origin: fixture.base, "X-Workspace-Token": fixture.dashboard.token, "X-Upload-Name": "persist.csv" }, body: csv,
    });
    const preview = await response.json();
    await fixture.post(`/api/imports/${preview.id}/commit`, { mapping: preview.sheets[0].mapping });
    await fixture.app.close();
    restarted = await createDashboard({ root: fixture.root, companies: original });
    restarted.server.listen(0, "127.0.0.1");
    await once(restarted.server, "listening");
    const address = restarted.server.address();
    assert.ok(address && typeof address === "object");
    const data = await (await fetch(`http://127.0.0.1:${address.port}/api/dashboard`)).json();
    assert.equal(data.companies.length, 9);
    assert.equal(data.companies[0].apiUrl, "https://feed.example/jobs");
    assert.equal(data.sources.length, 2);
  } finally { await restarted?.close(); await fixture.close(); }
});
