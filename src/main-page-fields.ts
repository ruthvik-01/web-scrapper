import { load } from "cheerio";

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const supplied = (value: string) => /^(?:not specified|not available|please select|n\/?a|null)$/i.test(value) ? "" : value;
const areaOnly = /^(?:.*shire|County .+|Isle of Wight|Greater London|England|Scotland|Wales|Northern Ireland|South East London)$/i;
const nonPlace = /^(?:hybrid|community|community based|home based|remote|nationwide|UK|United Kingdom)$/i;
export interface VisibleFields {
  title: string; employmentType: string; city: string; state: string;
  locationLabel: string; roleText: string;
  evidence: { employmentType: string; city: string; state: string };
}
/** Only visible primary vacancy content. Never JSON-LD, a footer/HQ, maps, or suggested jobs. */
export function mainPageFields(html: string): VisibleFields {
  const $ = load(html);
  $("script,style,header,footer,nav,input,iframe,[hidden],[aria-hidden='true'],[style*='display:none'],[style*='display: none']").remove();
  $('[id], [class]').filter((_, e) => /suggested|related|jobResultList|jobsSlider/i.test(`${$(e).attr('id') || ''} ${$(e).attr('class') || ''}`)).remove();
  const field = (suffix: string) => clean($("[id]").filter((_, e) => {
    const id = $(e).attr("id") || "";
    return id.endsWith(suffix) && !/^(li|div)_/.test(id);
  }).first().text());
  const vacancyTitle = $("h2.vac-d__title").first().clone();
  vacancyTitle.find(".addtojob-container, a, button").remove();
  const title = field("h1JobTitle") || clean($("h1").first().text()) || clean(vacancyTitle.text());
  const roleText = field("VacV_Description") || clean($(".JT-container").first().text());
  const locationLabel = supplied(field("AllLocations_lblReadonlySelected") || field("VacV_Town") || field("VacV_LocationID") || clean($('[data-testid="span-vacancies-loaction-name"]').first().text()));
  let employmentType = supplied(field("VacV_VacancyTypeID"));
  const evidence = {employmentType: employmentType ? `Visible vacancy-type field: ${employmentType}` : "", city:"", state:""};
  // Use only role-identifying clauses, not generic benefits or descriptions of other employees.
  if (!employmentType) {
    const clause = /\b(?:this is|these are|this role is|this position is)\s+(?:a\s+)?((?:permanent|temporary|fixed[- ]term)(?:\s*,?\s*(?:full[- ]time|part[- ]time))?)\s+(?:role|position|positions|contract)\b/i.exec(roleText);
    const fixed = /\bon a\s+((?:\d+|six|twelve)\s*[- ]?months?\s+fixed[- ]term)\s+basis\b/i.exec(roleText);
    const pattern = /\b(full[- ]time|part[- ]time)\s*\(\s*\d+(?:\.\d+)?\s*hours? per week\s*\)/i.exec(roleText);
    if (clause) { employmentType=clean(clause[1]!); evidence.employmentType=clause[0]; }
    else if (fixed) { employmentType="Fixed term"; evidence.employmentType=fixed[0]; }
    else if (/^Bank\b/i.test(title)) { employmentType="Bank"; evidence.employmentType=`Job title: ${title}`; }
    else if (/\bApprentice(?:ship)?\b/i.test(title)) { employmentType="Apprenticeship"; evidence.employmentType=`Job title: ${title}`; }
    else if (pattern) { employmentType=pattern[1]!; evidence.employmentType=pattern[0]; }
  }
  let city="", state="";
  // An unambiguous visible geographic label can stand alone. Named premises are retained
  // as source labels, not converted into cities (e.g. Wildflower Marston Nursery != Marston).
  if (locationLabel && !nonPlace.test(locationLabel) && !/nurser|preschool|pre-school|shopping|store|office|hospital|centre|center|\bstreet\b|\broad\b|\bWSW\b|\btravel\b/i.test(locationLabel)) {
    const parts=locationLabel.split(/\s*,\s*/).filter(Boolean).filter(x=>!/^UK|^United Kingdom$/i.test(x));
    if (parts.length === 1 && !areaOnly.test(parts[0]!)) { city=parts[0]!; evidence.city=`Visible location: ${locationLabel}`; }
    else if (parts.length === 1 && areaOnly.test(parts[0]!)) { state=parts[0]!; evidence.state=`Visible area: ${locationLabel}`; }
    else if (parts.length === 2 && !areaOnly.test(parts[0]!) && areaOnly.test(parts[1]!)) {
      city=parts[0]!;state=parts[1]!;evidence.city=evidence.state=`Visible location: ${locationLabel}`;
    }
  }
  return {title, employmentType, city, state, locationLabel, roleText, evidence};
}
