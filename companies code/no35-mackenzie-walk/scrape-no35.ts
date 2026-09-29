#!/usr/bin/env tsx
/**
 * Scrape No 35 Mackenzie Walk venue page from Portobello Brewery careers board.
 * 
 * Source: https://careers.portobellobrewery.com/venue/no35-mackenzie-walk
 * 
 * The page is a Talent Funnel-powered careers site. The venue-specific URL shows
 * the venue profile but the vacancies list is empty (totalResults: 0) as of the
 * check date. The board uses a Next.js app with server-side props containing
 * the vacancy data in the __NEXT_DATA__ script tag.
 *
 * Board employer: Portobello Pubs and Bars (Portobello Brewery)
 * Requested company label: No 35 Mackenzie Walk
 *
 * Status: NO CURRENT VACANCIES for this venue as of 2026-09-25.
 *
 * Usage: npx tsx scrape-no35.ts --delivery "D:\...\output\2026-09-25-main-uk-scrape" --apply
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VENUE_URL = "https://careers.portobellobrewery.com/venue/no35-mackenzie-walk";
const VENUE_ID = "4bmqOIXmJZDJSWscRtm3vz";
const COMPANY_LABEL = "No 35 Mackenzie Walk";
const BOARD_EMPLOYER = "Portobello Pubs and Bars";
const FOLDER = "no35-mackenzie-walk";
const ATS = "Talent Funnel";

const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype", "location", "city",
  "state", "country", "ats",
] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£",
  euro: "€", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "201c", rdquo: "201d", bull: "•", eacute: "é", egrave: "è", ouml: "ö",
  auml: "ä", uuml: "ü", copy: "©", reg: "®", trade: "™", deg: "°",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\u00c2(?=[\u00a3\u00a9\u00ae])/g, "");
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|li|ul|ol|div|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*(li)[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0]+/g, " ").replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) lines.push(COLUMNS.map((c) => csvField(row[c] ?? "")).join(","));
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]) {
  const args = { delivery: "", cutoff: "2026-07-25", checkDate: "2026-09-25", apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--delivery") args.delivery = argv[++i] ?? "";
    else if (a === "--cutoff") args.cutoff = argv[++i] ?? args.cutoff;
    else if (a === "--check-date") args.checkDate = argv[++i] ?? args.checkDate;
    else if (a === "--apply") args.apply = true;
  }
  if (!args.delivery) throw new Error("--delivery <working folder> is required");
  return args;
}

interface TalentFunnelVacancy {
  id: string;
  vacancyId: string;
  jobTitle: string;
  company: {
    identifier: string;
    name: string;
  };
  category: string;
  location: {
    city: string;
    country: string;
    formattedAddress: string;
    geoLocation?: { type: string; coordinates: number[][] };
  };
  description: string;
  hoursType: string;
  remuneration?: {
    currency?: string;
    description?: string;
    interval?: string;
    type?: string;
    ranges?: { type: string; value: number }[];
  };
  applicationUrl: string;
  validFrom: string;
  validTo: string;
}

interface VenuePageProps {
  venue: {
    id: string;
    formattedName: string;
    urlIdentifier: string;
    profile: {
      description: string;
      country: string;
    };
    locations: Array<{
      name: string;
      address: {
        buildingName?: string;
        addressLine1: string;
        addressLine2?: string;
        city: string;
        country: string;
        county?: string;
        postCode: string;
        geoLocation?: { type: string; coordinates: number[][] };
      };
    }>;
  };
  vacancies: TalentFunnelVacancy[];
  totalResults: number;
}

async function fetchVenueVacancies(): Promise<{ props: { pageProps: VenuePageProps } } | null> {
  const res = await fetch(VENUE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    console.error(`Failed to fetch ${VENUE_URL}: HTTP ${res.status}`);
    return null;
  }
  const html = await res.text();
  // Extract __NEXT_DATA__ JSON from script tag
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.error("Could not find __NEXT_DATA__ script in page");
    return null;
  }
  try {
    return JSON.parse(match[1]!) as { props: { pageProps: VenuePageProps } };
  } catch (e) {
    console.error("Failed to parse __NEXT_DATA__ JSON:", e);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = join(args.delivery, "jobs company wise", FOLDER);
  
  console.log(`Checking ${VENUE_URL} for vacancies...`);
  
  const data = await fetchVenueVacancies();
  if (!data) {
    console.error("Failed to fetch venue data");
    process.exitCode = 1;
    return;
  }
  
  const props = data.props.pageProps;
  const venue = props.venue;
  const vacancies = props.vacancies || [];
  const totalResults = props.totalResults || 0;
  
  console.log(`Venue: ${venue.formattedName}`);
  console.log(`Venue locations: ${venue.locations.length}`);
  console.log(`Total results reported by board: ${totalResults}`);
  console.log(`Actual vacancies array length: ${vacancies.length}`);
  
  // Get venue location info
  const venueLocation = venue.locations[0];
  const venueCity = venueLocation?.address?.city || "London";
  const venueState = venueLocation?.address?.county || "Greater London";
  const venuePostcode = venueLocation?.address?.postCode || "E14 4PH";
  const venueAddress = venueLocation?.address?.formattedAddress || 
    `35 Mackenzie Walk, Canary Wharf, London, ${venuePostcode}`;
  
  const rows: Row[] = [];
  const excluded: { vacancyId: string; title: string; reason: string }[] = [];
  
  for (const vacancy of vacancies) {
    const vacancyId = vacancy.vacancyId || vacancy.id;
    const title = vacancy.jobTitle || "";
    
    if (!vacancyId) continue;
    
    // Check if this vacancy belongs to No 35 Mackenzie Walk venue
    // The company.identifier should match the venue URL identifier
    const companyIdentifier = vacancy.company?.identifier || "";
    const belongsToVenue = companyIdentifier === "no35-mackenzie-walk" || 
      vacancy.applicationUrl?.includes("no35-mackenzie-walk");
    
    if (!belongsToVenue) {
      excluded.push({
        vacancyId,
        title,
        reason: `belongs to different venue/company: ${vacancy.company?.name || companyIdentifier}`,
      });
      continue;
    }
    
    // Check posting date vs cutoff
    const postedIso = (vacancy.validFrom || "").slice(0, 10);
    const deadlineIso = (vacancy.validTo || "").slice(0, 10);
    
    if (postedIso && postedIso < args.cutoff) {
      excluded.push({
        vacancyId,
        title,
        reason: `posted ${postedIso} before cutoff ${args.cutoff}`,
      });
      continue;
    }
    
    if (deadlineIso && deadlineIso < args.checkDate) {
      excluded.push({
        vacancyId,
        title,
        reason: `deadline ${deadlineIso} before check date ${args.checkDate}`,
      });
      continue;
    }
    
    // Country check
    const country = vacancy.location?.country || "GB";
    if (country !== "GB" && country !== "United Kingdom") {
      excluded.push({
        vacancyId,
        title,
        reason: `country ${country} is not United Kingdom`,
      });
      continue;
    }
    
    // Location from vacancy
    const vacancyCity = vacancy.location?.city?.split(" - ").pop()?.trim() || venueCity;
    
    // Salary - only annual amounts
    let salaryRange = "";
    if (vacancy.remuneration?.interval === "YEARLY") {
      const amounts = (vacancy.remuneration.ranges || [])
        .map(r => r.value)
        .filter(v => Number.isFinite(v) && v > 0);
      if (amounts.length > 0) {
        const min = Math.min(...amounts);
        const max = Math.max(...amounts);
        salaryRange = min === max ? `£${min}` : `£${min}-£${max}`;
      }
    }
    
    rows.push({
      jobId: vacancyId,
      title,
      description: htmlToText(vacancy.description || ""),
      jobUrl: vacancy.applicationUrl || `https://careers.portobellobrewery.com/vacancy/${vacancyId}`,
      postedDate: postedIso,
      jdDeadline: deadlineIso,
      company: COMPANY_LABEL,
      salaryRange,
      employmentType: vacancy.hoursType === "FULL_TIME" ? "Full-time" : 
        vacancy.hoursType === "PART_TIME" ? "Part-time" : 
        vacancy.hoursType === "BOTH" ? "Full-time/Part-time" : "",
      worktype: "",
      location: `${vacancyCity}, ${venueState}, United Kingdom`,
      city: vacancyCity,
      state: venueState,
      country: "United Kingdom",
      ats: ATS,
    });
    
    console.log(`  kept ${vacancyId} ${title}`);
  }
  
  for (const item of excluded) {
    console.log(`  excluded ${item.vacancyId} ${item.title}: ${item.reason}`);
  }
  
  const report = {
    company: COMPANY_LABEL,
    folder: FOLDER,
    boardEmployer: BOARD_EMPLOYER,
    boardUrl: VENUE_URL,
    venueProfile: {
      id: VENUE_ID,
      name: venue.formattedName,
      urlIdentifier: venue.urlIdentifier,
      address: venueAddress,
      postcode: venuePostcode,
      city: venueCity,
      state: venueState,
    },
    extraction: "Server-side props from Next.js __NEXT_DATA__ script tag",
    scrapedAt: args.checkDate,
    cutoff: args.cutoff,
    totalResultsOnBoard: totalResults,
    vacanciesInArray: vacancies.length,
    exported: rows.length,
    excluded,
    sourceReferences: Object.fromEntries(rows.map(r => [r.jobId, r.title])),
    note: `The venue page ${VENUE_URL} is a valid public-facing careers source for No 35 Mackenzie Walk, a Portobello Pubs and Bars venue in Canary Wharf, London E14 4PH. As of the check date, this venue has no live vacancies posted. The board identity (Portobello Pubs and Bars / Portobello Brewery) is recorded in boardEmployer above while the company column uses the requested label.`,
    salaryNote: "salaryRange holds annual figures only; hourly pay stays in the description.",
    worktypeNote: "worktype is blank as the source does not explicitly state remote/hybrid/on-site.",
  };
  
  if (args.apply) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "jobs.csv"), rowsToCsv(rows), "utf8");
    writeFileSync(join(folder, "jobs.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    writeFileSync(join(folder, "source-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${rows.length} rows to ${folder}`);
  } else {
    console.log("\nDry run: add --apply to write the company folder files");
  }
  
  console.log(`\nSummary:`);
  console.log(`  Total results on board: ${totalResults}`);
  console.log(`  Vacancies for this venue: ${rows.length}`);
  console.log(`  Excluded: ${excluded.length}`);
  console.log(`\nStatus: ${rows.length > 0 ? "READY FOR LEAD REVIEW" : "NO CURRENT VACANCIES - header-only output"}`);
}

if (process.argv[1]?.endsWith("scrape-no35.ts")) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
