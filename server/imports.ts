import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalUrl } from "../src/normalize.js";
import { catalogFromRows, type Company } from "./catalog.js";
import { IMPORT_LIMITS, type ImportMapping, type SheetData } from "./import-types.js";

export function publicUrl(input: string): string {
  if (input.length > 8192) return "";
  let value = input.trim();
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-z]+:/i.test(value) && /^(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(value)) value = `https://${value}`;
  const url = canonicalUrl(value);
  if (!url) return "";
  if ([...new URL(url).searchParams.keys()].some(key => /^(api_?key|access_token|auth_token|password|secret)$/i.test(key))) return "";
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::|f[cd][0-9a-f]{2}:|fe80:)/.test(host) ||
    /\.(local|internal|localhost)$/.test(host) || /^\d+$/.test(host)) return "";
  return url;
}
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const names = ["company", "companyname", "employer", "employername", "organization", "organisation", "businessname", "name"];
const urls = ["careerurl", "careersurl", "careerpage", "careerspage", "careerslink", "joburl", "jobsurl", "jobboardurl", "url", "link", "website", "websiteurl", "companyurl"];
const websites = ["companyurl", "companywebsite", "website", "websiteurl", "homepage"];

export function suggestMapping(sheet: SheetData, index: number): ImportMapping {
  let best = -1, bestScore = 0;
  sheet.rows.slice(0, 25).forEach((row, i) => {
    const cells = row.map(normalize);
    const score = (cells.some(cell => names.includes(cell)) ? 2 : 0) +
      (cells.some(cell => urls.includes(cell)) ? 3 : 0);
    if (row.some(value => publicUrl(value)) ||
      (score < 3 && row.some((_, c) => publicUrl(sheet.links[`${i}:${c}`] || "")))) return;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  const headers = best >= 0 ? sheet.rows[best]!.map(normalize) : [];
  const pick = (candidates: string[]) => {
    for (const candidate of candidates) { const found = headers.indexOf(candidate); if (found >= 0) return found; }
    return -1;
  };
  let urlColumn = pick(urls);
  if (urlColumn < 0) {
    const counts = new Map<number, number>();
    sheet.rows.slice(0, 15).forEach((row, r) => row.forEach((value, c) => {
      if (publicUrl(sheet.links[`${r}:${c}`] || "") || publicUrl(value)) counts.set(c, (counts.get(c) || 0) + 1);
    }));
    urlColumn = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  }
  return { sheet: index, headerRow: best, nameColumn: pick(names), urlColumn,
    websiteColumn: pick(websites), apiColumn: pick(["apiurl", "apiendpoint", "publicapiurl"]),
    sitemapColumn: pick(["sitemapurl", "jobsitemap", "sitemap"]) };
}

export function mapImport(sheets: SheetData[], mapping: ImportMapping, sourceName: string) {
  const sheet = sheets[mapping.sheet];
  if (!Number.isInteger(mapping.sheet) || !sheet || !Number.isInteger(mapping.headerRow) || mapping.headerRow < -1 || mapping.headerRow >= sheet.rows.length) throw new Error("Choose a valid worksheet and header row.");
  const width = Math.max(0, ...sheet.rows.map(row => row.length));
  for (const [key, index] of Object.entries(mapping)) {
    if (["sheet", "headerRow"].includes(key)) continue;
    if (!Number.isInteger(index) || index < -1 || index >= width) throw new Error("Column mapping is out of range.");
  }
  if (!Number.isInteger(mapping.urlColumn) || mapping.urlColumn < 0 || !Number.isInteger(mapping.nameColumn)) throw new Error("Select the website/careers URL column and company-name option.");
  const companies: Company[] = [];
  const rejected: { row: number; reason: string }[] = [];
  let emptyRows = 0;
  for (let r = mapping.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]!;
    if (!row.some(value => value.trim())) { emptyRows++; continue; }
    const link = (column: number | undefined) => column === undefined || column < 0 ? "" :
      publicUrl(sheet.links[`${r}:${column}`] || "") || publicUrl(row[column] || "");
    const url = link(mapping.urlColumn);
    if (!url) { rejected.push({ row: r + 1, reason: "Missing or invalid public HTTP(S) website/careers URL." }); continue; }
    const suppliedName = mapping.nameColumn < 0 ? "" : (row[mapping.nameColumn] || "").trim();
    const name = suppliedName || new URL(url).hostname.replace(/^www\./, "");
    if (name.length > 240) { rejected.push({ row: r + 1, reason: "Company name is too long. Check the name-column mapping." }); continue; }
    const company = catalogFromRows([["company", "company_url", "career_url"], [name, link(mapping.websiteColumn), url]])[0]!;
    company.workbookRow = r + 1;
    company.sitemapUrl = link(mapping.sitemapColumn);
    company.apiUrl = link(mapping.apiColumn);
    company.sourceName = sourceName;
    company.sourceSheet = sheet.name;
    companies.push(company);
  }
  return { companies, rejected, emptyRows, inputRows: sheet.rows.length - mapping.headerRow - 1 };
}

interface Pending { id: string; name: string; directory: string; sheets: SheetData[]; committing?: boolean }
export class Imports {
  private pending = new Map<string, Pending>();
  private children = new Set<ChildProcess>();
  private directories = new Set<string>();
  private closed = false;
  constructor(private root: string) {}
  async cleanupStale() {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) await this.removeDirectory(resolve(this.root, entry.name));
    }
  }
  async preview(bytes: Buffer, fileName: string) {
    if (this.closed) throw new Error("The server is stopping.");
    const fullName = basename(fileName.replace(/\\/g, "/"));
    const extension = extname(fullName).toLowerCase();
    const name = fullName.length > 200 ? `${fullName.slice(0, 200 - extension.length)}${extension}` : fullName;
    if (![".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".tsv"].includes(extension)) throw new Error("Choose an Excel, CSV, or TSV file.");
    if (!bytes.length || bytes.length > IMPORT_LIMITS.bytes) throw new Error("Choose a nonempty file no larger than 10 MB.");
    if (this.pending.size >= 3) throw new Error("Finish or cancel an existing import before uploading another.");
    const id = randomUUID();
    const directory = resolve(this.root, id);
    await mkdir(directory, { recursive: true });
    this.directories.add(directory);
    const file = resolve(directory, `input${extension}`);
    await writeFile(file, bytes);
    try {
      const sheets = await new Promise<SheetData[]>((resolveParse, reject) => {
        const child = fork(resolve(dirname(fileURLToPath(import.meta.url)), "parse-workbook.ts"), [file], {
          execArgv: ["--max-old-space-size=256", "--import", import.meta.resolve("tsx")], silent: true,
        });
        this.children.add(child);
        const timer = setTimeout(() => { child.kill(); reject(new Error("Parsing exceeded the time limit. Try a smaller workbook.")); }, 20_000);
        let delivered = false;
        child.on("message", message => {
          delivered = true;
          const value = message as { sheets?: SheetData[]; error?: string };
          clearTimeout(timer);
          if (value.sheets) resolveParse(value.sheets);
          else reject(new Error(value.error || "Could not read this workbook."));
        });
        child.on("error", error => { clearTimeout(timer); reject(error); });
        child.on("exit", code => { this.children.delete(child); clearTimeout(timer); if (code || !delivered) reject(new Error("The workbook could not be parsed within the resource limit.")); });
      });
      if (this.closed) throw new Error("The server stopped while reading the file.");
      this.pending.set(id, { id, name, directory, sheets });
      return { id, name, sheets: sheets.map((sheet, index) => ({
        index, name: sheet.name, rowCount: sheet.rows.length,
        width: Math.max(0, ...sheet.rows.map(row => row.length)),
        sample: sheet.rows.slice(0, 30), mapping: suggestMapping(sheet, index),
        sampleLinks: Object.fromEntries(Object.entries(sheet.links).filter(([cell]) => Number(cell.split(":")[0]) < 30)),
      })) };
    } catch (error) {
      await this.removeDirectory(directory);
      this.directories.delete(directory);
      throw error;
    }
  }
  get(id: string): Pending {
    const value = this.pending.get(id);
    if (!value) throw new Error("This import has expired. Upload the file again.");
    return value;
  }
  async discard(id: string) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    await this.removeDirectory(pending.directory);
    this.directories.delete(pending.directory);
  }
  private async removeDirectory(directory: string) {
    if (!resolve(directory).startsWith(resolve(this.root) + sep)) throw new Error("Unsafe temporary path.");
    await rm(directory, { recursive: true, force: true });
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.children].map(child => new Promise<void>(done => {
      child.once("exit", () => done());
      if (!child.kill()) done();
    })));
    for (const directory of this.directories) await this.removeDirectory(directory);
    this.pending.clear(); this.directories.clear();
  }
}
