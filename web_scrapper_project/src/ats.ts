import { array, canonicalUrl, object, plainText, text, ukLocation, type RawJob } from "./normalize.js";
import { schemaLocations } from "./extract.js";

export interface AtsBoard {
  kind: "Ashby" | "Greenhouse" | "Lever" | "Workable";
  token: string;
  endpoint: string;
}

export function atsBoard(url: string): AtsBoard | undefined {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const token = parts[0];
  if (!token) return;
  if (parsed.hostname === "apply.workable.com" && token !== "j" && parts.length === 1) {
    return { kind: "Workable", token, endpoint: `https://www.workable.com/api/accounts/${encodeURIComponent(token)}?details=true` };
  }
  if (parsed.hostname === "jobs.ashbyhq.com") {
    return { kind: "Ashby", token, endpoint: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true` };
  }
  if (["boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io", "job-boards.eu.greenhouse.io"].includes(parsed.hostname)) {
    const board = token === "embed" ? parsed.searchParams.get("for") : token;
    if (!board) return;
    const host = parsed.hostname.includes(".eu.") ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
    return { kind: "Greenhouse", token: board, endpoint: `https://${host}/v1/boards/${encodeURIComponent(board)}/jobs?content=true` };
  }
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(parsed.hostname)) {
    const host = parsed.hostname.includes(".eu.") ? "api.eu.lever.co" : "api.lever.co";
    return { kind: "Lever", token, endpoint: `https://${host}/v0/postings/${encodeURIComponent(token)}?mode=json` };
  }
}

export function mapAtsJobs(board: AtsBoard, payload: unknown, company = ""): RawJob[] {
  const data = object(payload);
  const items = board.kind === "Lever" ? array(payload) : array(data.jobs);
  return items.map(object).filter(job => job.isListed !== false).map(job => {
    if (board.kind === "Workable") {
      const locations = array(job.locations).map(object).filter(location => location.hidden !== true);
      return {
        jobId: text(job.shortcode), title: text(job.title), description: plainText(job.description),
        roleDescription: plainText(job.description),
        jobUrl: canonicalUrl(text(job.url)), company: text(data.name) || company,
        postedDate: text(job.published_on), employmentType: text(job.employment_type),
        worktype: text(job.workplace_type) || (job.telecommuting === true ? "Remote" : ""),
        locations: locations.length ? locations.map(location => ({
          city: text(location.city), state: text(location.region),
          country: text(location.countryCode) || text(location.country),
        })) : [{ city: text(job.city), state: text(job.state), country: text(job.country) }],
        ats: board.kind,
      };
    }
    if (board.kind === "Ashby") {
      const jobUrl = canonicalUrl(text(job.jobUrl));
      const compensation = object(job.compensation);
      return {
        jobId: text(job.id) || new URL(jobUrl || board.endpoint).pathname.split("/").filter(Boolean).at(-1),
        title: text(job.title),
        description: plainText(job.descriptionHtml || job.descriptionPlain),
        jobUrl,
        postedDate: text(job.publishedAt),
        company,
        salaryRange: text(compensation.scrapeableCompensationSalarySummary),
        employmentType: text(job.employmentType),
        worktype: text(job.workplaceType) || (job.isRemote === true ? "Remote" : ""),
        locations: [
          ...schemaLocations({ location: job.location, address: job.address }),
          ...array(job.secondaryLocations).flatMap(schemaLocations),
        ],
        ats: board.kind,
      };
    }
    if (board.kind === "Greenhouse") {
      return {
        jobId: text(job.id), title: text(job.title), description: plainText(job.content),
        jobUrl: canonicalUrl(text(job.absolute_url)), company,
        // updated_at is an edit timestamp, NOT a posting date. Read the detail page.
        postedDate: "",
        locations: schemaLocations(text(object(job.location).name)), ats: board.kind,
      };
    }
    const categories = object(job.categories);
    const salary = object(job.salaryRange);
    return {
      jobId: text(job.id), title: text(job.text),
      description: [
        plainText(job.descriptionPlain || job.description),
        ...array(job.lists).map(item => {
          const section = object(item);
          return [text(section.text), plainText(section.content)].filter(Boolean).join("\n");
        }),
        plainText(job.additionalPlain || job.additional),
      ].filter(Boolean).join("\n\n"),
      jobUrl: canonicalUrl(text(job.hostedUrl)),
      postedDate: "", // Lever's public postings API does not guarantee a publication date.
      company,
      salaryRange: [text(salary.currency), [text(salary.min), text(salary.max)].filter(Boolean).join(" - "), text(salary.interval)].filter(Boolean).join(" "),
      employmentType: text(categories.commitment), worktype: text(job.workplaceType),
      locations: schemaLocations(categories.allLocations || categories.location), ats: board.kind,
    };
  });
}

/** Fill gaps from a matching detail page without discarding API multi-locations. */
export function enrichJob(seed: RawJob, detail: RawJob): RawJob {
  const merged = { ...seed };
  for (const field of [
    "title", "description", "postedDate", "jdDeadline", "company",
    "salaryRange", "employmentType", "worktype",
  ] as const) {
    if (detail[field]) merged[field] = detail[field];
  }
  // Detail structured addresses are more precise than API display labels.
  // Retain extra API locations; remove repeated labels/cities already represented.
  merged.locations = [
    ...detail.locations,
    ...seed.locations.filter(location => !detail.locations.some(other => {
      if (location.location && location.location === other.location) return true;
      const first = ukLocation(location);
      const second = ukLocation(other);
      if (first?.city && second?.city && first.city.toLowerCase() === second.city.toLowerCase() &&
        (!first.state || first.state.toLowerCase() === second.state.toLowerCase())) return true;
      return Boolean(location.city && location.city === other.city && location.country === other.country);
    })),
  ];
  return merged;
}
