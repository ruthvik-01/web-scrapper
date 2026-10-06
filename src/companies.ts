import { readFile } from "node:fs/promises";
import type { BatchCompany } from "./batch.js";
import { assertAllowedJobSource } from "./uk-scope.js";

export const PLATFORMS = [
  "comeet",
  "eploy",
  "jobtrain",
  "wordpress",
  "custom",
  "reed",
  "haystack",
  "tribepad",
  "jobadder",
  "portobello",
  "occy",
  "supabase",
  "jobtoday",
] as const;

export type Platform = typeof PLATFORMS[number];

export interface UniversalCompany extends BatchCompany {
  platform: Platform;
  country: "UK";
  sitemapUrl?: string;
  notes?: string;
}

export interface HeldCompany {
  slug: string;
  name: string;
  platform: string;
  reason: string;
  requiredToMigrate: string;
  sourceUrl: string;
}

export function validateCompanies(input: unknown): UniversalCompany[] {
  if (!Array.isArray(input) || !input.length) throw new Error("Companies must be a nonempty array.");
  const seen = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object") throw new Error("Invalid company configuration.");
    const config = value as UniversalCompany;
    if (typeof config.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(config.slug)) {
      throw new Error(`Invalid company slug: ${config.slug}`);
    }
    if (seen.has(config.slug)) throw new Error(`Company slug must be unique: ${config.slug}`);
    seen.add(config.slug);
    if (typeof config.name !== "string" || !config.name.trim()) {
      throw new Error(`Company name is required for slug: ${config.slug}`);
    }
    if (!PLATFORMS.includes(config.platform)) {
      throw new Error(`Unsupported platform '${config.platform}' for company '${config.slug}'.`);
    }
    if (config.country !== "UK") throw new Error("Only UK scope is supported.");
    assertAllowedJobSource(config.careersUrl);
    for (const url of [config.sitemapUrl, config.options?.sitemapUrl, config.options?.apiUrl]) {
      if (url) assertAllowedJobSource(url);
    }
    for (const list of [config.employerNames, config.titlePrefixes]) {
      if (list !== undefined && (!Array.isArray(list) || !list.length || list.some(item => typeof item !== "string" || !item.trim()))) {
        throw new Error("Scope filters must contain nonempty strings.");
      }
    }
    for (const key of ["maxPages", "timeoutMs", "delayMs", "renderWaitMs"] as const) {
      const number = config.options?.[key];
      if (number !== undefined && (!Number.isSafeInteger(number) || number < (key === "maxPages" || key === "timeoutMs" ? 1 : 0))) {
        throw new Error(`Invalid ${key}.`);
      }
    }
    if (config.options?.mode && !["auto", "api", "static", "dom"].includes(config.options.mode)) {
      throw new Error("Invalid extraction mode.");
    }
    if (config.options?.browser && !["chromium", "chrome", "msedge"].includes(config.options.browser)) {
      throw new Error("Invalid browser.");
    }
  }
  return input as UniversalCompany[];
}

import { existsSync } from "node:fs";

export async function loadCompanies(file?: URL | string): Promise<UniversalCompany[]> {
  if (file) {
    return validateCompanies(JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")));
  }
  const candidateUrls = [
    new URL("../config/companies.json", import.meta.url),
    new URL("../../config/companies.json", import.meta.url),
    new URL("./config/companies.json", import.meta.url),
  ];
  for (const url of candidateUrls) {
    if (existsSync(url)) {
      return validateCompanies(JSON.parse((await readFile(url, "utf8")).replace(/^\uFEFF/, "")));
    }
  }
  throw new Error("Unable to locate config/companies.json catalog.");
}

export async function loadHeldCompanies(file?: URL | string): Promise<HeldCompany[]> {
  if (file) {
    try {
      return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    } catch {
      return [];
    }
  }
  const candidateUrls = [
    new URL("../config/companies-held.json", import.meta.url),
    new URL("../../config/companies-held.json", import.meta.url),
    new URL("./config/companies-held.json", import.meta.url),
  ];
  for (const url of candidateUrls) {
    if (existsSync(url)) {
      try {
        return JSON.parse((await readFile(url, "utf8")).replace(/^\uFEFF/, ""));
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function selectCompanies(
  companies: UniversalCompany[],
  held: HeldCompany[],
  selection: { company?: string | string[]; platform?: string; all?: boolean }
): UniversalCompany[] {
  if (selection.company !== undefined && selection.all) throw new Error("Choose a company or --all, not both.");
  const platform = selection.platform?.trim().toLowerCase();
  if (platform !== undefined && !PLATFORMS.includes(platform as Platform)) {
    throw new Error(`Unsupported platform: ${selection.platform}`);
  }
  if (Array.isArray(selection.company)) {
    if (!selection.company.length) throw new Error("Choose at least one company.");
    const slugs = new Set(selection.company.flatMap(name => selectCompanies(companies, held, { company: name, platform }).map(company => company.slug)));
    return companies.filter(company => slugs.has(company.slug));
  }
  let selected = companies;
  if (selection.company !== undefined) {
    const query = selection.company.trim().toLowerCase();
    const matches = (company: { slug: string; name: string }) => company.slug.toLowerCase() === query || company.name.trim().toLowerCase() === query;
    const blocked = held.find(matches);
    if (blocked) throw new Error(`${blocked.slug} is held: ${blocked.reason}`);
    selected = companies.filter(matches);
    if (!selected.length) throw new Error(`Unknown company: ${selection.company}`);
    if (selected.length > 1) throw new Error(`Ambiguous company name: ${selection.company}; use its slug.`);
  }
  if (platform !== undefined) selected = selected.filter(company => company.platform === platform);
  if (!selected.length) throw new Error("No configured companies match the selected platform.");
  return selected;
}

export async function selectCompany(nameOrSlug: string): Promise<UniversalCompany> {
  return selectCompanies(await loadCompanies(), await loadHeldCompanies(), { company: nameOrSlug })[0]!;
}
