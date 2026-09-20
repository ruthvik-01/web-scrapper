import { setTimeout as sleep } from "node:timers/promises";
import { array, isUkCountry, object, text, type JobLocation, type RawJob } from "./normalize.js";

type Json = Record<string, unknown>;
export type GeoLookup = (url: string) => Promise<unknown>;
export interface LocationEvidence {
  jobId: string;
  jobUrl: string;
  visibleLocation: string;
  sourceLocations: JobLocation[];
  resolvedLocations: JobLocation[];
  notes: string[];
}
const key = (value: string): string => value.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
const countryLabel = (value: string): boolean => isUkCountry(value);
const generic = (value: string): boolean => /^(home[- ]based|community based|remote|nationwide|not specified)$/i.test(value);
const administrative = (value: string): boolean => /\b(county|yorkshire|midlands)\b/i.test(value);
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

/**
 * Resolve Eploy's visible location labels against job-specific postcode evidence
 * and the Postcodes.io gazetteer. Never assume UK just because a UK-only search
 * happens to find a same-named place (e.g. London, Canada).
 */
export class Geography {
  private cache = new Map<string, Promise<unknown>>();
  private lastRequest = 0;
  requests = 0;
  evidence: LocationEvidence[] = [];
  constructor(private lookup?: GeoLookup) {}

