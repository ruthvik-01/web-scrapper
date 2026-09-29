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
  let nextUrl = nextValue ? canonicalUrl(nextValue, endpoint) : "";
  // Some public feeds advertise a total but omit links.next. Advance only a
  // pagination parameter already present in the supplied endpoint.
  if (!nextUrl && records.length) {
    const pagination = object(root.pagination);
    const totalPages = Number(root.totalPages ?? pagination.totalPages ?? pagination.pageCount);
    const currentPage = Number(root.page ?? pagination.page ?? new URL(endpoint).searchParams.get("page"));
    if (Number.isSafeInteger(totalPages) && totalPages > 0 && Number.isSafeInteger(currentPage) &&
        currentPage >= 1 && currentPage < totalPages && new URL(endpoint).searchParams.has("page")) {
      const next = new URL(endpoint);
      next.searchParams.set("page", String(currentPage + 1));
      nextUrl = next.href;
    }
    const total = Number(root.totalCount ?? root.totalJobs ?? root.total ?? pagination.totalCount);
    const offset = Number(root.offset ?? pagination.offset ?? new URL(endpoint).searchParams.get("offset"));
    if (!nextUrl && Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(offset) && offset >= 0 &&
        offset + records.length < total && new URL(endpoint).searchParams.has("offset")) {
      const next = new URL(endpoint);
      next.searchParams.set("offset", String(offset + records.length));
      nextUrl = next.href;
    }
  }
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
