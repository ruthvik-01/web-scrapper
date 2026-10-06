import { text, plainText, type RawJob, type JobRow, type JobLocation } from "./normalize.js";
import { isNhsJobsUrl, assertAllowedJobSource } from "./uk-scope.js";
import type { UniversalCompany } from "./companies.js";

export { isNhsJobsUrl, assertAllowedJobSource };

/**
 * Recognized UK nations, regions, and dependencies.
 */
export const UK_COUNTRY_NAMES = new Set([
  "united kingdom",
  "uk",
  "great britain",
  "gb",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "channel islands",
  "isle of man",
  "jersey",
  "guernsey",
]);

/**
 * Explicit non-UK countries and foreign indicators.
 */
export const FOREIGN_INDICATORS = [
  "united states", "usa", "us", "germany", "deutschland", "france", "spain", "italy",
  "netherlands", "israel", "india", "canada", "australia", "ireland", "poland",
  "singapore", "japan", "brazil", "china", "switzerland", "sweden", "norway",
  "austria", "belgium", "portugal", "denmark", "finland", "new zealand", "mexico",
  "south africa", "argentina", "chile", "colombia", "czech republic", "romania",
  "hungary", "greece", "turkey", "cyprus", "malta", "estonia", "latvia", "lithuania",
  "ukraine", "russia", "belarus", "georgia", "armenia", "azerbaijan", "kazakhstan",
  "united arab emirates", "uae", "dubai", "saudi arabia", "qatar", "egypt", "nigeria",
  "kenya", "ghana", "pakistan", "bangladesh", "sri lanka", "indonesia", "malaysia",
  "thailand", "vietnam", "philippines", "korea", "taiwan", "hong kong",
];

/**
 * Validates whether a country name explicitly matches the UK.
 */
export function isUkCountry(countryName: string): boolean {
  if (!countryName) return false;
  const clean = countryName.trim().toLowerCase();
  return UK_COUNTRY_NAMES.has(clean);
}

/**
 * Checks whether a location text contains explicit non-UK signals without UK context.
 */
export function isExplicitlyForeign(locationText: string): boolean {
  if (!locationText) return false;
  const lower = locationText.toLowerCase();
  for (const indicator of FOREIGN_INDICATORS) {
    const regex = new RegExp(`\\b${indicator.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(lower)) {
      const hasUk = Array.from(UK_COUNTRY_NAMES).some(uk => new RegExp(`\\b${uk}\\b`, "i").test(lower));
      if (!hasUk) return true;
    }
  }
  return false;
}

/**
 * Validates whether a given JobLocation or text is within UK scope.
 */
export function isUkLocation(location: JobLocation | string): boolean {
  if (typeof location === "string") {
    if (!location.trim()) return false;
    if (isExplicitlyForeign(location)) return false;
    const lower = location.toLowerCase();
    for (const uk of UK_COUNTRY_NAMES) {
      if (new RegExp(`\\b${uk}\\b`, "i").test(lower)) return true;
    }
    if (/\b[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}\b/i.test(location)) return true;
    return false;
  }

  if (location.country && isUkCountry(location.country)) return true;
  if (location.postcode && /\b[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}\b/i.test(location.postcode)) return true;
  if (location.location && isUkLocation(location.location)) return true;
  return false;
}

/**
 * Clamps date to Europe/London calendar month window.
 */
export function isWithinDateWindow(
  dateStr: string | undefined,
  currentDate = new Date(),
  monthsWindow = 2
): boolean {
  if (!dateStr) return false;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return false;

  const londonYear = currentDate.getUTCFullYear();
  const londonMonth = currentDate.getUTCMonth();

  const earliest = new Date(Date.UTC(londonYear, londonMonth - monthsWindow + 1, 1));
  const latest = new Date(Date.UTC(londonYear, londonMonth + 1, 1, 23, 59, 59));

  return parsed >= earliest && parsed <= latest;
}

/**
 * Validates role description content quality.
 */
export function isValidRoleDescription(description: string, title?: string): boolean {
  if (!description || typeof description !== "string") return false;
  const clean = plainText(description);
  if (clean.length < 30) return false;
  if (title && clean.trim().toLowerCase() === title.trim().toLowerCase()) return false;
  return true;
}

/**
 * Checks whether salary text represents annual GBP compensation.
 */
export function isAnnualGbpSalary(salaryText: string): boolean {
  if (!salaryText) return false;
  const lower = salaryText.toLowerCase();
  const hasCurrency = lower.includes("£") || lower.includes("gbp");
  const isAnnual = lower.includes("annum") || lower.includes("year") || lower.includes("p.a") || lower.includes("pa") || lower.includes("annual");
  const isHourlyDaily = lower.includes("hour") || lower.includes("hr") || lower.includes("p/h") || lower.includes("ph") ||
                        lower.includes("day") || lower.includes("p/d") || lower.includes("pd") || lower.includes("week") || lower.includes("month");

  if (isHourlyDaily && !isAnnual) return false;
  return hasCurrency;
}

/**
 * Filters and scopes raw jobs according to company configuration rules.
 */
export function applyCompanyFilters(jobs: RawJob[], company: UniversalCompany): RawJob[] {
  return jobs.filter(job => {
    if (company.employerNames?.length) {
      const compName = (job.company || "").trim().toLowerCase();
      const title = (job.title || "").trim().toLowerCase();
      const matches = company.employerNames.some(name => {
        const lower = name.trim().toLowerCase();
        return compName.includes(lower) || title.includes(lower);
      });
      if (!matches) return false;
    }

    if (company.titlePrefixes?.length) {
      const title = (job.title || "").trim().toLowerCase();
      const matches = company.titlePrefixes.some(prefix => title.startsWith(prefix.trim().toLowerCase()));
      if (!matches) return false;
    }

    if (job.jobUrl && isNhsJobsUrl(job.jobUrl)) return false;

    return true;
  });
}
