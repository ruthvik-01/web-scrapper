const fs = require('fs');
const path = require('path');

const baseDir = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape\\jobs company wise';
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

const REQUIRED_COLUMNS = ['jobId', 'title', 'description', 'jobUrl', 'postedDate', 'jdDeadline', 'company', 'salaryRange', 'employmentType', 'worktype', 'location', 'city', 'state', 'country', 'ats'];

const issues = [];
const stats = [];

console.log('=== CSV VALIDATION REPORT ===\n');

for (const company of companies) {
    const csvPath = path.join(baseDir, company, 'jobs.csv');
    
    try {
        if (!fs.existsSync(csvPath)) {
            issues.push(`${company}: CSV file not found`);
            continue;
        }
        
        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        
        if (lines.length === 0) {
            issues.push(`${company}: Empty CSV file`);
            continue;
        }
        
        // Check header
        const headerLine = lines[0];
        const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
        
        // Check column count
        if (headers.length !== 15) {
            issues.push(`${company}: Wrong column count (${headers.length}, expected 15)`);
        }
        
        // Check column order
        const columnCheck = [];
        REQUIRED_COLUMNS.forEach((col, i) => {
            if (headers[i] !== col) {
                columnCheck.push(`Column ${i}: got "${headers[i]}", expected "${col}"`);
            }
        });
        
        if (columnCheck.length > 0) {
            issues.push(`${company}: Column order mismatch\n    ${columnCheck.join('\n    ')}`);
        }
        
        // Check encoding artifacts
        const encodingIssues = [];
        if (content.includes('Â£')) encodingIssues.push('Â£ found');
        if (content.includes('â€™')) encodingIssues.push('â€™ found');
        if (content.includes('â€')) encodingIssues.push('â€ found');
        if (content.includes('â€“')) encodingIssues.push('â€“ found');
        
        if (encodingIssues.length > 0) {
            issues.push(`${company}: Encoding artifacts: ${encodingIssues.join(', ')}`);
        }
        
        // Check data rows
        const dataLines = lines.slice(1);
        let emptyDescriptions = 0;
        let emptyJobIds = 0;
        let validSalaries = 0;
        let dailyInSalary = 0;
        
        for (const line of dataLines) {
            // Simple CSV parse (handles most cases)
            const fields = line.match(/("([^"]*)"|[^,]*)/g) || [];
            const cleanFields = fields.map(f => f.replace(/^"|"$/g, ''));
            
            if (cleanFields[2] === '' || cleanFields[2] === undefined) emptyDescriptions++;
            if (cleanFields[0] === '' || cleanFields[0] === undefined) emptyJobIds++;
            
            const salary = cleanFields[7] || '';
            if (salary && !salary.toLowerCase().includes('per day') && !salary.toLowerCase().includes('per hour')) {
                validSalaries++;
            }
            if (salary.toLowerCase().includes('per day') || salary.toLowerCase().includes('per hour')) {
                dailyInSalary++;
            }
        }
        
        stats.push({
            company,
            total: dataLines.length,
            emptyDesc: emptyDescriptions,
            emptyJobId: emptyJobIds,
            validSalaries,
            dailyInSalary
        });
        
    } catch (err) {
        issues.push(`${company}: Error reading file - ${err.message}`);
    }
}

// Print results
console.log('--- STATS PER COMPANY ---\n');
for (const s of stats) {
    console.log(`${s.company}:`);
    console.log(`  Total jobs: ${s.total}`);
    console.log(`  Empty descriptions: ${s.emptyDesc}`);
    console.log(`  Empty JobIds: ${s.emptyJobId}`);
    console.log(`  Valid salaries (annual): ${s.validSalaries}`);
    if (s.dailyInSalary > 0) {
        console.log(`  ⚠️ Daily rates in salaryRange: ${s.dailyInSalary}`);
    }
    console.log('');
}

if (issues.length > 0) {
    console.log('\n--- ISSUES FOUND ---\n');
    for (const issue of issues) {
        console.log(`❌ ${issue}`);
    }
} else {
    console.log('\n✅ NO ISSUES FOUND - All CSVs validated successfully!\n');
}

console.log('\n--- SUMMARY ---');
console.log(`Companies checked: ${companies.length}`);
console.log(`Issues found: ${issues.length}`);
