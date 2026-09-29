/**
 * Oliver Roberts Ltd - Employer Verification Report
 * 
 * Company: oliver roberts ltd (requested label)
 * Companies House: 10596416
 * SIC: 47770 - Retail sale of watches and jewellery
 * 
 * INVESTIGATION RESULT: BLOCKED - Employer Identity Mismatch
 * 
 * The supplied Companies House URL is NOT a careers board.
 * A related domain (oliver.agency -> oliverinside.ai) was found with a careers
 * page, but the jobs belong to "OLIVER Agency" (marketing/creative agency),
 * NOT "OLIVER ROBERTS LTD" (retail watches/jewellery).
 * 
 * These are completely different companies:
 * - OLIVER ROBERTS LTD: Retail company, Companies House #10596416
 * - OLIVER Agency: Marketing agency, part of The Brandtech Group
 * 
 * Per MAIN_UK_Scrape.md Rule 1: Never relabel another employer's jobs.
 * 
 * Status: BLOCKED pending clarification from Task Lead
 */

import * as fs from 'fs';
import * as path from 'path';

interface EmployerVerification {
  requestedLabel: string;
  companiesHouseNumber: string;
  sicCode: string;
  verifiedCareersSource: boolean;
  blocker: string | null;
}

interface BlockerReport {
  company: string;
  slug: string;
  checkDate: string;
  status: 'BLOCKED';
  blockerType: string;
  investigation: {
    suppliedUrl: string;
    suppliedUrlType: string;
    alternativeSourcesChecked: string[];
    employerMismatch: boolean;
  };
  outputs: {
    jobsCsv: string;
    jobsJson: string;
    sourceReport: string;
    blockerMarkdown: string;
  };
}

