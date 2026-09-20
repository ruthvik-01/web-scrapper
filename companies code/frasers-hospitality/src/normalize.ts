import { createHash } from "node:crypto";
import { load } from "cheerio";

export const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype",
  "location", "city", "state", "country", "ats",
] as const;

export type JobRow = Record<(typeof COLUMNS)[number], string>;
export interface JobLocation {
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  street?: string;
  resolved?: boolean;
}
export interface RawJob {
  jobId?: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate?: string;
  jdDeadline?: string;
  company?: string;
  salaryRange?: string;
  employmentType?: string;
  worktype?: string;
  locations: JobLocation[];
  ats?: string;
  visibleLocation?: string;
  roleDescription?: string;
  notes?: string[];
}
export interface SkippedJob {
  jobUrl: string;
  title: string;
  reason: "missing_details" | "unknown_date" | "outside_date_window" | "no_confirmed_uk_location";
}
export interface DateFallback {
  jobId: string;
  jobUrl: string;
  assignedDate: string;
}
export interface DataNote { jobId: string; jobUrl: string; reason: string }

export const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
export const array = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export function plainText(value: unknown): string {
  let html = text(value);
  // Greenhouse can return entity-encoded HTML.
  for (let pass = 0; pass < 2 && /&(?:amp;)?lt;/i.test(html); pass++) {
    html = load(html).text();
  }
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
      if (/^(utm_.+|fbclid|gclid|gh_src|lever-source|lever-origin)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return "";
  }
}

function validDay(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? date.toISOString().slice(0, 10) : "";
}

export function londonDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function subtractMonths(day: string, months: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export function dateWindow(now = new Date()): { from: string; to: string } {
  const to = londonDay(now);
  return { from: subtractMonths(to, 2), to };
}

export function parsePostedDate(value: unknown, now = new Date()): string {
  const input = text(value).replace(/^(?:date posted|posted on|posted|published on|published)\s*:?\s*/i, "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/i.exec(input);
  if (iso) {
    const day = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!day) return "";
    if (!/T/i.test(input) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input)) return day;
    const timestamp = new Date(input);
    return Number.isNaN(timestamp.valueOf()) ? "" : londonDay(timestamp);
  }
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (numeric) return validDay(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const written = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})$/i.exec(input) ??
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(input);
  if (written) {
    const dayFirst = /^\d/.test(written[1]!);
    const month = months.indexOf(written[dayFirst ? 2 : 1]!.slice(0, 3).toLowerCase());
    return month < 0 ? "" : validDay(Number(written[3]), month + 1, Number(written[dayFirst ? 1 : 2]));
  }
  const today = londonDay(now);
  if (/^(today|just now)$/i.test(input)) return today;
  const relative = /^(\d+)\s+(hour|day|week|month)s?\s+ago$/i.exec(input);
  if (/^yesterday$/i.test(input) || relative) {
    const count = relative ? Number(relative[1]) : 1;
    const unit = relative?.[2]?.toLowerCase() ?? "day";
    if (!Number.isSafeInteger(count) || count > 1200) return "";
    if (unit === "month") return subtractMonths(today, count);
    if (unit === "hour") return londonDay(new Date(now.valueOf() - count * 3_600_000));
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - count * (unit === "week" ? 7 : 1));
    return date.toISOString().slice(0, 10);
  }
  // "30+ days", missing dates, updated_at, and guessed dates cannot prove recency.
  return "";
}

const ukCountries = new Set([
  "uk", "gb", "gbr", "united kingdom", "great britain", "britain",
  "united kingdom of great britain and northern ireland",
]);
const ukNations = new Set(["england", "scotland", "wales", "northern ireland"]);
const key = (value: string): string => value.toLowerCase().replace(/\./g, "").trim();
export const isUkCountry = (value: string): boolean => ukCountries.has(key(value)) || ukNations.has(key(value));

export function ukLocation(input: JobLocation): { location: string; city: string; state: string; country: string } | undefined {
  const label = text(input.location);
  const explicitCountry = text(input.country);
  // Explicit foreign country always wins, even for cities also found in the UK.
  if (explicitCountry && !isUkCountry(explicitCountry)) return;
  const parts = label.split(/\s*,\s*|\s+[–—]\s+/).filter(Boolean);
  const countryPart = parts.find(isUkCountry);
  const state = text(input.state);
  if (!explicitCountry && !countryPart && !ukNations.has(key(state))) return;
  const places = parts.filter(part => !isUkCountry(part) && !/^(remote|hybrid|on-?site)$/i.test(part));
  const city = text(input.city) || (input.resolved ? "" : places[0]) || "";
  const nation = parts.find(part => ukNations.has(key(part)));
  return {
    location: label || [city, state, "United Kingdom"].filter(Boolean).join(", "),
    city,
    state: state || (input.resolved ? "" : nation || places[1]) || "",
    country: "UK",
  };
}

