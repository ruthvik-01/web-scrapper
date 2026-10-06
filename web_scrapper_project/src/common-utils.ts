import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COLUMNS, type JobRow } from "./normalize.js";

/**
 * Normalizes generic text by stripping HTML tags and collapsing whitespace.
 */
export function normalizeText(value: unknown): string {
  if (value == null) return "";
  let str = String(value);
  str = str.replace(/<[^>]*>/g, " ");
  str = str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Ensures a valid canonical URL string.
 */
export function canonicalizeUrl(url: string, baseUrl?: string): string {
  try {
    const parsed = baseUrl ? new URL(url, baseUrl) : new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

/**
 * Formats a Date object as YYYY-MM-DD in UTC / London calendar date.
 */
export function formatLondonDate(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Escapes a field value for CSV format according to RFC 4180 and protects against formula injection.
 */
export function escapeCsvField(value: unknown): string {
  if (value == null) return "";
  let str = String(value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes standard 15-column rows to CSV string with UTF-8 BOM.
 */
export function serialize15ColumnCsv(rows: JobRow[]): string {
  const BOM = "\uFEFF";
  const header = COLUMNS.join(",");
  const lines = rows.map(row => COLUMNS.map(col => escapeCsvField(row[col] || "")).join(","));
  return BOM + [header, ...lines].join("\n") + "\n";
}

/**
 * Creates a unique deterministic or timestamped output run directory under the dedicated output path.
 */
export async function createDedicatedRunDir(
  baseOutputDir = "output/universal-runs",
  runId?: string
): Promise<{ runDir: string; runId: string; timestamp: string }> {
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, "-");
  const id = runId || Math.random().toString(36).substring(2, 10);
  const runDirName = `run-${iso}-${id}`;
  const runDir = join(baseOutputDir, runDirName);

  await mkdir(runDir, { recursive: true });
  await mkdir(join(runDir, "reports"), { recursive: true });

  return { runDir, runId: id, timestamp: iso };
}

/**
 * Sleep helper with AbortSignal support.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Operation aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Operation aborted"));
    }, { once: true });
  });
}

/**
 * Exponential backoff with jitter calculation.
 */
export function calculateBackoff(attempt: number, baseMs = 500, maxMs = 10000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.random() * 0.3 * exp;
  return Math.min(maxMs, Math.floor(exp + jitter));
}
