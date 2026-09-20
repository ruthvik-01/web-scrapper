import { load } from "cheerio";

export interface JobLocation {
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

export interface RawJob {
  title: string;
  description: string;
  jobUrl: string;
  postedDate?: string;
  jdDeadline?: string;
  salaryText?: string;
  employmentType?: string;
  worktype?: string;
  locationText?: string;
  /** Source hiring organisation, used for employer scoping. */
  company?: string;
  /** Source identifier when the page provides one. */
  jobId?: string;
  locations: JobLocation[];
}

export const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
export const array = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export function plainText(value: unknown): string {
  const html = text(value);
  const $ = load(html.replace(/<(?:br\s*\/?|\/(?:p|div|li|h[1-6]))>/gi, "\n"));
  $("script, style").remove();
  return $.text().replace(/\r/g, "").replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function canonicalUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|gh_src|lever-source|lever-origin)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return "";
  }
}

const ukCountries = new Set([
  "uk", "gb", "gbr", "united kingdom", "great britain", "britain",
  "united kingdom of great britain and northern ireland",
]);
const ukNations = new Set(["england", "scotland", "wales", "northern ireland"]);
const key = (value: string): string => value.toLowerCase().replace(/\./g, "").trim();
/** Sites like Topps publish "-" or "N/A" as a country placeholder. */
const placeholder = new Set(["-", "--", "n/a", "na", "none", "null", "unknown", "tbd", "other"]);
export const isUnknownCountry = (value: string): boolean => placeholder.has(key(value));
export const isUkCountry = (value: string): boolean => !isUnknownCountry(value) && (ukCountries.has(key(value)) || ukNations.has(key(value)));

export interface SalaryInfo {
  range: string;      // e.g. "£42500-£45000" or "£24785" — annual only
  kind: "annual" | "hourly" | "daily" | "doe" | "none";
  text: string;       // original text for context
}

/**
 * Parse a salary string deterministically. Returns the £ amount(s) verbatim;
 * never invents a value. `kind` is a first-pass guess that Jev later confirms.
 */
export function parseSalary(raw: string): SalaryInfo {
  const value = raw.trim();
  if (!value || /^(?:null|n\/?a|not specified|not disclosed)$/i.test(value)) {
    return { range: "", kind: "none", text: "" };
  }
  const qualifier = /\bd\s*\.?\s*o\s*\.?\s*e\b|depending on experience|competitive|negotiable/i;
  if (qualifier.test(value)) return { range: "", kind: "doe", text: value };
  const numeric = value.replace(/,/g, "");
  const amounts: string[] = [];
  const first = /(?:£\s*|\bGBP\s*)(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(numeric);
  if (first) {
    amounts.push(`£${first[2] ? Number(first[1]) * 1000 : first[1]}`);
    const rest = numeric.slice(first.index + first[0].length);
    const next = /^\s*(?:[-–—]|to\b)\s*(?:£\s*|\bGBP\s*)?(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(rest);
    if (next) amounts.push(`£${next[2] ? Number(next[1]) * 1000 : next[1]}`);
  }
  const hourly = /per\s*hour|\/\s*(?:h(?:ou)?r|hour)\b|\bhourly\b|\d\s*p\.?\s*h\b/i.test(value);
  const daily = /per\s*day|\/\s*day\b|\bdaily\b/i.test(value);
  const kind = !amounts.length ? "none" : hourly ? "hourly" : daily ? "daily" : "annual";
  return { range: kind === "annual" ? amounts.join("-") : "", kind, text: value };
}
