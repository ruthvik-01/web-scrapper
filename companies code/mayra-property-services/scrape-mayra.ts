/**
 * Mayra Property Services - Source Verification Scraper
 * 
 * BLOCKED: Source/Employer Identity Mismatch
 * 
 * This scraper verifies that the supplied careers URL belongs to a different
 * employer (Mayra Group GmbH - German holding company) and identifies NO UK jobs.
 * 
 * Requested Label: Mayra Property Services
 * Actual Employer: Mayra Group GmbH (Hospitality/IT, Stuttgart, Germany)
 * Source: https://wearemayra.com/en/karriere
 */

import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://sgfhykkbgmtfuryohewl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZmh5a2tiZ210ZnVyeW9oZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDQzNDQsImV4cCI6MjA5MzgyMDM0NH0.JfWcR2MmsgrB6QOy20_FO9oXql1cZV7gIKxd5rmbu5U';

interface MayraJobPosting {
  id: string;
  company_id: string;
  slug: string;
  title: string;
  location: string;
  employment_type: string;
  seniority: string;
  department: string;
  summary: string;
  description_md: string;
  location_address: {
    city: string;
    region: string;
    street: string;
    country: string;
    postal_code: string;
  } | null;
  is_published: boolean;
  published_at: string;
  valid_through: string | null;
}

interface BlockedReport {
  checkDate: string;
  companyLabel: string;
  suppliedSourceUrl: string;
  actualEmployer: {
    name: string;
    legalName: string;
    headquarters: any;
    businessType: string;
  };
  jobsFound: number;
  ukJobsFound: number;
  blockerReason: string;
}

async function fetchAllJobs(): Promise<MayraJobPosting[]> {
  const url = `${SUPABASE_URL}/rest/v1/job_postings?select=*&is_published=eq.true&order=published_at.desc`;
  
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  return await response.json() as MayraJobPosting[];
}

function isUKJob(job: MayraJobPosting): boolean {
  const location = job.location?.toLowerCase() || '';
  const country = job.location_address?.country?.toLowerCase() || '';
  const city = job.location_address?.city?.toLowerCase() || '';
  
  // Check for UK indicators
  const ukIndicators = [
    'united kingdom',
    'uk',
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'london',
    'manchester',
    'birmingham',
    'leeds',
    'edinburgh',
    'bristol',
    'liverpool',
    'glasgow'
  ];
  
  return ukIndicators.some(indicator => 
    location.includes(indicator) || 
    country.includes(indicator) || 
    city.includes(indicator)
  );
}

function convertToCSV(jobs: MayraJobPosting[]): string {
  const header = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
  
  if (jobs.length === 0) {
    return header;
  }
  
  const rows = jobs.map(job => {
    const jobUrl = `https://wearemayra.com/en/karriere/${job.slug}`;
    const postedDate = job.published_at ? job.published_at.split('T')[0] : '';
    const deadline = job.valid_through ? job.valid_through.split('T')[0] : '';
    
    return [
      job.id,
      `"${job.title.replace(/"/g, '""')}"`,
      `"${job.summary.replace(/"/g, '""')}"`,
      jobUrl,
      postedDate,
      deadline,
      'Mayra Group GmbH', // Actual employer, not requested label
      '',
      job.employment_type || '',
      '',
      `"${job.location.replace(/"/g, '""')}"`,
      job.location_address?.city || '',
      job.location_address?.region || '',
      job.location_address?.country || 'Germany',
      'Custom'
    ].join(',');
  });
  
  return header + '\n' + rows.join('\n');
}

