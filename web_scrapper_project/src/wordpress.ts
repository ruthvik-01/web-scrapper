import { load } from "cheerio";
import { canonicalUrl, object, plainText, text, type RawJob } from "./normalize.js";
import { jobsFromJson, schemaLocations } from "./extract.js";

const jobType = /(?:^|[-_\s])(?:jobs?|careers?|vacanc(?:y|ies)|positions?|roles?|openings?)(?:$|[-_\s])/i;

/** Find the same-origin WordPress REST root advertised by a page. */
export function discoverWordPressApiRoot(html: string, pageUrl: string): string {
  const $ = load(html);
  let root = "";
  $("link[href], a[href]").each((_, node) => {
    if (root) return;
    const element = $(node);
    const rel = (element.attr("rel") || "").toLowerCase().split(/\s+/);
    const href = element.attr("href") || "";
    const isApiLink = rel.includes("https://api.w.org/");
    const isWpJsonLink = /\/wp-json\/(?:wp\/v\d+\/)?/i.test(href) &&
      (rel.includes("alternate") || element.attr("type") === "application/json");
    if (!isApiLink && !isWpJsonLink) return;
    const resolved = canonicalUrl(href, pageUrl);
    if (!resolved) return;
    const target = new URL(resolved);
    if (target.origin !== new URL(pageUrl).origin) return;
    const marker = target.pathname.toLowerCase().indexOf("/wp-json");
    if (marker < 0) return;
    root = `${target.origin}${target.pathname.slice(0, marker + "/wp-json".length)}/`;
  });
  return root;
}

/** Use WordPress's public type index to find job-like collection routes. */
export function wordpressJobCollections(payload: unknown, apiRoot: string): string[] {
  const types = object(payload);
  const found = new Set<string>();
  for (const [slug, value] of Object.entries(types)) {
    const type = object(value);
    const labels = object(type.labels);
    const identity = [slug, type.slug, type.rest_base, type.name, labels.name, labels.singular_name]
      .map(text).join(" ");
    if (!jobType.test(identity)) continue;
    const namespace = text(type.rest_namespace) || "wp/v2";
    const base = text(type.rest_base) || text(type.slug) || slug;
    if (!/^[a-z0-9_/-]+$/i.test(namespace) || !/^[a-z0-9_-]+$/i.test(base)) continue;
    const url = new URL(`${namespace}/${base}`, apiRoot).href;
    if (new URL(url).origin === new URL(apiRoot).origin) found.add(url);
  }
  return [...found];
}

/** Map one public WordPress job collection page into the shared job shape. */
export function wordpressJobs(payload: unknown, collectionUrl: string, company = ""): RawJob[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap(value => {
    const post = object(value);
    if (!jobType.test(`${text(post.type)} ${text(post.slug)}`)) return [];
    const url = canonicalUrl(text(post.link), collectionUrl);
    const title = plainText(object(post.title).rendered ?? post.title);
    if (!url || !title) return [];

    const yoast = object(post.yoast_head_json);
    const schema = jobsFromJson(yoast.schema, url, company).find(job => job.title);
    if (schema) {
      // WordPress post IDs identify each published career record; schema
      // identifiers can be shared company references across multiple posts.
      schema.jobId = text(post.id) || schema.jobId;
      schema.jobUrl = url;
      schema.postedDate ||= text(post.date);
      return [schema];
    }

    const meta = object(post.meta);
    const acf = object(post.acf);
    const location = post.jobLocation ?? post.location ?? post.job_location ?? post.career_location ??
      acf.jobLocation ?? acf.location ?? acf.job_location ?? meta.jobLocation ?? meta.location ?? meta.job_location;
    const content = object(post.content).rendered ?? post.content;
    const hiring = object(post.hiringOrganization);
    return [{
      jobId: text(post.id), title,
      description: plainText(content), roleDescription: plainText(content), jobUrl: url,
      postedDate: text(post.date), jdDeadline: text(post.validThrough ?? post.closingDate ?? post.closing_date),
      company: plainText(hiring.name) || company,
      locations: schemaLocations(location),
      employmentType: text(post.employmentType ?? post.employment_type),
      worktype: text(post.workplaceType ?? post.workplace_type),
    } satisfies RawJob];
  });
}
