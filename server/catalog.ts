import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readSheet } from "read-excel-file/node";
import { canonicalUrl } from "../src/normalize.js";
import type { Selectors } from "../src/extract.js";

export interface Company {
  id: string;
  name: string;
  aliases: string[];
  slug: string;
  workbookRow: number;
  careersUrl: string;
  website: string;
  sitemapUrl: string;
  taken: boolean;
  resultDir?: string;
  summary?: Record<string, unknown>;
  mode?: "auto" | "api" | "static" | "dom";
  /** Extraction engine for the next run: classic pipeline or Jev judgment layer. */
  engine?: "deterministic" | "jev";
  apiUrl?: string;
  selectors?: Selectors;
  maxPages?: number;
  renderWaitMs?: number;
  sourceName?: string;
  sourceSheet?: string;
}

export async function jsonFile<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}

export function catalogFromRows(rows: unknown[][]): Company[] {
  const header = (rows[0] || []).map(value => String(value ?? "").toLowerCase().trim());
  const nameIndex = header.indexOf("company");
  const urlIndex = header.indexOf("career_url");
  const websiteIndex = header.indexOf("company_url");
  if (nameIndex < 0 || urlIndex < 0) throw new Error("Workbook needs company and career_url columns.");
  const companies = new Map<string, Company>();
  rows.slice(1).forEach((row, index) => {
    const name = String(row[nameIndex] ?? "").trim();
    const careersUrl = canonicalUrl(String(row[urlIndex] ?? ""));
    if (!name || !careersUrl) return;
    const existing = companies.get(careersUrl);
    if (existing) { if (existing.name !== name) existing.aliases.push(name); return; }
    const id = createHash("sha256").update(careersUrl).digest("hex").slice(0, 12);
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "company"}-${id.slice(0, 5)}`;
    companies.set(careersUrl, {
      id, name, slug, aliases: [], careersUrl,
      website: canonicalUrl(String(row[websiteIndex] ?? "")), sitemapUrl: "",
      workbookRow: index + 2, taken: false,
    });
  });
  return [...companies.values()];
}

export async function loadCatalog(root: string): Promise<{ companies: Company[]; workbookRows: number }> {
  let rows: unknown[][] = [];
  try { rows = await readSheet(resolve(root, "COMPANIE LIST.xlsx"), 1); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Default workbook could not be read; use Upload to choose a file and map its columns.");
  }
  let companies: Company[] = [];
  try { if (rows.length) companies = catalogFromRows(rows); }
  catch { console.warn("Default workbook needs column mapping. Import it through Upload."); }
  await attachHistory(root, companies);
  return { companies, workbookRows: Math.max(0, rows.length - 1) };
}

export async function attachHistory(root: string, companies: Company[]) {
  const selected = await jsonFile<Record<string, unknown>[]>(resolve(root, "output/_tracking/selected-companies.json"), []);
  const completed = await jsonFile<{ summaries: Record<string, unknown>[] }>(resolve(root, "output/_tracking/completed-companies.json"), { summaries: [] });
  const taken = await jsonFile<{ company: string }[]>(resolve(root, "output/_tracking/taken-companies.json"), []);
  for (const company of companies) {
    const match = selected.find(item => canonicalUrl(String(item.careersUrl)) === company.careersUrl);
    const summary = completed.summaries.find(item => canonicalUrl(String(item.sourceUrl)) === company.careersUrl);
    if (match && /^[a-z0-9-]+$/.test(String(match.slug))) {
      company.slug = String(match.slug);
      company.sitemapUrl = canonicalUrl(String(match.sitemapUrl || ""));
    }
    if (summary) {
      company.summary = summary;
      company.resultDir = resolve(root, "output", company.slug);
    }
    company.taken = taken.some(item => [company.name, ...company.aliases].some(name => name.toLowerCase() === item.company.toLowerCase()));
  }
}
