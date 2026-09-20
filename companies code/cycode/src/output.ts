import { COLUMNS, type JobRow, type SkippedJob } from "./normalize.js";

export const OUTPUT_COLUMNS = [...COLUMNS] as const;
export type OutputRow = Record<(typeof OUTPUT_COLUMNS)[number], string>;

interface OutputInput {
  rows: JobRow[];
  report: {
    process: string;
    status: string;
    candidates: number;
    window: { from: string; to: string };
    skipped: SkippedJob[];
    issues: { url: string; message: string }[];
    limited: boolean;
  };
}

function emptyIfMissing(value: string): string {
  return !value.trim() || /^(?:null|unknown|not specified|not disclosed|n\/?a|not available)$/i.test(value.trim())
    ? "" : value;
}

export function outputRows(result: OutputInput, company = ""): OutputRow[] {
  if (result.rows.length) {
    return result.rows.map(row =>
      Object.fromEntries(COLUMNS.map(column => [column, column === "ats" ? "Custom" : emptyIfMissing(row[column])])) as OutputRow);
  }
  // No qualifying jobs: keep exports empty. Company outcomes belong in reports.
  return [];
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