async function investigateOliverRobertsLtd(): Promise<BlockerReport> {
  const company = 'oliver roberts ltd';
  const slug = 'oliver-roberts-ltd';
  const outputDir = path.join(__dirname, '../../output/2026-09-25-main-uk-scrape', slug);
  
  console.log('========================================');
  console.log('OLIVER ROBERTS LTD - Employer Verification');
  console.log('========================================');
  console.log(`Requested label: ${company}`);
  console.log(`Companies House: 10596416`);
  console.log(`SIC: 47770 - Retail sale of watches and jewellery`);
  console.log('');
  
  // Investigation findings
  console.log('Investigation Results:');
  console.log('----------------------');
  console.log('1. Supplied URL: Companies House Filing History (NOT a careers board)');
  console.log('2. Found domain: oliver.agency -> redirects to oliverinside.ai');
  console.log('3. Careers page: https://oliverinside.ai/careers');
  console.log('4. ATS: Greenhouse (boards-api.greenhouse.io)');
  console.log('5. Board employer: "OLIVER Agency"');
  console.log('6. Jobs found: 44 total, 22 in UK');
  console.log('');
  
  // Critical finding
  console.log('CRITICAL FINDING: Employer Identity Mismatch');
  console.log('--------------------------------------------');
  console.log('Requested: OLIVER ROBERTS LTD (retail watches/jewellery)');
  console.log('Found: OLIVER Agency (marketing/creative agency)');
  console.log('');
  console.log('These are DIFFERENT companies:');
  console.log('  - Different legal entities');
  console.log('  - Different industries (Retail vs Marketing)');
  console.log('  - Different business models');
  console.log('');
  console.log('Per MAIN_UK_Scrape.md Rule 1:');
  console.log('  "Never relabel another employer\'s jobs to match the spreadsheet row."');
  console.log('');
  
  // Create output files
  console.log('Creating output files...');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Header-only CSV (no jobs to export)
  const csvHeader = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats\n';
  fs.writeFileSync(path.join(outputDir, 'jobs.csv'), csvHeader);
  
  // Empty JSON array
  fs.writeFileSync(path.join(outputDir, 'jobs.json'), '[]');
  
  // Source report
  const sourceReport = {
    company: { slug, requestedLabel: company, companiesHouseNumber: '10596416', sicCode: '47770' },
    investigation: {
      checkDate: '2026-09-25',
      suppliedUrl: 'https://find-and-update.company-information.service.gov.uk/company/10596416/filing-history',
      suppliedUrlType: 'Companies House Filing History (NOT a careers board)',
      alternativeSourcesChecked: [
        {
          domain: 'oliver.agency',
          careersPage: 'https://oliverinside.ai/careers',
          boardEmployer: 'OLIVER Agency',
          ats: 'Greenhouse',
          employerMismatch: true,
          reason: 'Jobs belong to OLIVER Agency (marketing), not OLIVER ROBERTS LTD (retail)'
        }
      ]
    },
    employerVerification: {
      requestedEmployer: 'OLIVER ROBERTS LTD',
      foundEmployer: 'OLIVER Agency',
      verifiedMatch: false,
      differentLegalEntities: true,
      blocked: true,
      blockReason: 'Employer identity mismatch'
    },
    counts: { listingLinksFound: 0, exported: 0, excluded: 0, unresolved: 0, blocked: 1 },
    status: 'BLOCKED',
    blockerType: 'Employer Identity Mismatch'
  };
  fs.writeFileSync(path.join(outputDir, 'source-report.json'), JSON.stringify(sourceReport, null, 2));
  
  // Blocker markdown
  const blockerMd = `# BLOCKER: Employer Identity Mismatch - OLIVER ROBERTS LTD

## Status: BLOCKED

**Blocker Type:** Employer Identity Mismatch  
**Unblock Owner:** Task Lead  
**Check Date:** 2026-09-25

## Summary

The requested company "oliver roberts ltd" (Companies House #10596416) is a **retail watch/jewellery** business. The supplied URL is a Companies House filing-history page, not a careers board.

A related domain (oliver.agency) was found with active careers listings, but the jobs belong to "**OLIVER Agency**" (a marketing/creative agency, part of Brandtech Group), which is a completely different company.

## Employer Verification

| Field | Requested | Found | Match? |
|-------|-----------|-------|--------|
| Name | OLIVER ROBERTS LTD | OLIVER Agency | **NO** |
| Industry | Retail (watches/jewellery) | Marketing/Creative | **NO** |
| SIC | 47770 | N/A | **NO** |

## Why Blocked

Per MAIN_UK_Scrape.md Rule 1: "Never relabel another employer's jobs to match the spreadsheet row."

The 22 UK jobs found on oliverinside.ai/careers CANNOT be attributed to OLIVER ROBERTS LTD.

## Resolution Required

Task Lead must clarify:
1. Is the intended company OLIVER ROBERTS LTD (retail)? If yes, NO valid careers source found.
2. Is the intended company OLIVER Agency (marketing)? If yes, update company metadata.

## Evidence

- Companies House: https://find-and-update.company-information.service.gov.uk/company/10596416
- Wrong employer's careers: https://oliverinside.ai/careers (belongs to OLIVER Agency)
`;
  fs.writeFileSync(path.join(outputDir, 'BLOCKER.md'), blockerMd);
  
  console.log('Output files created:');
  console.log(`  - ${outputDir}/jobs.csv (header only)`);
  console.log(`  - ${outputDir}/jobs.json (empty array)`);
  console.log(`  - ${outputDir}/source-report.json`);
  console.log(`  - ${outputDir}/BLOCKER.md`);
  console.log('');
  console.log('STATUS: BLOCKED - Employer Identity Mismatch');
  console.log('Waiting for clarification from Task Lead.');
  console.log('');
  
  return {
    company,
    slug,
    checkDate: '2026-09-25',
    status: 'BLOCKED',
    blockerType: 'Employer Identity Mismatch',
    investigation: {
      suppliedUrl: 'https://find-and-update.company-information.service.gov.uk/company/10596416/filing-history',
      suppliedUrlType: 'Companies House Filing History',
      alternativeSourcesChecked: ['oliverinside.ai/careers'],
      employerMismatch: true
    },
    outputs: {
      jobsCsv: path.join(outputDir, 'jobs.csv'),
      jobsJson: path.join(outputDir, 'jobs.json'),
      sourceReport: path.join(outputDir, 'source-report.json'),
      blockerMarkdown: path.join(outputDir, 'BLOCKER.md')
    }
  };
}

// Run investigation
if (require.main === module) {
  investigateOliverRobertsLtd()
    .then(report => {
      console.log('Investigation complete.');
      console.log(JSON.stringify(report, null, 2));
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

export { investigateOliverRobertsLtd, BlockerReport };
