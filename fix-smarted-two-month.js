const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise';
const COMBINED_OUTPUT = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\all_jobs_combined.csv';

// Scrape date: 2026-09-25
// Two-month window: jobs posted AFTER 2026-07-25
const CUTOFF_DATE = new Date('2026-07-25');

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Handle DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  // Try standard format
  return new Date(dateStr);
}

function isWithinWindow(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return true; // Keep if no date (can't filter)
  return date >= CUTOFF_DATE;
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  // Remove BOM if present
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }
  // Also remove ï»¿ BOM artifact
  if (headerLine.startsWith('ï»¿')) {
    headerLine = headerLine.slice(3);
  }
  
  const headers = parseCSVLine(headerLine);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length === headers.length) {
      rows.push(row);
    }
  }
  
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

function encodeCSVRow(row) {
  return row.map(field => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }).join(',');
}

// Process SmartEd with 2-month filter
console.log('Processing SmartEd with 2-month window filter...');
const smartEdPath = path.join(OUTPUT_DIR, 'smart-ed', 'jobs.csv');
const smartEdContent = fs.readFileSync(smartEdPath, 'utf8');
const { headers, rows } = parseCSV(smartEdContent);

// Find postedDate column index
const postedDateIdx = headers.indexOf('postedDate');
console.log(`PostedDate column index: ${postedDateIdx}`);

const filteredRows = [];
let rejected = 0;

for (const row of rows) {
  const postedDate = row[postedDateIdx];
  if (isWithinWindow(postedDate)) {
    filteredRows.push(row);
  } else {
    rejected++;
    console.log(`  REJECTED: ${row[0]} - Posted: ${postedDate} (before ${CUTOFF_DATE.toISOString().split('T')[0]})`);
  }
}

console.log(`SmartEd: ${rows.length} total, ${filteredRows.length} kept, ${rejected} rejected (before ${CUTOFF_DATE.toISOString().split('T')[0]})`);

// Write filtered SmartEd CSV
const smartEdFiltered = [headers, ...filteredRows].map(encodeCSVRow).join('\n');
fs.writeFileSync(smartEdPath, '\uFEFF' + smartEdFiltered, 'utf8');
console.log(`SmartEd CSV updated: ${path.join(OUTPUT_DIR, 'smart-ed', 'jobs.csv')}`);

// Now combine all companies
const companies = [
  'fusion-people',
  'london-academy-for-applied-technology',
  'mcginnis-loy',
  'morgan-law',
  'morson',
  'new-appointments-group',
  'paysafe',
  'sellick-partnership',
  'sjc-partners',
  'smart-ed',
  'stannah'
];

const allJobs = [];
const header = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';

console.log('\nProcessing company folders...');

for (const company of companies) {
  const csvPath = path.join(OUTPUT_DIR, company, 'jobs.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log(`${company}: CSV not found`);
    continue;
  }
  
  const content = fs.readFileSync(csvPath, 'utf8');
  const { rows } = parseCSV(content);
  
  console.log(`${company}: ${rows.length} jobs`);
  allJobs.push(...rows);
}

console.log(`\n=== COMBINED FILES ===`);
console.log(`Total jobs: ${allJobs.length}`);

// Write combined CSV with BOM
const combinedContent = [header, ...allJobs.map(encodeCSVRow)].join('\n');
fs.writeFileSync(COMBINED_OUTPUT, '\uFEFF' + combinedContent, 'utf8');
console.log(`Output: ${COMBINED_OUTPUT}`);
console.log('\nDone!');
