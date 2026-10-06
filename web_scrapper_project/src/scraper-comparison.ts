import { COLUMNS, canonicalUrl, type JobRow } from "./normalize.js";
export interface ComparisonPolicy { runDay?: string; sourceMissingPostedUrls?: string[]; sourceJobIds?: Record<string, string>; normalizeUkLabels?: boolean; normalizeDescriptionWhitespace?: boolean; normalizeAnnualGbp?: boolean }
export function compareScraperRows(oldRows: JobRow[], newRows: JobRow[], policy: ComparisonPolicy = {}) {
  // Pair by source URL/place, then report identifier changes as fields rather
  // than disguising a changed ID as a missing/unexpected vacancy.
  const key = (row: JobRow) => [row.company, canonicalUrl(row.jobUrl), row.city, row.state].join("\0");
  const index = (rows: JobRow[]) => {
    const result = new Map<string, JobRow>(); const duplicates: string[] = []; const collisions: JobRow[] = [];
    for (const row of rows) { const id = key(row); if (result.has(id)) { duplicates.push(id); collisions.push(row); } else result.set(id, row); }
    return { rows: result, duplicates, collisions };
  };
  const old = index(oldRows), current = index(newRows);
  const missing = [...old.rows.keys()].filter(id => !current.rows.has(id));
  const unexpected = [...current.rows.keys()].filter(id => !old.rows.has(id));
  const differences: { key: string; field: keyof JobRow; old: string; new: string; classification: "OLD BUG" | "EXPECTED" | "UNKNOWN"; reason: string }[] = [];
  for (const [id, before] of old.rows) {
    const after = current.rows.get(id); if (!after) continue;
    for (const field of COLUMNS) if (before[field] !== after[field]) {
      const oldFallback = field === "postedDate" && before[field] === policy.runDay && !after[field] && policy.sourceMissingPostedUrls?.includes(before.jobUrl);
      const sourceId = field === "jobId" && policy.sourceJobIds?.[before.jobUrl] === after[field] && before[field] === before.company;
      const ukLabel = field === "location" && policy.normalizeUkLabels && before[field].replace(/,\s*(GB|United Kingdom)$/i, ", UK") === after[field];
      const whitespace = field === "description" && policy.normalizeDescriptionWhitespace && before[field].replace(/\s+/g, " ").trim() === after[field].replace(/\s+/g, " ").trim();
      const annual = field === "salaryRange" && policy.normalizeAnnualGbp && /^GBP (\d+) - (\d+) YEAR$/.test(before[field]) && before[field].replace(/^GBP (\d+) - (\d+) YEAR$/, "£$1-£$2") === after[field];
      differences.push({ key: id, field, old: before[field], new: after[field], classification: oldFallback || sourceId ? "OLD BUG" : ukLabel || whitespace || annual ? "EXPECTED" : "UNKNOWN",
        reason: oldFallback ? "Legacy run-day fallback removed; the source has no posting date, per approved current contract."
          : sourceId ? "Old identifier.name used employer name; current identifier.value matches the recorded source vacancy ID."
          : ukLabel ? "UK country spelling standardized; source city/state and recruitment country are unchanged."
          : whitespace ? "Description whitespace cleaned; all textual content is equivalent."
          : annual ? "Explicit annual GBP bounds rendered in the approved salary format; currency and amounts preserved."
          : "Unexplained difference requires review." });
    }
  }
  return { oldCount: oldRows.length, newCount: newRows.length, missing, unexpected, oldDuplicates: old.duplicates, newDuplicates: current.duplicates,
    oldCollisionRecords: old.collisions, newCollisionRecords: current.collisions,
    differences, unexplained: missing.length + unexpected.length + old.duplicates.length + current.duplicates.length + differences.filter(item => item.classification === "UNKNOWN").length };
}
