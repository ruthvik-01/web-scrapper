import { load } from "cheerio";
import { AccessPolicy, type ScrapeOptions } from "./crawl.js";
import { Geography } from "./geography.js";
import { dateWindow, normalizeJobs, object, plainText, text, type RawJob } from "./normalize.js";

/** Decode a JS string literal as data; never evaluate website JavaScript. */
export function decodeZohoJobs(html: string): Record<string, unknown>[] {
  const hidden = load(html)("#jobs").attr("value");
  const literal = /\bvar\s+jobs\s*=\s*JSON\.parse\('((?:\\[\s\S]|[^'\\])*)'\)/.exec(html)?.[1];
  if (hidden === undefined && literal === undefined) throw new Error("No supported Zoho public job payload.");
  const decoded = hidden ?? literal!.replace(/\\(x[\da-f]{2}|u[\da-f]{4}|[\s\S])/gi, (_, code: string) => {
    if (/^[xu]/i.test(code) && code.length > 1) return String.fromCharCode(parseInt(code.slice(1), 16));
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "" };
    return escapes[code] ?? code;
  });
  const jobs: unknown = JSON.parse(decoded);
  if (!Array.isArray(jobs)) throw new Error("Zoho jobs payload is not an array.");
  return jobs.map(object);
}

export function zohoJob(record: Record<string, unknown>, jobUrl: string, company: string): RawJob {
  const description = [
    plainText(record.Job_Description),
    record.Requirements ? `Requirements\n${plainText(record.Requirements)}` : "",
    record.Benefits ? `Benefits\n${plainText(record.Benefits)}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    jobId: text(record.id), title: text(record.Posting_Title),
    description, roleDescription: description, jobUrl, company,
    postedDate: text(record.Date_Opened), jdDeadline: "",
    salaryRange: text(record.Salary), employmentType: text(record.Job_Type),
    // A false remote flag does not distinguish Hybrid from On-site.
    worktype: record.Remote_Job === true ? "Remote" : "",
    locations: [{
      city: text(record.City), state: text(record.State), country: text(record.Country),
      postcode: text(record.Zip_Code),
    }],
  };
}

/** LAAT's official board exposes all eight listing records in its HTML.
 * Deliberately not enabled for arbitrary Zoho boards with unverified pagination.
 */
export async function scrapeLaatZoho(url: string, options: ScrapeOptions = {}) {
  const now = options.now || new Date();
  const policy = new AccessPolicy(options.delayMs ?? 1000, options.timeoutMs ?? 30000);
  const board = await policy.html(url);
  const listed = decodeZohoJobs(board.body);
  const $ = load(board.body);
  const meta = JSON.parse($("#meta").attr("value") || "{}");
  const company = text(object(meta.org_info).company_name);
  if (text(object(meta.org_info).website) !== "laat.ac.uk" || !company) {
    throw new Error("Zoho board employer does not match the verified LAAT source.");
  }
  const rawJobs: RawJob[] = [];
  const issues: { url: string; message: string }[] = [];
  const excluded: { jobId: string; reason: string }[] = [];
  const sourceRecords: Record<string, unknown>[] = [];
  const geo = new Geography();
  let pagesVisited = 1;
  const window = dateWindow(now);
  for (const seed of listed) {
    if (seed.Publish !== true || seed.Is_Locked === true) {
      excluded.push({ jobId: text(seed.id), reason: "Not published or explicitly filled/locked" });
      continue;
    }
    const jobUrl = `${board.url.replace(/\/$/, "")}/${encodeURIComponent(text(seed.id))}/${encodeURIComponent(text(seed.Posting_Title).replace(/\s/g, "-"))}?source=CareerSite`;
    const date = text(seed.Date_Opened);
    // Keep old published records for explicit date-exclusion accounting.
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && (date < window.from || date > window.to)) {
      rawJobs.push(zohoJob(seed, jobUrl, company));
      continue;
    }
    try {
      const detail = await policy.html(jobUrl);
      pagesVisited++;
      const record = decodeZohoJobs(detail.body).find(item => item.id === seed.id);
      if (!record) throw new Error("Detail payload did not contain the advertised job ID.");
      if (record.Publish === false || record.Is_Locked === true) {
        excluded.push({ jobId: text(seed.id), reason: "Detail became unpublished/filled" });
        continue;
      }
      sourceRecords.push(record);
      rawJobs.push(await geo.resolve(zohoJob(record, detail.url, company)));
    } catch (error) {
      issues.push({ url: jobUrl, message: String(error) });
    }
  }
  const normalized = normalizeJobs(rawJobs, now);
  return {
    rows: normalized.rows, rawJobs, sourceRecords, report: {
      sourceUrl: url, process: "STATIC LAAT Zoho", scrapedAt: now.toISOString(), window,
      status: issues.length ? "partial" : normalized.rows.length ? "ok" : "no_matches",
      pagesVisited, requests: pagesVisited, candidates: rawJobs.length,
      advertisedPositions: listed.length, rows: normalized.rows.length,
      limited: false, pendingUrls: issues.map(issue => issue.url), issues,
      skipped: normalized.skipped, dateFallbacks: normalized.dateFallbacks,
      dataNotes: normalized.dataNotes, locationEvidence: geo.evidence,
      nonVacancyExcluded: excluded,
      boardVerification: "Uses the embedded public listing, excludes unpublished/filled positions and reads full in-window detail payloads. Date_Opened is the visible Posted on date. Recheck the rendered listing count on future runs if Zoho changes its pagination.",
    },
  };
}
