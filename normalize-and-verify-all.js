const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise';
const COMBINED_SCRIPT = path.join('D:\\Internship\\MAIN\\UK SCRAPPER','fix-smarted-two-month.js');
const CUTOFF = new Date('2026-07-25');

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length === 0) return { headers: [], rows: [] };
  let header = lines[0];
  if (header.charCodeAt(0) === 0xFEFF) header = header.slice(1);
  if (header.startsWith('ï»¿')) header = header.slice(3);
  const headers = parseCSVLine(header);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    rows.push(parseCSVLine(l));
  }
  return { headers, rows };
}

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function encodeCSVRow(row) {
  return row.map(f => {
    if (f == null) f = '';
    if (f.includes(',') || f.includes('"') || f.includes('\n')) return '"' + f.replace(/"/g,'""') + '"';
    return f;
  }).join(',');
}

function cleanEncoding(s) {
  if (!s) return '';
  s = s.replace(/Â£/g, '£');
  s = s.replace(/â€™/g, "'");
  s = s.replace(/â€“/g, '-');
  s = s.replace(/ï»¿/g, '');
  s = s.replace(/\u00EF\u00BB\u00BF/g, '');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&rsquo;/g, "'");
  s = s.replace(/&nbsp;/g, ' ');
  // decode numeric entities
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n,10)));
  // percent-decode if necessary
  try { s = decodeURIComponent(s); } catch(e) {}
  return s;
}

function normalizeSalary(s) {
  if (!s) return '';
  s = s.trim();
  const lower = s.toLowerCase();
  // If contains competitive or similar, clear.
  if (/competitive|tbd|negotiable|various|dependent/i.test(s)) return '';
  // If hourly/daily/pd/pw etc -> indicate to move
  if (/\b(pd|per day|\/day|per hour|hour|hr|hourly|day|pw|per week|per annum|per year)\b/i.test(lower)) return null; // null => move to description
  // Extract numbers like £28,000 - £36,000 or £28k - £36k or £100k + benefits or £30000
  // remove commas and plus/benefits text
  let clean = s.replace(/,/g,'').replace(/\+.*$/,'').replace(/per annum|per year/ig,'').trim();
  // handle ranges with -
  const rangeMatch = clean.match(/£?\s*([\d\.kK]+)\s*[-–—]\s*£?\s*([\d\.kK]+)/);
  if (rangeMatch) {
    const a = normalizeNumberToken(rangeMatch[1]);
    const b = normalizeNumberToken(rangeMatch[2]);
    if (a && b) return `£${a} - £${b}`;
    return '';
  }
  // single value like £100k or £30000
  const singleMatch = clean.match(/£?\s*([\d\.kK]+)/);
  if (singleMatch) {
    const a = normalizeNumberToken(singleMatch[1]);
    if (a) return `£${a} - £${a}`; // represent as range where both ends same
  }
  return '';
}

function normalizeNumberToken(tok) {
  if (!tok) return null;
  tok = tok.toLowerCase();
  if (tok.endsWith('k')) {
    const n = parseFloat(tok.slice(0,-1));
    if (isNaN(n)) return null;
    return String(Math.round(n * 1000));
  }
  if (tok.includes('.')) {
    const n = parseFloat(tok);
    if (isNaN(n)) return null;
    return String(Math.round(n));
  }
  const n = parseInt(tok,10);
  if (isNaN(n)) return null;
  return String(n);
}

function moveRateToDescription(candidateSalary, description) {
  if (!candidateSalary) return {salary:'', description};
  const txt = candidateSalary.trim();
  if (!description) description = '';
  description = description.trim();
  if (description && !description.endsWith('.')) description += '.';
  description = (description + ' ' + `Salary: ${txt}`).trim();
  return {salary:'', description};
}