  private async get(path: string): Promise<unknown> {
    const url = `https://api.postcodes.io${path}`;
    if (!this.cache.has(url)) {
      this.cache.set(url, (async () => {
        if (!this.lookup) {
          const wait = this.lastRequest + 500 - Date.now();
          if (wait > 0) await sleep(wait);
          this.lastRequest = Date.now();
        }
        this.requests++;
        if (this.lookup) return this.lookup(url);
        const response = await fetch(url, {
          headers: { "User-Agent": "UKCompanyJobScraper/0.1", Accept: "application/json" },
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Postcodes.io HTTP ${response.status}.`);
        return response.json();
      })());
    }
    return this.cache.get(url)!;
  }

  async resolve(job: RawJob): Promise<RawJob> {
    if (job.ats !== "Eploy") return job;
    const source = job.locations;
    const notes = [...(job.notes || [])];
    const label = text(job.visibleLocation);
    const sourceCountry = source.map(location => text(location.country)).find(Boolean) || "";
    // Explicit foreign country must not be overridden by a same-named UK place.
    if (source.some(location => location.country && !isUkCountry(location.country))) return job;
    let uk = isUkCountry(sourceCountry);
    const postcodeResults = new Map<string, Json>();
    try {
      for (const location of source) {
        if (!location.postcode) continue;
        const payload = object(await this.get(`/postcodes/${encodeURIComponent(location.postcode)}`));
        const result = object(payload.result);
        if (isUkCountry(text(result.country))) {
          postcodeResults.set(location.postcode, result);
          uk = true;
        }
      }
      const travelIndex = label.search(/\btravel (?:throughout|across|within)\b/i);
      const baseLabel = travelIndex > 0 ? label.slice(0, travelIndex).replace(/[,;\s]+$/, "") : label;
      const tokens = unique(baseLabel.split(/\s*[,;|]\s*|\s+\/\s+/).map(value => value.trim()).filter(Boolean));
      if (tokens.some(countryLabel)) uk = true;
      const sourceStates = unique(source.map(location => text(location.state)));
      const sourceCities = unique(source.map(location => text(location.city)));
      const geo = new Map<string, Json[]>();
      const exact = new Map<string, Json[]>();
      for (const token of tokens) {
        if (countryLabel(token) || generic(token)) continue;
        const payload = object(await this.get(`/places?q=${encodeURIComponent(token)}&limit=100`));
        const northernIreland = source.some(location => /northern ireland/i.test(`${location.country} ${location.state}`)) ||
          [...postcodeResults.values()].some(postcode => text(postcode.country) === "Northern Ireland");
        const places = array(payload.result).map(object).filter(place => isUkCountry(text(place.country)) &&
          (!northernIreland || text(place.country) === "Northern Ireland"));
        geo.set(token, places);
        let matches = places.filter(place => [text(place.name_1), text(place.name_2)].some(name => key(name) === key(token)));
        if (matches.length > 1) {
          const related = source.filter(location => key(text(location.city)) === key(token) ||
            (location.street && key(location.street).includes(key(token))));
          const postcodes = related.flatMap(location => location.postcode && postcodeResults.has(location.postcode)
            ? [postcodeResults.get(location.postcode)!] : []);
          const byOutcode = matches.filter(place => postcodes.some(postcode => text(place.outcode) === text(postcode.outcode) && text(place.outcode)));
          const byDistrict = matches.filter(place => postcodes.some(postcode =>
            [place.county_unitary, place.district_borough].some(region => key(text(region)) === key(text(postcode.admin_district)) && text(region))));
          if (byOutcode.length === 1) matches = byOutcode;
          else if (byDistrict.length === 1) matches = byDistrict;
        }
        exact.set(token, matches);
      }
      // A source county plus a matching settlement provides independent context.
      if (!uk) {
        for (const matches of exact.values()) {
          if (matches.some(place => sourceStates.some(state =>
            [place.county_unitary, place.district_borough, place.region, place.country]
              .some(region => key(text(region)) === key(state))))) uk = true;
        }
      }
      const parents = new Set(sourceStates.filter(state => !sourceCities.some(city => key(city) === key(state))).map(key));
      for (const matches of exact.values()) {
        for (const place of matches) {
          for (const field of ["county_unitary", "district_borough", "region", "country"]) {
            if (text(place[field])) parents.add(key(text(place[field])));
          }
        }
      }
      let leaves = tokens.filter(token => !countryLabel(token) &&
        (!parents.has(key(token)) || (exact.get(token) || []).some(place => /^(City|Town)$/i.test(text(place.local_type)))));
      // A lone state/country is an area, not a city. Keep its original display.
      if (!leaves.length && label) leaves = [label];
      const result: JobLocation[] = [];
      if (!label || generic(label) || tokens.every(countryLabel)) {
        for (const location of source) {
          result.push({
            ...location, country: uk ? "UK" : location.country,
            location: label || location.location || (uk ? "United Kingdom" : ""),
            city: label ? "" : location.city,
            state: label ? (/^(England|Scotland|Wales|Northern Ireland)$/i.test(label) ? label : "") : location.state,
            resolved: true,
          });
        }
      } else {
        for (const leaf of leaves) {
          const matches = exact.get(leaf) || [];
          const regions = unique(matches.map(place => text(place.county_unitary) || text(place.district_borough) || text(place.region)));
          const sameSourceCity = source.find(location => key(text(location.city)) === key(leaf));
          const siteAddress = source.find(location => location.street && key(location.street).includes(key(leaf)));
          const parent = source.find(location => key(text(location.state)) === key(leaf));
          const countyToken = tokens.find(token => key(token) !== key(leaf) && sourceStates.some(state => key(state) === key(token)));
          let city = "";
          let state = "";
          const isTown = matches.some(place => /^(City|Town)$/i.test(text(place.local_type)));
          if (generic(leaf) || countryLabel(leaf) || (parent && !isTown) || administrative(leaf)) {
            state = parent?.state || (countryLabel(leaf) && !/^(uk|gb|gbr|united kingdom)$/i.test(leaf) ? leaf : "");
          } else if (matches.length) {
            city = leaf;
            state = countyToken || (regions.length === 1 ? regions[0]! : "");
            if (regions.length > 1 && !state) notes.push(`Location "${leaf}" has multiple regional matches; state left empty.`);
          } else if (sameSourceCity) {
            city = leaf;
            state = text(sameSourceCity.state);
          } else if (siteAddress && siteAddress.postcode && postcodeResults.has(siteAddress.postcode)) {
            city = text(siteAddress.city);
            state = text(siteAddress.state);
          } else {
            const possible = (geo.get(leaf) || []).filter(place => /^(City|Town|Village)$/i.test(text(place.local_type)) &&
              (key(text(place.name_1)).includes(key(leaf)) || key(text(place.name_2)).includes(key(leaf))));
            // Keep an explicit abbreviated place label, without guessing its full name.
            if (uk && possible.length && !administrative(leaf)) {
              city = leaf;
              const common = unique(possible.map(place => text(place.county_unitary) || text(place.district_borough)));
              state = common.length === 1 ? common[0]! : "";
              notes.push(`Source location name "${leaf}" retained; multiple or non-exact gazetteer matches.`);
            } else {
              notes.push(`Visible site/area "${leaf}" retained; no city guessed.`);
            }
          }
          result.push({ location: leaf, city, state, country: uk ? "UK" : "", resolved: true });
        }
      }
      // Separate settlement rows from county/area facets, but retain a meaningful
      // area-only role when no specific settlement could be established.
      const settlements = result.filter(location => location.city);
      if (!settlements.length && leaves.length > 1) notes.push("Regional/site location facets retained together; no distinct cities were established.");
      // Do not discard a named site just because another location has a resolved
      // city: "Falmer, Testwood WSW" still requires a separate Testwood row.
      const resolved = settlements.length ? result : [{
        location: label || result[0]?.location || "", city: "",
        state: result.length === 1 ? text(result[0]?.state) : "",
        country: uk ? "UK" : "", resolved: true,
      }];
      if (travelIndex > 0 && resolved.length === 1) {
        resolved[0]!.location = label;
        notes.push("Travel coverage retained in location text; not treated as additional base locations.");
      }
      const finalLocations = [...new Map(resolved.map(location => [JSON.stringify(location), location])).values()];
      this.evidence.push({
        jobId: job.jobId || "", jobUrl: job.jobUrl, visibleLocation: label,
        sourceLocations: source, resolvedLocations: finalLocations, notes: unique(notes),
      });
      return { ...job, locations: finalLocations, notes: unique(notes) };
    } catch (error) {
      // A failed resolver must not silently restore an address already known to
      // conflict with the visible job location.
      const warning = `Location verification failed: ${error instanceof Error ? error.message : String(error)}`;
      const locations = label ? [{ location: label, city: "", state: "", country: uk ? "UK" : "", resolved: true }] : source;
      this.evidence.push({ jobId: job.jobId || "", jobUrl: job.jobUrl, visibleLocation: label, sourceLocations: source, resolvedLocations: locations, notes: [warning] });
      return { ...job, locations, notes: [...notes, warning] };
    }
  }
}
