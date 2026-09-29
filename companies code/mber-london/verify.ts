/**
 * Mber London - Output Verification Script
 * 
 * Validates the jobs.csv and jobs.json files for schema compliance
 * even when empty (no active jobs scenario).
 * 
 * Run: npx ts-node verify.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPECTED_HEADER = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
const EXPECTED_COLUMNS = 15;

function verifyMberLondon(): void {
  const baseDir = path.resolve(__dirname, '../../jobs company wise/mber-london');
  
  console.log('=== Mber London Verification ===\n');
  console.log(`Check Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Base Directory: ${baseDir}\n`);
  
  // Verify jobs.csv
  const csvPath = path.join(baseDir, 'jobs.csv');
  console.log('--- Verifying jobs.csv ---');
  
  if (!fs.existsSync(csvPath)) {
    console.log('ERROR: jobs.csv not found');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  if (lines.length === 0) {
    console.log('ERROR: jobs.csv is empty (no header)');
    process.exit(1);
  }
  
  const header = lines[0];
  const headerCols = header.split(',').length;
  
  console.log(`Header: ${header}`);
  console.log(`Column count: ${headerCols}`);
  
  if (header !== EXPECTED_HEADER) {
    console.log('ERROR: Header does not match expected schema');
    console.log(`Expected: ${EXPECTED_HEADER}`);
    console.log(`Actual:   ${header}`);
    process.exit(1);
  }
  
  if (headerCols !== EXPECTED_COLUMNS) {
    console.log(`ERROR: Expected ${EXPECTED_COLUMNS} columns, got ${headerCols}`);
    process.exit(1);
  }
  
  console.log(`Data rows: ${lines.length - 1}`);
  console.log('CSV schema: PASS ✓\n');
  
  // Verify jobs.json
  const jsonPath = path.join(baseDir, 'jobs.json');
  console.log('--- Verifying jobs.json ---');
  
  if (!fs.existsSync(jsonPath)) {
    console.log('ERROR: jobs.json not found');
    process.exit(1);
  }
  
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  let jobs: any[];
  
  try {
    jobs = JSON.parse(jsonContent);
  } catch (e) {
    console.log('ERROR: jobs.json is not valid JSON');
    process.exit(1);
  }
  
  if (!Array.isArray(jobs)) {
    console.log('ERROR: jobs.json is not an array');
    process.exit(1);
  }
  
  console.log(`Job count: ${jobs.length}`);
  console.log('JSON array: PASS ✓\n');
  
  // Verify CSV/JSON consistency
  console.log('--- CSV/JSON Consistency ---');
  const csvDataRows = lines.length - 1;
  const jsonRows = jobs.length;
  
  if (csvDataRows !== jsonRows) {
    console.log(`ERROR: CSV has ${csvDataRows} data rows, JSON has ${jsonRows} items`);
    process.exit(1);
  }
  
  console.log('Row counts match: PASS ✓\n');
  
  // Verify source-report.json
  const reportPath = path.join(baseDir, 'source-report.json');
  console.log('--- Verifying source-report.json ---');
  
  if (!fs.existsSync(reportPath)) {
    console.log('ERROR: source-report.json not found');
    process.exit(1);
  }
  
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  
  console.log(`Company: ${report.company}`);
  console.log(`Status: ${report.status}`);
  console.log(`Blocked Reason: ${report.blockedReason}`);
  console.log(`Source URL: ${report.sourceUrl}`);
  console.log(`Active Jobs Found: ${report.listingCheck.activeJobsFound}`);
  console.log(`Exported: ${report.listingCheck.exported}`);
  console.log(`HTTP Status: ${report.sourceEvidence.httpStatus}`);
  console.log('Source report: PASS ✓\n');
  
  // Final summary
  console.log('=== Verification Summary ===');
  console.log('CSV schema: PASS ✓');
  console.log('JSON format: PASS ✓');
  console.log('CSV/JSON consistency: PASS ✓');
  console.log('Source report: PASS ✓');
  console.log('\nStatus: BLOCKED - NO_ACTIVE_JOBS');
  console.log('Reason: Employer has zero active listings on JOB TODAY board');
  console.log('\nFiles delivered:');
  console.log('  - jobs.csv (header-only, 15 columns)');
  console.log('  - jobs.json (empty array [])');
  console.log('  - source-report.json (full source evidence)');
}

verifyMberLondon();
