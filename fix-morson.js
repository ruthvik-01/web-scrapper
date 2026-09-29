const fs = require('fs');
const path = require('path');

const BASE = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise\\morson';
const CSV_PATH = path.join(BASE, 'jobs.csv');
const JSON_PATH = path.join(BASE, 'jobs.json');
const BACKUP_PATH = path.join(BASE, 'jobs.original.csv');

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) headerLine = headerLine.slice(1);
  if (headerLine.startsWith('ï»¿')) headerLine = headerLine.slice(3);
  const headers = parseCSVLine(headerLine);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseCSVLine(line);
    // allow rows with equal or greater length by truncating/expanding
    rows.push(row);
  }
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function encodeCSVRow(row) {
  return row.map(field => {
    if (field == null) field = '';
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }).join(',');
}

function decodeHtmlNumericEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function decodeCommonEntities(s) {
  if (!s) return s;
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&rsquo;/g, "'");
  s = s.replace(/&nbsp;/g, ' ');
  return s;
}

function cleanEncoding(str) {
  if (!str) return str || '';
  // fix common mojibake
  str = str.replace(/Â£/g, '£');
  str = str.replace(/â€™/g, "'");
  str = str.replace(/â€“/g, '-');
  // remove stray Â and Ã which often appear from double-decoding
  str = str.replace(/Â/g, '');
  str = str.replace(/Ã/g, '');
  // fix common unicode escapes
  return str;
}

// read files
if (!fs.existsSync(CSV_PATH) || !fs.existsSync(JSON_PATH)) {
  console.error('Missing morson source files.');
  process.exit(1);
}
const csvRaw = fs.readFileSync(CSV_PATH, 'utf8');
const jsonRaw0 = fs.readFileSync(JSON_PATH, 'utf8');
// backup original CSV
fs.writeFileSync(BACKUP_PATH, csvRaw, 'utf8');
console.log('Backup saved to', BACKUP_PATH);

// strip BOM/leading weird chars from json
let jsonRaw = jsonRaw0;
if (jsonRaw.charCodeAt(0) === 0xFEFF) jsonRaw = jsonRaw.slice(1);
if (jsonRaw.startsWith('\u00EF\u00BB\u00BF')) jsonRaw = jsonRaw.slice(3);
if (jsonRaw.startsWith('ï»¿')) jsonRaw = jsonRaw.slice(3);

const { headers, rows } = parseCSV(csvRaw);
let json;
try { json = JSON.parse(jsonRaw); } catch (e) { console.error('Failed to parse morson jobs.json', e); process.exit(1); }

// build jobUrl -> json job object map
const urlMap = new Map();
for (const item of json) {
  if (item.jobUrl) urlMap.set(item.jobUrl, item);
}

// known non-UK city substrings to exclude
const nonUK = ['Toronto','Burnaby','Vancouver','Ottawa','Mississauga','Kelowna','Montreal','Oshawa','Niagara','Saskatoon','Pointe Claire','Pointe-Claire','Pointe Claire','PointeClaire','Paris','Calgary','Pittsburgh','Wilmington','Schenectady','Pointe Claire','Ottawa','Kelowna','Mississauga','Mississauga','Niagara','Saskatoon','Kelowna','Ottawa','Mississauga'];

const cleanedRows = [];
const excluded = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  // Ensure row has at least 15 fields
  const r = row.slice(0, 15);
  while (r.length < 15) r.push('');
  let [jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats] = r;

  // normalize encoding
  title = cleanEncoding(title);
  description = cleanEncoding(description);
  salaryRange = cleanEncoding(salaryRange);
  location = cleanEncoding(location);
  city = cleanEncoding(city);
  company = cleanEncoding(company);
  ats = cleanEncoding(ats);

  // decode percent-encodings in location/city/jobUrl
  try {
    if (jobUrl) jobUrl = decodeURIComponent(jobUrl);
  } catch (e) { /* ignore */ }
  try { if (location) location = decodeURIComponent(location); } catch (e) {}
  try { if (city) city = decodeURIComponent(city); } catch (e) {}

  // decode numeric HTML entities like &#39;
  location = decodeHtmlNumericEntities(location);
  city = decodeHtmlNumericEntities(city);
  description = decodeHtmlNumericEntities(description);

  // decode common named entities
  location = decodeCommonEntities(location);
  city = decodeCommonEntities(city);
  description = decodeCommonEntities(description);

  // map CSV numeric jobId to JSON slug-based jobId when jobUrl matches
  const jsonItem = urlMap.get(jobUrl);
  if (jsonItem && jsonItem.jobId) {
    if (jobId !== jsonItem.jobId) {
      jobId = jsonItem.jobId;
    }
    // attempt to copy postedDate from JSON if present
    if ((!postedDate || postedDate.trim() === '') && jsonItem.postedDate) {
      postedDate = jsonItem.postedDate;
    }
  }

  // move hourly/daily/pd rates from salaryRange into description
  if (salaryRange && /\b(pd|per day|\/day|per hour|hour|hr|hourly|day|pw|per week)\b/i.test(salaryRange)) {
    // append to description
    const salaryText = salaryRange.trim();
    description = (description ? description + ' ' : '') + 'Salary: ' + salaryText + '.';
    salaryRange = '';
  }

  // also if salaryRange contains '£' with 'k' and '+' leave it (annual) — no action

  // exclude non-UK rows by city match
  const cityForCheck = (city || location || '').toLowerCase();
  let isNonUK = false;
  for (const s of nonUK) {
    if (!s) continue;
    if (cityForCheck.includes(s.toLowerCase())) { isNonUK = true; break; }
  }
  if (isNonUK) {
    excluded.push({line: i+2, jobId, jobUrl, reason: 'non-UK location', city, location});
    continue; // skip adding to cleanedRows
  }

  // re-assign cleaned values
  const outRow = [jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats];
  cleanedRows.push(outRow);
}

// write cleaned CSV back to morson/jobs.csv
const headerLine = headers.join(',');
const csvOut = [headerLine, ...cleanedRows.map(encodeCSVRow)].join('\n');
fs.writeFileSync(CSV_PATH, '\uFEFF' + csvOut, 'utf8');
console.log(`Wrote cleaned morson CSV: ${CSV_PATH} (rows kept: ${cleanedRows.length}, excluded: ${excluded.length})`);

// write an exclusions report
const exclPath = path.join(BASE, 'morson_exclusions.json');
fs.writeFileSync(exclPath, JSON.stringify({excluded, kept: cleanedRows.length}, null, 2), 'utf8');
console.log('Exclusions report written to', exclPath);

console.log('Done.');