function normalizeATS(a) {
  if (!a) return 'Custom';
  const s = a.toLowerCase();
  if (s.includes('hibob')) return 'HiBob';
  if (s.includes('inhouse') || s.includes('in-house') || s.includes('internal')) return 'InHouse';
  return 'Custom';
}

function normalizeWorktype(w) {
  if (!w) return '';
  const s = w.toLowerCase();
  if (s.includes('remote')) return 'remote';
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('office') || s.includes('onsite') || s.includes('on-site') || s.includes('site')) return 'onsite';
  // if hours-based like 'permanent' is not a worktype -> map to ''
  return '';
}

function parseDateDMY(s) {
  if (!s) return null;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0],10);
      const m = parseInt(parts[1],10)-1;
      const y = parseInt(parts[2],10);
      const dt = new Date(y,m,d);
      if (!isNaN(dt)) return dt;
    }
  }
  const dt = new Date(s);
  if (!isNaN(dt)) return dt;
  return null;
}

// main
const companies = fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT,f)).isDirectory());
const report = {companies: {}, totals: {kept:0, excluded:0, modified:0}};

for (const company of companies) {
  const folder = path.join(ROOT, company);
  const csvPath = path.join(folder, 'jobs.csv');
  const jsonPath = path.join(folder, 'jobs.json');
  if (!fs.existsSync(csvPath)) { report.companies[company] = {skipped:true}; continue; }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const { headers, rows } = parseCSV(raw);
  const header = headers.join(',');
  const json = fs.existsSync(jsonPath) ? (function(){try{let jraw=fs.readFileSync(jsonPath,'utf8'); if (jraw.charCodeAt(0)===0xFEFF) jraw=jraw.slice(1); if (jraw.startsWith('ï»¿')) jraw=jraw.slice(3); return JSON.parse(jraw);}catch(e){return null}})() : null;

  const urlToJson = new Map();
  if (json && Array.isArray(json)) for (const it of json) if (it.jobUrl) urlToJson.set(it.jobUrl, it);

  const kept = [];
  const excluded = [];
  const modifiedIds = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].slice(0,15);
    while (r.length < 15) r.push('');
    let [jobId,title,description,jobUrl,postedDate,jdDeadline,comp,salaryRange,employmentType,worktype,location,city,state,country,ats] = r;
    let changed = false;

    title = cleanEncoding(title);
    description = cleanEncoding(description);
    salaryRange = cleanEncoding(salaryRange);
    location = cleanEncoding(location);
    city = cleanEncoding(city);
    comp = cleanEncoding(comp);
    ats = cleanEncoding(ats);
    worktype = cleanEncoding(worktype);

    try { jobUrl = decodeURIComponent(jobUrl); } catch(e){}

    // map to JSON jobId when possible (prefer stable id)
    if (json && urlToJson.has(jobUrl)) {
      const j = urlToJson.get(jobUrl);
      if (j.jobId && jobId !== j.jobId) { jobId = j.jobId; changed = true; }
      if ((!postedDate || postedDate.trim()==='') && j.postedDate) { postedDate = j.postedDate; changed = true; }
    }

    // apply two-month cutoff if postedDate present
    const pd = parseDateDMY(postedDate);
    if (pd && pd < CUTOFF) { excluded.push({jobId,reason:'postedDate before cutoff',postedDate,jobUrl}); continue; }

    // normalize ATS
    const newAts = normalizeATS(ats);
    if (newAts !== ats) { ats = newAts; changed = true; }

    // normalize worktype
    const newWork = normalizeWorktype(worktype);
    if (newWork !== worktype) { worktype = newWork; changed = true; }

    // salary handling
    let salaryNormalized = normalizeSalary(salaryRange);
    if (salaryNormalized === null) {
      // move hourly/daily to description
      const moved = moveRateToDescription(salaryRange, description);
      salaryRange = moved.salary;
      description = moved.description;
      changed = true;
    } else if (salaryNormalized === '') {
      // unparseable -> clear
      if (salaryRange && salaryRange.trim()) { salaryRange = ''; changed = true; }
    } else {
      if (salaryRange !== salaryNormalized) { salaryRange = salaryNormalized; changed = true; }
    }

    // also if description contains daily/hourly rates, ensure moved
    if (description && /\b(pd|per day|\/day|per hour|hour|hr|hourly|day|pw|per week)\b/i.test(description) && (!salaryRange || salaryRange.trim()==='')) {
      // keep as-is (already in description)
    }

    // enforce encoding fixes in description
    description = cleanEncoding(description);

    // verify country: ensure 'UK' when location looks UK-ish — if not UK-like and country is UK, mark for manual review (we won't auto-exclude all non-UK because some company folders intentionally contain non-UK); but per team rules we should exclude clearly non-UK centers.
    const locLower = ((city||location)||'').toLowerCase();
    const nonUKlist = ['toronto','burnaby','vancouver','ottawa','mississauga','kelowna','montreal','oshawa','niagara','saskatoon','pointe claire','paris','calgary','pittsburgh','wilmington','schenectady','pointe-claire','pointeclaire','pointe claire'];
    let isNonUK = false;
    for (const t of nonUKlist) if (locLower.includes(t)) { isNonUK = true; break; }
    if (isNonUK) { excluded.push({jobId,reason:'non-UK location',location,city,jobUrl}); continue; }

    const outRow = [jobId,title,description,jobUrl,postedDate,jdDeadline,comp,salaryRange,employmentType,worktype,location,city,state,country,ats];
    kept.push(outRow);
    if (changed) modifiedIds.push(jobId);
  }

  // backups and writes
  fs.writeFileSync(path.join(folder,'jobs.backup.csv'), raw, 'utf8');
  const outCsv = [header, ...kept.map(encodeCSVRow)].join('\n');
  fs.writeFileSync(path.join(folder,'jobs.csv'),'\uFEFF'+outCsv,'utf8');

  // update jobs.json if available: update matching job entries for changed fields
  if (json && Array.isArray(json)) {
    const urlMap = new Map();
    for (const j of json) if (j.jobUrl) urlMap.set(j.jobUrl, j);
    for (const row of kept) {
      const [jobId,title,description,jobUrl,postedDate,jdDeadline,comp,salaryRange,employmentType,worktype,location,city,state,country,ats] = row;
      if (urlMap.has(jobUrl)) {
        const obj = urlMap.get(jobUrl);
        obj.jobId = jobId;
        obj.title = title;
        obj.description = description;
        obj.postedDate = postedDate;
        obj.jdDeadline = jdDeadline;
        obj.company = comp;
        obj.salaryRange = salaryRange;
        obj.employmentType = employmentType;
        obj.worktype = worktype;
        obj.location = location;
        obj.city = city;
        obj.state = state;
        obj.country = country;
        obj.ats = ats;
      }
    }
    fs.writeFileSync(path.join(folder,'jobs.json'), JSON.stringify(json,null,2), 'utf8');
  }

  report.companies[company] = {kept: kept.length, excluded: excluded.length, modified: modifiedIds.length, modifiedIds: modifiedIds.slice(0,10), excludedSample: excluded.slice(0,10)};
  report.totals.kept += kept.length;
  report.totals.excluded += excluded.length;
  report.totals.modified += modifiedIds.length;
}

// write report
const reportPath = path.join('D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape','normalization_report.json');
fs.writeFileSync(reportPath, JSON.stringify(report,null,2),'utf8');
console.log('Normalization report written to', reportPath);

// regenerate combined CSV by running existing combine script
try {
  const { execSync } = require('child_process');
  execSync('node "' + COMBINED_SCRIPT.replace(/\\/g,'\\\\') + '"', {stdio: 'inherit', cwd: path.join('D:\\Internship\\MAIN\\UK SCRAPPER')});
} catch (e) {
  console.error('Failed to run combine script', e);
}

console.log('All done.');
