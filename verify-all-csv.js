const fs = require('fs');
const path = require('path');

const BASE_PATH = 'D:\\\\Internship\\\\MAIN\\\\UK SCRAPPER\\\\output\\\\2026-09-25-main-uk-scrape\\\\jobs company wise';

// Expected 15 columns in correct order
const EXPECTED_COLUMNS = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline', 'company', 'salaryRange', 'employmentType', 'worktype', 'location', 'city', 'state', 'country', 'ats'];

// UK cities for location validation
const UK_CITIES = ['london', 'birmingham', 'manchester', 'leeds', 'bristol', 'liverpool', 
                   'glasgow', 'edinburgh', 'sheffield', 'newcastle', 'nottingham', 'leicester',
                   'southampton', 'reading', 'brighton', 'cardiff', 'belfast', 'oxford', 
                   'cambridge', 'york', 'bath', 'exeter', 'plymouth', 'coventry', 'bolton',
                   'worcester', 'hereford', 'oldbury', 'nottinghamshire', 'bedfordshire',
                   'middlesex', 'surrey', 'kent', 'essex', 'hertfordshire', 'buckinghamshire',
                   'berkshire', 'hampshire', 'sussex', 'suffolk', 'norfolk', 'cornwall'];

function parseCSV(content) {
    const lines = content.split('\\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    
    // Parse header
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            rows.push(parseCSVLine(lines[i]));
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
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
}

function validateJob(row, headers, companyName) {
    const errors = [];
    const warnings = [];
    
    // Create object from row
    const job = {};
    headers.forEach((h, i) => {
        job[h] = row[i] || '';
    });
    
    // 1. Check column count
    if (headers.length !== 15) {
        errors.push(`❌ COLUMN COUNT: Expected 15 columns, got ${headers.length}`);
    }
    
    // 2. Validate JobId
    if (!job.jobId) {
        errors.push(`❌ MISSING JobId`);
    } else if (job.jobId.length > 50) {
        errors.push(`❌ JobId too long: "${job.jobId.substring(0, 30)}..."`);
    } else if (job.jobId.includes('-') && job.jobId.match(/^[A-Z]{2,3}-[a-f0-9]{6,}/i)) {
        errors.push(`❌ SYNTHETIC JobId: "${job.jobId}" - must extract from URL`);
    } else if (job.jobUrl && !job.jobUrl.includes(job.jobId)) {
        // Check if JobId exists in URL (be lenient with partial matches)
        const urlLower = job.jobUrl.toLowerCase();
        const jobIdLower = job.jobId.toLowerCase();
        if (!urlLower.includes(jobIdLower)) {
            warnings.push(`⚠️ JobId "${job.jobId}" not found in URL`);
        }
    }
    
    // 3. Validate Salary Range (must NOT contain time-based rates)
    if (job.salaryRange) {
        const lower = job.salaryRange.toLowerCase();
        if (lower.includes('per day') || lower.includes(' per day')) {
            errors.push(`❌ SALARY RANGE contains "per day": "${job.salaryRange}" - move to description`);
        }
        if (lower.includes('per hour') || lower.includes(' per hour')) {
            errors.push(`❌ SALARY RANGE contains "per hour": "${job.salaryRange}" - move to description`);
        }
        if (lower.includes('per week') || lower.includes(' per week')) {
            errors.push(`❌ SALARY RANGE contains "per week": "${job.salaryRange}" - move to description`);
        }
        if (lower.includes('daily') || lower.includes('hourly')) {
            errors.push(`❌ SALARY RANGE contains time-based keyword: "${job.salaryRange}" - move to description`);
        }
    }
    
    // 4. Validate Location
    if (!job.location || job.location.trim() === '') {
        warnings.push(`⚠️ EMPTY location - should extract from description/URL`);
    } else {
        // Check if it's a valid location
        const locLower = job.location.toLowerCase();
        const isValidLocation = UK_CITIES.some(city => locLower.includes(city));
        if (!isValidLocation && job.location.length < 3) {
            warnings.push(`⚠️ SUSPICIOUS location: "${job.location}"`);
        }
    }
    
    // 5. Validate ATS field
    if (!job.ats) {
        errors.push(`❌ MISSING ATS field`);
    } else if (job.ats === job.company) {
        errors.push(`❌ ATS equals company name: "${job.ats}" - should be platform name or "Custom"`);
    } else if (!['Custom', 'HiBob', 'InHouse', 'JobTracks', 'JobAdder', 'eRecruit', 'JobPage'].includes(job.ats)) {
        warnings.push(`⚠️ UNUSUAL ATS value: "${job.ats}"`);
    }
    
    // 6. Validate required fields
    if (!job.title || job.title.length < 5) {
        errors.push(`❌ INVALID title: "${job.title}"`);
    }
    if (!job.jobUrl) {
        errors.push(`❌ MISSING jobUrl`);
    }
    if (!job.description || job.description.length < 50) {
        warnings.push(`⚠️ SHORT description (${job.description ? job.description.length : 0} chars)`);
    }
    
    return { errors, warnings, job };
}

function validateCSVFile(csvPath) {
    try {
        const content = fs.readFileSync(csvPath, 'utf8');
        const { headers, rows } = parseCSV(content);
        
        const companyName = path.basename(path.dirname(csvPath));
        
        const results = {
            company: companyName,
            file: path.basename(csvPath),
            totalJobs: rows.length,
            validJobs: 0,
            errors: [],
            warnings: [],
            sampleErrors: []
        };
        
        if (rows.length === 0) {
            results.errors.push('❌ NO JOBS in CSV file');
            return results;
        }
        
        // Validate each job
        rows.forEach((row, i) => {
            const validation = validateJob(row, headers, companyName);
            
            if (validation.errors.length === 0) {
                results.validJobs++;
            } else {
                // Store sample errors (first 3 only)
                if (results.sampleErrors.length < 3) {
                    results.sampleErrors.push({
                        jobId: validation.job.jobId || `row ${i + 1}`,
                        title: validation.job.title ? validation.job.title.substring(0, 50) : 'N/A',
                        errors: validation.errors
                    });
                }
            }
            
            validation.errors.forEach(e => {
                if (!results.errors.includes(e)) {
                    results.errors.push(e);
                }
            });
            
            validation.warnings.forEach(w => {
                if (!results.warnings.includes(w)) {
                    results.warnings.push(w);
                }
            });
        });
        
        // Calculate quality score
        results.qualityScore = rows.length > 0 ? ((results.validJobs / rows.length) * 100).toFixed(2) : 0;
        
        return results;
    } catch (err) {
        return {
            company: path.basename(path.dirname(csvPath)),
            file: path.basename(csvPath),
            error: `Failed to parse: ${err.message}`
        };
    }
}

// Main execution
console.log('='.repeat(80));
console.log('UK JOB SCRAPING - CSV VERIFICATION REPORT');
console.log('Date:', new Date().toISOString().split('T')[0]);
console.log('='.repeat(80));
console.log('');

// Find all CSV files
const companies = fs.readdirSync(BASE_PATH).filter(f => {
    const stat = fs.statSync(path.join(BASE_PATH, f));
    return stat.isDirectory();
});

const allResults = [];

companies.forEach(company => {
    const companyPath = path.join(BASE_PATH, company);
    const csvFiles = fs.readdirSync(companyPath).filter(f => f.endsWith('.csv'));
    
    csvFiles.forEach(csvFile => {
        const csvPath = path.join(companyPath, csvFile);
        const result = validateCSVFile(csvPath);
        allResults.push(result);
    });
});

// Print summary
console.log('📊 SUMMARY BY COMPANY');
console.log('-'.repeat(80));

let totalJobs = 0;
let totalValid = 0;
let companiesWithIssues = [];

allResults.forEach(result => {
    if (result.error) {
        console.log(`\n❌ ${result.company}/${result.file}: ${result.error}`);
        return;
    }
    
    totalJobs += result.totalJobs || 0;
    totalValid += result.validJobs || 0;
    
    const status = result.qualityScore >= 95 ? '✅' : result.qualityScore >= 80 ? '⚠️' : '❌';
    console.log(`${status} ${result.company.padEnd(30)} | Jobs: ${(result.totalJobs || 0).toString().padStart(5)} | Valid: ${(result.validJobs || 0).toString().padStart(5)} | Quality: ${result.qualityScore}%`);
    
    if (result.errors.length > 0 || result.warnings.length > 0) {
        companiesWithIssues.push(result);
    }
});

console.log('');
console.log('='.repeat(80));
console.log(`📈 TOTALS: ${totalJobs} jobs | ${totalValid} valid | Overall Quality: ${totalJobs > 0 ? ((totalValid/totalJobs)*100).toFixed(2) : 0}%`);
console.log('='.repeat(80));

// Detailed issues
if (companiesWithIssues.length > 0) {
    console.log('');
    console.log('🔍 DETAILED ISSUES');
    console.log('-'.repeat(80));
    
    companiesWithIssues.forEach(result => {
        if (result.sampleErrors && result.sampleErrors.length > 0) {
            console.log('');
            console.log(`📌 ${result.company} (${result.sampleErrors.length} sample issues):`);
            result.sampleErrors.forEach((sample, i) => {
                console.log(`  ${i + 1}. JobId: ${sample.jobId}`);
                console.log(`     Title: ${sample.title}`);
                sample.errors.forEach(e => console.log(`     ${e}`));
            });
        }
        
        if (result.errors.length > 0) {
            console.log('');
            console.log(`  Total unique errors: ${result.errors.length}`);
        }
        
        if (result.warnings.length > 0) {
            console.log(`  Total warnings: ${result.warnings.length}`);
            result.warnings.slice(0, 3).forEach(w => console.log(`    ${w}`));
        }
    });
}

console.log('');
console.log('✅ Verification Complete');
