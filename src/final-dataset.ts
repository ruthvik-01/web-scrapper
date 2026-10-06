import type { OutputRow } from "./output.js";
import { canonicalUrl, cleanDescription, dateWindow, hasRoleContent, isUkCountry, normalizeJobs, parsePostedDate, type JobRow, type RawJob } from "./normalize.js";
import { outputRows, type OutputInput } from "./output.js";

export function deliveryQuality(rows: OutputRow[]) {
  const scripts = /<!\[CDATA\[|<\/?(?:script|form|input)\b|__VIEWSTATE|__EVENTVALIDATION\b|\b(?:document|window)\.|\bfunction\s*\(|\b(?:var|let|const)\s+\w+\s*=|Accept all cookies|Skip to main content/i;
  return {
    duplicateJobIds: rows.length - new Set(rows.map(row => row.jobId)).size,
    duplicateJobUrls: rows.length - new Set(rows.map(row => canonicalUrl(row.jobUrl))).size,
    missingJobIds: rows.filter(row => !row.jobId.trim()).length,
    nonUkJobs: rows.filter(row => !isUkCountry(row.country)).length,
    contaminatedDescriptions: rows.filter(row => scripts.test(row.description) || cleanDescription(row.description) !== row.description).length,
    titleOnlyDescriptions: rows.filter(row => !hasRoleContent(row.description, row.title)).length,
    salaryBenefits: rows.filter(row => /\b(?:gym|benefit|allowance|subsidy|voucher|bonus)\b/i.test(row.salaryRange)).length,
    nonAnnualSalary: rows.filter(row => row.salaryRange && (/\b(?:hour|day|hourly|daily)\b|\/\s*(?:h|hr|d)\b/i.test(row.salaryRange) || Number(row.salaryRange.match(/[\d,]+(?:\.\d+)?/)?.[0]?.replace(/,/g, "")) < 1000)).length,
    invalidUrls: rows.filter(row => !canonicalUrl(row.jobUrl)).length,
    invalidPostingDates: rows.filter(row => row.postedDate && parsePostedDate(row.postedDate) !== row.postedDate).length,
    locationFailures: rows.filter(row => !row.location || !isUkCountry(row.country)).length,
  };
}

export function finalizeScrapeResult<T extends { rows: JobRow[]; rawJobs: RawJob[]; report: OutputInput["report"] }>(
  result: T, company = "", now = new Date(),
) {
  const normalized = normalizeJobs(result.rawJobs, now);
  const report = {
    ...result.report,
    window: dateWindow(now),
    skipped: normalized.skipped,
    dateFallbacks: normalized.dateFallbacks,
    dataNotes: normalized.dataNotes,
  } as T["report"] & { window: { from: string; to: string }; skipped: OutputInput["report"]["skipped"]; dateFallbacks: unknown[]; dataNotes: unknown[] };
  const locationRows = outputRows({ rows: normalized.rows, report }, company);
  const merged = mergeJobLocations(locationRows);
  const quality = deliveryQuality(merged.rows);
  const qualityPassed = Object.values(quality).every(value => value === 0);
  const exportReady = qualityPassed && merged.rows.length > 0 && report.status !== "unsupported";
  const finalReport = {
    ...report,
    status: qualityPassed ? report.status : "partial",
    rows: merged.rows.length,
    sourceLocationRows: locationRows.length,
    deliveryLocationMerges: merged.merges,
    quality,
    qualityPassed,
    exportReady,
  } as T["report"] & { sourceLocationRows: number; deliveryLocationMerges: typeof merged.merges; quality: typeof quality; qualityPassed: boolean; exportReady: boolean };
  return {
    rows: merged.rows,
    quality,
    report: finalReport,
  };
}

export function mergeJobLocations(rows: OutputRow[]) {
  const groups = new Map<string, OutputRow[]>();
  for (const row of rows) {
    const key = [row.company, row.jobId, row.jobUrl].join("\0");
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const merged: OutputRow[] = [];
  const merges: { jobId: string; locations: string[] }[] = [];
  for (const group of groups.values()) {
    const first = { ...group[0]! };
    for (const row of group.slice(1)) {
      for (const field of Object.keys(first) as (keyof OutputRow)[]) {
        if (!["location", "city", "state"].includes(field) && row[field] !== first[field]) {
          throw new Error(`Conflicting ${first.jobId} ${field}; review source records before delivery.`);
        }
      }
    }
    if (group.length > 1) {
      for (const field of ["location", "city", "state"] as const) {
        first[field] = [...new Set(group.flatMap(row => row[field].split("; ")).filter(Boolean))].join("; ");
      }
      merges.push({ jobId: first.jobId, locations: [...new Set(group.map(row => row.location))] });
    }
    merged.push(first);
  }
  return { rows: merged, merges };
}
