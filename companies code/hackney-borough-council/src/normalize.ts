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
  /** Detected ATS / career platform label (e.g. "Zoho Recruit"); "" when generic. */
  ats?: string;
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

/**
 * Data contract: the exported title is ONLY the job title. Location, salary
 * and company tails that sites append to the heading are stripped.
 */
export function cleanTitle(value: string): string {
  let title = text(value).replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 3; pass++) {
    const before = title;
    title = title
      .replace(/^[^|–—]*[|–—]\s*/, "")
      .replace(/\s*[|–—][^|–—]*$/, (tail) =>
        /\b(jobs?|careers|vacanc|recruit|opportunit|apply)/i.test(tail) ? "" : tail)
      .replace(/\s+[-–—]\s+.*$/, (tail) =>
        /\b(ltd|limited|llc|inc|group|plc|company|solutions|services|consultancy|recruitment|london|manchester|birmingham|leeds|glasgow|uk|united kingdom|england|scotland|wales|remote|hybrid|full[- ]time|part[- ]time|permanent|contract|apprenticeship|\d)/i.test(tail) ? "" : tail)
      .replace(/\s+at\s+[^,|]+$/i, "")
      .replace(/\s*,\s*(london|manchester|birmingham|leeds|glasgow|bristol|sheffield|edinburgh|cardiff|belfast|nottingham|leicester|coventry|uk|united kingdom|england|scotland|wales|remote|hybrid)\s*$/i, "")
      .trim();
    if (title === before) break;
  }
  return title;
}

/**
 * Data contract: the description carries ONLY role content. Site chrome
 * ("Skip to content", "Save Job", "Apply now", breadcrumbs, cookie text)
 * is removed line by line.
 */
export function cleanDescription(value: string): string {
  const chrome = /^(?:skip to (?:main )?content(?: \|)?|save job|saved? jobs?|apply(?: now| today| online)?\.?|back to (?:search|results|jobs)|view (?:all )?jobs?|search jobs?|similar jobs?|other users (?:also )?applied|jobs you (?:may )?be interested in|report (?:this )?job|share(?: this job)?|sign in|log ?in|register|cookie|privacy|terms(?: and conditions)?|accessibility|©|copyright|all rights reserved|powered by|follow us|equal opportunities|twitter|facebook|linkedin|instagram)[\s\S]*$/i;
  const lines = text(value).split(/\n+/).map(line => line.trim());
  const out: string[] = [];
  for (const line of lines) {
    if (!line) { if (out.length) out.push(""); continue; }
    if (chrome.test(line)) { if (out.length && !out[out.length - 1]) continue; continue; }
    if (/^(?:home|vacanc|jobs?|search|keyword|location|enter (?:keywords|town)|use my location|returned?:)\b/i.test(line) && line.length < 120) continue;
    out.push(line);
  }
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract structured facts from labelled lines inside a cleaned description.
 * Many boards (Eploy detail summaries, agency adverts) put everything in the
 * body text: "Location: Bromley", "Salary: £42,000 - £45,000 per annum",
 * "Vacancy Type: Permanent". Code reads these labels exactly — no judgment
 * needed — and the values feed the same parseDate/parseSalary pipelines as
 * any structured field.
 */
export function labelledFacts(description: string): { location?: string; salary?: string; employmentType?: string } {
  const facts: { location?: string; salary?: string; employmentType?: string } = {};
  const lines = text(description).split(/\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 300) continue;
    let m = /^(?:job\s*)?location\s*[:\-–]\s*(.+)$/i.exec(line);
    if (m && !facts.location) {
      const place = m[1]!.replace(/\s*\|\s*$/, "").trim();
      if (place && place.length <= 120 &&
          !/^(?:not specified|n\/a|various|multiple|uk wide|nationwide|remote|home based|hybrid)$/i.test(place)) {
        facts.location = place;
      }
    }
    m = /^(?:salary|salary range|salary\/rate|pay|advertising salary)\s*[:\-–]?\s*(.+)$/i.exec(line);
    if (m && !facts.salary) {
      const pay = m[1]!.replace(/\s*\|\s*$/, "").trim();
      if (pay && /[£\d]/.test(pay) && pay.length <= 160) facts.salary = pay;
    }
    m = /^(?:vacancy type|job type|contract type|employment type|position type)\s*[:\-–]\s*(.+)$/i.exec(line);
    if (m && !facts.employmentType) {
      const type = m[1]!.replace(/\s*\|\s*$/, "").trim();
      if (type && type.length <= 60) facts.employmentType = type;
    }
  }
  return facts;
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
  // "Up to £65,000" / "to £42,500" style caps: the amount is the upper bound.
  const capped = /^(?:up\s+to|to|max(imum)?(?: of)?|salary cap of)\s*(?:£\s*|\bGBP\s*)/i.test(value.trim());
  const first = /(?:£\s*|\bGBP\s*)(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(numeric);
  if (first) {
    amounts.push(`£${first[2] ? Number(first[1]) * 1000 : first[1]}`);
    const rest = numeric.slice(first.index + first[0].length);
    const next = /^\s*(?:[-–—]|to\b)\s*(?:£\s*|\bGBP\s*)?(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(rest);
    if (next) amounts.push(`£${next[2] ? Number(next[1]) * 1000 : next[1]}`);
  }
  if (capped && amounts.length) {
    // A cap is a single figure, not the lower bound of a range.
    return { range: amounts[amounts.length - 1]!, kind: "annual", text: value };
  }
  const hourly = /per\s*hour|\/\s*(?:h(?:ou)?r|hour)\b|\bhourly\b|\d\s*p\.?\s*h\b/i.test(value);
  const daily = /per\s*day|\/\s*day\b|\bdaily\b/i.test(value);
  const kind = !amounts.length ? "none" : hourly ? "hourly" : daily ? "daily" : "annual";
  return { range: kind === "annual" ? amounts.join("-") : "", kind, text: value };
}
