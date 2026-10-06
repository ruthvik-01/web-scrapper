import { COLUMNS, canonicalUrl, cleanDescription, hasRoleContent, isUkCountry, parsePostedDate,
  type DataNote, type JobRow, type SkippedJob } from "./normalize.js";

export const OUTPUT_COLUMNS = [...COLUMNS] as const;
export type OutputRow = Record<(typeof OUTPUT_COLUMNS)[number], string>;

export interface OutputInput {
  rows: JobRow[];
  report: {
    process: string;
    status: string;
    candidates: number;
    window: { from: string; to: string };
    skipped: SkippedJob[];
    issues: { url: string; message: string }[];
    limited: boolean;
    rows?: number;
    dataNotes?: DataNote[];
  };
}

function emptyIfMissing(value: string): string {
  return !value.trim() || /^(?:null|unknown|not specified|not disclosed|n\/?a|not available)$/i.test(value.trim())
    ? "" : value;
}

export function outputRows(result: OutputInput, company = ""): OutputRow[] {
  const accepted = new Map<string, JobRow>();
  const skipped: SkippedJob[] = [];
  const notes: DataNote[] = [];
  for (const source of result.rows) {
    const row = { ...source };
    const url = canonicalUrl(row.jobUrl);
    const description = cleanDescription(row.description);
    const validDate = !row.postedDate || (parsePostedDate(row.postedDate) === row.postedDate &&
      row.postedDate >= result.report.window.from && row.postedDate <= result.report.window.to);
    const reason: SkippedJob["reason"] | undefined =
      !row.jobId.trim() ? "missing_job_id" :
      !url ? "invalid_job_url" :
      !isUkCountry(row.country) ? "non_uk_location" :
      !hasRoleContent(description, row.title) ? "invalid_description" :
      !validDate ? "invalid_posting_date" : undefined;
    if (reason) {
      skipped.push({ jobUrl: row.jobUrl, title: row.title, reason });
      continue;
    }
    row.jobUrl = url;
    row.description = description;
    const pay = row.salaryRange;
    const amount = /(?:£|GBP\s*)([\d,]+(?:\.\d+)?)/i.exec(pay);
    const firstAmount = amount ? Number(amount[1]!.replace(/,/g, "")) : NaN;
    const rate = /\b(?:per\s+(?:hour|day)|hourly|daily)\b|\/\s*(?:hr?|hour|day|d)\b/i.test(pay);
    const benefit = /\b(?:benefit|allowance|subsidy|voucher|gym|bonus)\b/i.test(pay);
    if (pay && (rate || benefit || !Number.isFinite(firstAmount) || firstAmount < 1000)) {
      row.salaryRange = "";
      if (rate && !row.description.includes(pay)) row.description += `\n\nSalary: ${pay}`;
      notes.push({ jobId: row.jobId, jobUrl: url,
        reason: rate ? "Hourly or daily salary moved to description." : "Unverified salary or benefit removed from annual salary field." });
    }
    const key = [row.company || company, row.jobId, row.jobUrl, row.location].join("|").toLowerCase();
    const existing = accepted.get(key);
    if (existing) {
      skipped.push({ jobUrl: row.jobUrl, title: row.title, reason: "duplicate_job" });
      const roleLength = (value: string) => value.replace(/^Salary:.*$/gim, "").trim().length;
      if (roleLength(row.description) > roleLength(existing.description)) accepted.set(key, row);
    } else accepted.set(key, row);
  }
  result.rows = [...accepted.values()];
  result.report.rows = result.rows.length;
  if (skipped.length) {
    result.report.skipped.push(...skipped);
    result.report.status = "partial";
  }
  if (notes.length) result.report.dataNotes = [...(result.report.dataNotes || []), ...notes];
  return result.rows.map(row =>
    Object.fromEntries(COLUMNS.map(column => [column, emptyIfMissing(row[column])])) as OutputRow);
}

export function outputCsv(rows: OutputRow[]): string {
  const encode = (value: string): string => {
    if (!value) return "";
    const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [
    OUTPUT_COLUMNS.join(","),
    ...rows.map(row => OUTPUT_COLUMNS.map(column => encode(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
}