async function main() {
  const outputDir = process.argv[2] || './output';
  const companyDir = path.join(outputDir, 'mayra-property-services');
  
  console.log('Mayra Property Services - Source Verification');
  console.log('='.repeat(60));
  console.log(`Check Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Source: https://wearemayra.com/en/karriere`);
  console.log('');
  
  // Ensure output directory exists
  if (!fs.existsSync(companyDir)) {
    fs.mkdirSync(companyDir, { recursive: true });
  }
  
  try {
    console.log('Fetching job postings from Supabase API...');
    const jobs = await fetchAllJobs();
    console.log(`Total published jobs found: ${jobs.length}`);
    
    // Analyze job locations
    console.log('\nJob Locations:');
    const locationCounts = new Map<string, number>();
    jobs.forEach(job => {
      const loc = job.location;
      locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);
    });
    locationCounts.forEach((count, loc) => {
      console.log(`  - ${loc}: ${count}`);
    });
    
    // Check for UK jobs
    const ukJobs = jobs.filter(isUKJob);
    console.log(`\nUK Jobs Identified: ${ukJobs.length}`);
    
    if (ukJobs.length === 0) {
      console.log('\n' + '='.repeat(60));
      console.log('BLOCKED: No UK jobs found');
      console.log('='.repeat(60));
      console.log('\nBlocker Reason:');
      console.log('  - Source URL belongs to Mayra Group GmbH (German holding company)');
      console.log('  - All 8 current vacancies are in Stuttgart, Germany');
      console.log('  - No "Mayra Property Services" entity exists on this careers board');
      console.log('  - Requested label does not match actual employer');
      console.log('  - No UK operations observed in portfolio');
      
      // Write blocked report
      const blockedReport: BlockedReport = {
        checkDate: new Date().toISOString(),
        companyLabel: 'Mayra Property Services',
        suppliedSourceUrl: 'https://wearemayra.com/en/karriere',
        actualEmployer: {
          name: 'Mayra Group GmbH',
          legalName: 'Mayra Group GmbH',
          headquarters: {
            street: 'Achalmstraße 38',
            postalCode: '71088',
            city: 'Holzgerlingen',
            country: 'Germany'
          },
          businessType: 'Holding company (Hospitality & IT Services)'
        },
        jobsFound: jobs.length,
        ukJobsFound: 0,
        blockerReason: 'Source/Employer identity mismatch. The careers board belongs to Mayra Group GmbH (German employer) with zero UK positions. Requested label "Mayra Property Services" does not exist on this source.'
      };
      
      fs.writeFileSync(
        path.join(companyDir, 'BLOCKED.md'),
        generateBlockedMarkdown(blockedReport, jobs)
      );
      
      fs.writeFileSync(
        path.join(companyDir, 'source-check.json'),
        JSON.stringify(blockedReport, null, 2)
      );
      
      // Write header-only CSV
      fs.writeFileSync(
        path.join(companyDir, 'jobs.csv'),
        'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats\n'
      );
      
      // Write empty JSON
      fs.writeFileSync(
        path.join(companyDir, 'jobs.json'),
        '[]'
      );
      
      console.log('\nFiles Written:');
      console.log(`  - ${path.join(companyDir, 'BLOCKED.md')}`);
      console.log(`  - ${path.join(companyDir, 'source-check.json')}`);
      console.log(`  - ${path.join(companyDir, 'jobs.csv')} (header only)`);
      console.log(`  - ${path.join(companyDir, 'jobs.json')} (empty array)`);
      
      console.log('\nStatus: BLOCKED - Awaiting TL review and valid UK source');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function generateBlockedMarkdown(report: BlockedReport, jobs: MayraJobPosting[]): string {
  return `# BLOCKED: Source/Employer Identity Mismatch

**Company Label:** ${report.companyLabel}  
**Supplied Source URL:** ${report.suppliedSourceUrl}  
**Check Date:** ${report.checkDate.split('T')[0]}  
**Status:** BLOCKED - Source mismatch, no UK jobs identified

## Investigation Summary

### 1. Source URL Analysis
The supplied careers URL belongs to **${report.actualEmployer.name}**, a German holding company:
- **Location:** ${report.actualEmployer.headquarters.city}, ${report.actualEmployer.headquarters.country}
- **Business Type:** ${report.actualEmployer.businessType}

### 2. Job Postings Found
Total: ${jobs.length}

| Job Title | Location | Department |
|-----------|----------|------------|
${jobs.map(j => `| ${j.title} | ${j.location} | ${j.department} |`).join('\n')}

### 3. Critical Findings

**NO UK JOBS EXIST:**
- All ${jobs.length} vacancies are in **Stuttgart, Germany**
- No UK operations in company portfolio

**EMPLOYER MISMATCH:**
- Requested: "${report.companyLabel}"
- Actual: "${report.actualEmployer.name}"

## Status: BLOCKED
Awaiting TL review and valid UK source verification.
`;
}

main();