export function normalizeJobs(jobs: RawJob[], now = new Date()): { rows: JobRow[]; skipped: SkippedJob[]; dateFallbacks: DateFallback[]; dataNotes: DataNote[] } {
  const window = dateWindow(now);
  const rows: JobRow[] = [];
  const skipped: SkippedJob[] = [];
  const seen = new Set<string>();
  const seenSkipped = new Set<string>();
  const fallbacks = new Map<string, DateFallback>();
  const dataNotes = new Map<string, DataNote>();
  for (const job of jobs) {
    const missingDate = !text(job.postedDate) || /^(null|n\/?a|not specified)$/i.test(text(job.postedDate));
    const hasDeadline = Boolean(text(job.jdDeadline)) && !/^(null|n\/?a|not specified)$/i.test(text(job.jdDeadline));
    const postedDate = missingDate ? (hasDeadline ? "" : window.to) : parsePostedDate(job.postedDate, now);
    const locations = job.locations.map(ukLocation).filter(location => location !== undefined);
    const jobUrl = canonicalUrl(job.jobUrl);
    const reason: SkippedJob["reason"] | undefined =
      !text(job.title) || !plainText(job.description) || !jobUrl ? "missing_details" :
      !missingDate && !postedDate ? "unknown_date" :
      postedDate && (postedDate < window.from || postedDate > window.to) ? "outside_date_window" :
      !locations.length ? "no_confirmed_uk_location" : undefined;
    if (reason) {
      const item = { jobUrl: job.jobUrl, title: job.title, reason };
      const fingerprint = JSON.stringify(item);
      if (!seenSkipped.has(fingerprint)) skipped.push(item);
      seenSkipped.add(fingerprint);
      continue;
    }
    const rolePay = /^\s*Salary\s*:\s*([^\n]+)/im.exec(job.roleDescription || "")?.[1] || "";
    const pay = plainText(job.salaryRange || rolePay);
    const payQualifier = /\bd\s*\.?\s*o\s*\.?\s*e\b|depending on experience|per\s*hour|\/\s*(?:h(?:ou)?r|hour)\b|\bhourly\b|\d\s*p\.?\s*h\b/i;
    const movePay = payQualifier.test(pay) || payQualifier.test(rolePay);
    const numericPay = pay.replace(/,/g, "");
    const first = /£|\bGBP\b/i.test(pay)
      ? /(?:£\s*|\bGBP\s*)(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(numericPay)
      : /^\s*(\d+(?:\.\d+)?)\s*(k\b)?/i.exec(numericPay);
    // Hours and separate bonuses are not the second bound of a salary range.
    const next = first && /^\s*(?:[-–—]|to\b)\s*(?:£\s*|GBP\s*)?(\d+(?:\.\d+)?)\s*(k\b)?/i
      .exec(numericPay.slice(first.index + first[0].length));
    const amounts = [first, next].filter((match): match is RegExpExecArray => Boolean(match));
    const salaryRange = movePay ? "" : amounts
      .map(match => `£${match[2] ? Number(match[1]) * 1000 : match[1]}`).join("-");
    const description = plainText(job.description);
    const shared = {
      jobId: text(job.jobId) || `generated-${createHash("sha256").update(jobUrl).digest("hex").slice(0, 16)}`,
      title: text(job.title),
      description: movePay && !description.includes(pay) ? `${description}\n\nSalary: ${pay}` : description,
      jobUrl,
      postedDate,
      jdDeadline: parsePostedDate(job.jdDeadline, now),
      company: text(job.company),
      salaryRange,
      employmentType: text(job.employmentType),
      worktype: text(job.worktype),
      // Spreadsheet contract: the exported ATS value is Custom for every company.
      // Detected platforms remain available on the raw record for reports.
      ats: "Custom",
    };
    if (missingDate && !hasDeadline) {
      fallbacks.set(`${shared.jobId}|${jobUrl}`, { jobId: shared.jobId, jobUrl, assignedDate: postedDate });
    }
    if (job.notes?.length) {
      dataNotes.set(`${shared.jobId}|${jobUrl}`, { jobId: shared.jobId, jobUrl, reason: [...new Set(job.notes)].join(" ") });
    }
    for (const location of locations) {
      const sourceLabel = text(location.location);
      const composed = [location.city, location.state, location.country].filter(Boolean).join(", ");
      const preserveLabel = sourceLabel && sourceLabel !== composed &&
        (!location.city || /\btravel\b/i.test(sourceLabel));
      const values = { ...shared, ...location, location: composed,
        description: preserveLabel && !shared.description.includes(sourceLabel)
          ? `${shared.description}\n\nSource location: ${sourceLabel}` : shared.description };
      const row = Object.fromEntries(COLUMNS.map(column => [column, values[column]])) as JobRow;
      // Never collapse different IDs or jobs with different non-location details.
      const fingerprint = JSON.stringify(row);
      if (!seen.has(fingerprint)) rows.push(row);
      seen.add(fingerprint);
    }
  }
  return { rows, skipped, dateFallbacks: [...fallbacks.values()], dataNotes: [...dataNotes.values()] };
}

export function toCsv(rows: JobRow[]): string {
  const escape = (value: string): string => {
    // Prevent spreadsheet formula execution; JSON retains the original value.
    const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [COLUMNS.join(","), ...rows.map(row => COLUMNS.map(column => escape(row[column])).join(","))].join("\r\n") + "\r\n";
}
