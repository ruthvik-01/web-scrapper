import { load } from "cheerio";
import { plainText, type RawJob } from "./normalize.js";

/** NHS Jobs' server-rendered advert, distinct from employer contact addresses. */
export function extractNhsAdvert(html: string, url: string): RawJob[] {
  const parsed = new URL(url);
  if (!/(^|\.)jobs\.nhs\.uk$/.test(parsed.hostname) || !/\/candidate\/jobadvert\//.test(parsed.pathname)) return [];
  const $ = load(html);
  const title = $("#heading").first().text().trim();
  const company = $("#employer_name").first().text().trim();
  const details = $("#date_posted").first().parent();
  if (!title || !company || !details.length) return [];
  const chunks = new Set<string>();
  for (const container of [
    $("#job_description").first().parent(),
    $("#job_description_large").first().parent(),
    ...$("h3[id^='skill_category_']").toArray().map(node => $(node).parent()),
  ]) {
    const value = plainText(container.html());
    if (value) chunks.add(value);
  }
  const contract = $("#contract_type").first().text().trim();
  if (contract) chunks.add(`Contract: ${contract}`);
  const description = [...chunks].join("\n\n");
  if (!description) return [];
  const locations = details.find("p[id^='employer_country']").toArray().map(node => {
    const country = $(node);
    const parts = country.prevUntil("p[id^='employer_country'], h3").addBack();
    const field = (prefix: string) => parts.filter(`[id^='${prefix}']`).first().text().trim();
    return {
      city: field("employer_town"), state: field("employer_county"),
      country: country.text().trim(), postcode: field("employer_postcode"),
      street: field("employer_address_line_1"),
    };
  });
  return [{
    jobId: parsed.pathname.split("/").filter(Boolean).at(-1),
    title, company, jobUrl: `${parsed.origin}${parsed.pathname}`,
    description, roleDescription: description,
    postedDate: $("#date_posted").first().text().trim(),
    jdDeadline: $("#closing_date").first().text().replace(/^The closing date is\s*/i, "").trim(),
    salaryRange: $("#range_salary, #salary").first().text().trim(),
    employmentType: $("#working_pattern_heading").first().next("p").text().replace(/\s+/g, " ").trim(),
    locations, ats: "NHS Jobs",
  }];
}
