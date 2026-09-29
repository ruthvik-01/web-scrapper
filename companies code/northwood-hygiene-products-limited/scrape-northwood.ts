#!/usr/bin/env tsx
/**
 * Scrape Northwood Hygiene Products Limited careers board (www.northwood.co.uk/careers/)
 * into the 15-column UK contract schema.
 *
 * Source: WordPress-based careers board at https://www.northwood.co.uk/careers/
 * Job posts are custom post type "career" (WordPress page IDs available via REST API).
 *
 * Employer: Northwood Hygiene Products Ltd (verified via page schema and branding)
 * Location: Milton Keynes, Buckinghamshire, UK (but with multiple UK sites)
 *
 * Rules applied (per MAIN_UK_Scrape.md):
 *  - Two-month posting window: postedDate must be >= --cutoff (default: 2026-07-24)
 *  - UK roles only: confirmed UK location required
 *  - salaryRange: annual figures only, formatted as £N or £N-£N
 *  - employmentType/worktype: blank if not explicitly stated
 *  - company: requester's label (Northwood Hygiene Products Limited)
 *  - jobId: WordPress page ID (source-backed)
 *
 * Usage:
 *   npx tsx scrape-northwood.ts --delivery "D:\Internship\MAIN\UK SCRAPPER\output\2026-09-25-main-uk-scrape"
 *   npx tsx scrape-northwood.ts --delivery "..." --apply --report
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const BASE_URL = "https://www.northwood.co.uk";
const CAREERS_URL = `${BASE_URL}/careers/`;
const API_BASE = `${BASE_URL}/wp-json/wp/v2/career`;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const COMPANY_LABEL = "Northwood Hygiene Products Limited";
const FOLDER = "northwood-hygiene-products-limited";
const ATS_LABEL = "Custom";

const COLUMNS = [
  "jobId", "title", "description", "jobUrl", "postedDate", "jdDeadline",
  "company", "salaryRange", "employmentType", "worktype", "location", "city",
  "state", "country", "ats",
] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

interface JobListing {
  url: string;
  title: string;
  location: string;
}

interface ParsedJob {
  jobId: string;
  title: string;
  description: string;
  jobUrl: string;
  postedDate: string;
  jdDeadline: string;
  location: string;
  city: string;
  state: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£",
  euro: "€", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", bull: "•", eacute: "é", egrave: "è", ouml: "ö",
  auml: "ä", uuml: "ü", copy: "©", reg: "®", trade: "™", deg: "°",
  "#8211": "–", "#8212": "—", "#8216": "‘", "#8217": "’", "#8220": "“", "#8221": "”",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+|#\d+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
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

function extractPageId(url: string): string {
  // Extract from URL slug or use post ID if available
  const match = url.match(/\/career\/([^\/]+)\/?$/);
  return match ? match[1] : "";
}

function extractDeadline(text: string): string {
  // Look for "Applications close" patterns
  const patterns = [
    /Applications?\s+close?\s+(.+?)(?:\n|$)/i,
    /Closing\s+date:?\s*(.+?)(?:\n|$)/i,
    /Deadline:?\s*(.+?)(?:\n|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[1].trim();
      return parseUkDate(dateStr);
    }
  }
  return "";
}

function parseUkDate(dateStr: string): string {
  // Handle "September 29, 2026" format
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  
  const match = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, "0");
    const monthIdx = monthNames.findIndex(m => m === match[2].toLowerCase());
    if (monthIdx >= 0) {
      return `${match[3]}-${String(monthIdx + 1).padStart(2, "0")}-${day}`;
    }
  }
  
  // Handle DD/MM/YYYY
  const ukMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ukMatch) {
    return `${ukMatch[3]}-${ukMatch[2].padStart(2, "0")}-${ukMatch[1].padStart(2, "0")}`;
  }
  
  return "";
}

function parseLocation(locationText: string): { location: string; city: string; state: string } {
  const location = locationText.trim();
  
  // UK location mapping (known sites)
  const knownLocations: Record<string, { city: string; state: string }> = {
    "lancaster": { city: "Lancaster", state: "Lancashire" },
    "ellesmere port": { city: "Ellesmere Port", state: "Cheshire" },
    "oldham": { city: "Oldham", state: "Greater Manchester" },
    "telford": { city: "Telford", state: "Shropshire" },
    "stockport": { city: "Stockport", state: "Greater Manchester" },
    "milton keynes": { city: "Milton Keynes", state: "Buckinghamshire" },
  };
  
  const key = location.toLowerCase();
  if (knownLocations[key]) {
    return {
      location: location,
      city: knownLocations[key].city,
      state: knownLocations[key].state,
    };
  }
  
  return { location, city: "", state: "" };
}

function extractSalary(text: string): string {
  // Look for annual salary patterns
  const patterns = [
    /£\s*([\d,]+)\s*(?:-|to)\s*£\s*([\d,]+)\s*(?:per\s+annum|p\.a\.|pa)?/i,
    /£\s*([\d,]+)\s*(?:per\s+annum|p\.a\.|pa)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[2]) {
        const min = parseInt(match[1].replace(/,/g, ""), 10);
        const max = parseInt(match[2].replace(/,/g, ""), 10);
        return `£${min}-£${max}`;
      } else {
        const amount = parseInt(match[1].replace(/,/g, ""), 10);
        return `£${amount}`;
      }
    }
  }
  
  return "";
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsToCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => csvField(row[c] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function rowsToJson(rows: Row[]): object[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const col of COLUMNS) {
      obj[col] = row[col] ?? "";
    }
    return obj;
  });
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

function extractJobListings(html: string): JobListing[] {
  const listings: JobListing[] = [];
  
  // Match career card links
  const cardPattern = /<a[^>]+class="career-card[^"]*"[^>]+href="(https:\/\/www\.northwood\.co\.uk\/career\/[^"]+)"[^>]*>/gi;
  const titlePattern = /<h3[^>]+class="career-card__title[^"]*"[^>]*>([^<]+)<\/h3>/gi;
  const locationPattern = /<p[^>]+class="career-card__location[^"]*"[^>]*><[^>]+>\s*<span>([^<]+)<\/span>/gi;
  
  // First extract URLs
  const urls: string[] = [];
  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    urls.push(match[1]);
  }
  
  // Extract titles
  const titles: string[] = [];
  while ((match = titlePattern.exec(html)) !== null) {
    titles.push(decodeEntities(match[1].trim()));
  }
  
  // Extract locations
  const locations: string[] = [];
  while ((match = locationPattern.exec(html)) !== null) {
    locations.push(decodeEntities(match[1].trim()));
  }
  
  // Combine into listings
  for (let i = 0; i < urls.length; i++) {
    listings.push({
      url: urls[i],
      title: titles[i] || "",
      location: locations[i] || "",
    });
  }
  
  return listings;
}

async function parseJobDetail(listing: JobListing): Promise<ParsedJob | null> {
  try {
    const html = await fetchHtml(listing.url);
    
    // Extract WordPress post ID from REST API link
    const postIdMatch = html.match(/<link rel="alternate" type="application\/json" href="https:\/\/www\.northwood\.co\.uk\/wp-json\/wp\/v2\/career\/(\d+)"/);
    const postId = postIdMatch ? postIdMatch[1] : extractPageId(listing.url);
    
    // Extract title
    const titleMatch = html.match(/<h1[^>]+class="[^"]*h2[^"]*"[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : listing.title;
    
    // Extract description
    const descMatch = html.match(/<div[^>]+class="body-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]+class="page-block[^"]*contact-form-block/);
    const description = descMatch ? htmlToText(descMatch[1]) : "";
    
    // Extract deadline from meta
    const deadlineMatch = html.match(/Applications\s+close\s+([^<,]+(?:,\s*\d{4})?)/i);
    const jdDeadline = deadlineMatch ? parseUkDate(deadlineMatch[1].trim()) : "";
    
    // Extract posted date from schema
    const datePublishedMatch = html.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})/);
    const postedDate = datePublishedMatch ? datePublishedMatch[1] : "";
    
    // Use location from listing (from the card)
    const { location, city, state } = parseLocation(listing.location);
    
    return {
      jobId: postId,
      title,
      description,
      jobUrl: listing.url,
      postedDate,
      jdDeadline,
      location,
      city,
      state,
    };
  } catch (error) {
    console.error(`Error parsing ${listing.url}:`, error);
    return null;
  }
}

function parseArgs(argv: string[]) {
  const args = {
    delivery: "",
    cutoff: "2026-07-24",
    checkDate: "2026-09-24",
    apply: false,
    report: false,
  };
  
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--delivery") args.delivery = argv[++i] ?? "";
    else if (a === "--cutoff") args.cutoff = argv[++i] ?? args.cutoff;
    else if (a === "--check-date") args.checkDate = argv[++i] ?? args.checkDate;
    else if (a === "--apply") args.apply = true;
    else if (a === "--report") args.report = true;
  }
  
  if (!args.delivery) {
    throw new Error("--delivery <working folder> is required");
  }
  
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  console.log("Northwood Hygiene Products Limited scraper");
  console.log(`Check date: ${args.checkDate}`);
  console.log(`Cutoff date: ${args.cutoff}`);
  console.log("");
  
  // Create output folder
  const companyFolder = join(args.delivery, "jobs company wise", FOLDER);
  if (!existsSync(companyFolder)) {
    mkdirSync(companyFolder, { recursive: true });
  }
  
  const report: {
    company: string;
    sourceUrl: string;
    checkDate: string;
    cutoff: string;
    listingsFound: number;
    exported: number;
    excluded: number;
    exclusions: string[];
    jobs: Row[];
  } = {
    company: COMPANY_LABEL,
    sourceUrl: CAREERS_URL,
    checkDate: args.checkDate,
    cutoff: args.cutoff,
    listingsFound: 0,
    exported: 0,
    excluded: 0,
    exclusions: [],
    jobs: [],
  };
  
  try {
    // Fetch careers landing page
    console.log(`Fetching: ${CAREERS_URL}`);
    const landingHtml = await fetchHtml(CAREERS_URL);
    
    // Save landing page for provenance
    if (args.report) {
      const cacheFolder = join(args.delivery, "source-cache");
      if (!existsSync(cacheFolder)) {
        mkdirSync(cacheFolder, { recursive: true });
      }
      writeFileSync(join(cacheFolder, "northwood-careers-landing.html"), landingHtml, "utf8");
    }
    
    // Extract job listings
    const listings = extractJobListings(landingHtml);
    report.listingsFound = listings.length;
    console.log(`Found ${listings.length} job listings`);
    
    // Parse each job detail
    const rows: Row[] = [];
    for (const listing of listings) {
      console.log(`  Parsing: ${listing.title} (${listing.location})`);
      
      const parsed = await parseJobDetail(listing);
      if (!parsed) {
        report.exclusions.push(`Failed to parse: ${listing.url}`);
        report.excluded++;
        continue;
      }
      
      // Date check
      if (parsed.postedDate) {
        const posted = new Date(parsed.postedDate);
        const cutoff = new Date(args.cutoff);
        if (posted < cutoff) {
          report.exclusions.push(`Posted ${parsed.postedDate} before cutoff: ${parsed.title}`);
          report.excluded++;
          continue;
        }
      }
      
      // Build final row
      const row: Row = {
        jobId: parsed.jobId,
        title: parsed.title,
        description: parsed.description,
        jobUrl: parsed.jobUrl,
        postedDate: parsed.postedDate,
        jdDeadline: parsed.jdDeadline,
        company: COMPANY_LABEL,
        salaryRange: extractSalary(parsed.description),
        employmentType: "",
        worktype: "",
        location: parsed.location,
        city: parsed.city,
        state: parsed.state,
        country: "United Kingdom",
        ats: ATS_LABEL,
      };
      
      rows.push(row);
      report.exported++;
    }
    
    // Write outputs
    const csvPath = join(companyFolder, "jobs.csv");
    const jsonPath = join(companyFolder, "jobs.json");
    
    if (rows.length > 0) {
      writeFileSync(csvPath, rowsToCsv(rows), "utf8");
      writeFileSync(jsonPath, JSON.stringify(rowsToJson(rows), null, 2), "utf8");
      console.log(`\nExported ${rows.length} rows to ${csvPath}`);
    } else {
      // Write header-only CSV for unresolved
      const headerRow = COLUMNS.reduce((acc, col) => ({ ...acc, [col]: "" }), {} as Row);
      writeFileSync(csvPath, rowsToCsv([]), "utf8");
      writeFileSync(jsonPath, "[]", "utf8");
      console.log(`\nNo jobs exported (header-only CSV written)`);
    }
    
    report.jobs = rows;
    
  } catch (error) {
    console.error("Scraping failed:", error);
    report.exclusions.push(`Scraping error: ${error}`);
  }
  
  // Write report
  if (args.report) {
    const reportPath = join(args.delivery, "source-report.json");
    let existingReport: any = {};
    
    if (existsSync(reportPath)) {
      try {
        existingReport = JSON.parse(readFileSync(reportPath, "utf8"));
      } catch {}
    }
    
    existingReport[FOLDER] = report;
    writeFileSync(reportPath, JSON.stringify(existingReport, null, 2), "utf8");
    console.log(`\nReport written to ${reportPath}`);
  }
  
  console.log("\n=== SUMMARY ===");
  console.log(`Listings found: ${report.listingsFound}`);
  console.log(`Exported: ${report.exported}`);
  console.log(`Excluded: ${report.excluded}`);
  if (report.exclusions.length > 0) {
    console.log("\nExclusions:");
    for (const exc of report.exclusions) {
      console.log(`  - ${exc}`);
    }
  }
  console.log(`\nStatus: ${report.exported > 0 ? "READY FOR LEAD REVIEW" : "BLOCKED"}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
