import { jobsFromJson, schemaJob } from "./extract.js";
import { array, canonicalUrl, object, text, type RawJob } from "./normalize.js";

/** Extend this decoder for additional public REST schemas; never guess private endpoints. */
export function decodeJobApi(payload: unknown, endpoint: string, company = "") {
  const root = object(payload);
  const data = root.jobs ?? root.results ?? root.data ?? payload;
  const records = Array.isArray(data) ? data : array(object(data).jobs);
  const jobs: RawJob[] = jobsFromJson(payload, endpoint, company, true);
  if (!jobs.length) {
    for (const value of records) {
      const record = object(value);
      const title = text(record.title);
      const description = text(record.description);
      const url = canonicalUrl(text(record.url) || text(record.jobUrl) || text(record.absolute_url), endpoint);
      // Reject list-only cards and unknown records instead of fabricating details.
      if (!title || !description || !url) continue;
      const job = schemaJob({
        ...record, title, description, url,
        identifier: record.identifier ?? record.id,
        datePosted: record.datePosted ?? record.postedDate,
        validThrough: record.validThrough ?? record.deadline,
        hiringOrganization: record.hiringOrganization ?? { name: text(record.company) || company },
        jobLocation: record.jobLocation ?? recordsLocation(record.locations ?? record.location),
      }, endpoint, company);
      job.salaryRange ||= text(record.salaryRange);
      job.worktype ||= text(record.worktype);
      jobs.push(job);
    }
  }
  const rawNext = root.next ?? object(root.links).next ?? object(root.pagination).next;
  const nextValue = typeof rawNext === "string" ? rawNext : text(object(rawNext).href);
  const nextUrl = nextValue ? canonicalUrl(nextValue, endpoint) : "";
  return {
    jobs,
    nextUrl,
    empty: (Array.isArray(data) || Array.isArray(object(data).jobs)) && records.length === 0,
    unsupportedPagination: rawNext != null && rawNext !== "" && !nextUrl,
  };
}

function recordsLocation(value: unknown): unknown[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(location => {
    const entry = object(location);
    if (entry.address) return entry;
    return { name: text(entry.name), address: {
      addressLocality: text(entry.city), addressRegion: text(entry.state),
      addressCountry: text(entry.country), postalCode: text(entry.postcode),
    } };
  });
}
