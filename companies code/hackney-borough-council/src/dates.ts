/** Europe/London calendar-day handling and a rolling two-month window. */
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

export function monthsBackWindow(now: Date, months: number): { from: string; to: string } {
  const to = londonDay(now);
  return { from: subtractMonths(to, months), to };
}

function validDay(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : "";
}

/**
 * Parse a date string to YYYY-MM-DD. Returns "" when it cannot be established,
 * so the caller leaves the field empty rather than inventing a date.
 */
export function parseDate(value: unknown, now = new Date()): string {
  const input = String(typeof value === "string" || typeof value === "number" ? value : "")
    .replace(/^(?:date posted|posted on|posted|published on|published|closing date|closes?)\s*:?\s*/i, "").trim();
  if (!input) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/i.exec(input);
  if (iso) {
    const day = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!day) return "";
    if (!/T/i.test(input) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input)) return day;
    const stamp = new Date(input);
    return Number.isNaN(stamp.valueOf()) ? "" : londonDay(stamp);
  }
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (numeric) return validDay(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const written = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})$/i.exec(input) ??
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?(\d{4})$/i.exec(input);
  if (written) {
    const dayFirst = /^\d/.test(written[1]!);
    const month = months.indexOf(written[dayFirst ? 2 : 1]!.slice(0, 3).toLowerCase());
    return month < 0 ? "" : validDay(Number(written[3]), month + 1, Number(written[dayFirst ? 1 : 2]));
  }
  const today = londonDay(now);
  if (/^(today|just now)$/i.test(input)) return today;
  const rel = /^(\d+)\s+(hour|day|week|month)s?\s+ago$/i.exec(input);
  if (/^yesterday$/i.test(input) || rel) {
    const count = rel ? Number(rel[1]) : 1;
    const unit = rel?.[2]?.toLowerCase() ?? "day";
    if (!Number.isSafeInteger(count) || count > 1200) return "";
    if (unit === "month") return subtractMonths(today, count);
    if (unit === "hour") return londonDay(new Date(now.valueOf() - count * 3_600_000));
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - count * (unit === "week" ? 7 : 1));
    return date.toISOString().slice(0, 10);
  }
  return "";
}
