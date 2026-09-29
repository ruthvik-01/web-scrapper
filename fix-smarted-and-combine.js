const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:\\Internship\\MAIN\\UK SCRAPPER\\output\\2026-09-25-main-uk-scrape';

// Fix encoding issues in SmartEd CSV
function fixSmartEdEncoding(content) {
    // Remove BOM if present
    if (content.startsWith('\ufeff')) {
        content = content.slice(1);
    }
    
    // Also handle the weird "ï»¿" BOM artifact
    if (content.startsWith('ï»¿')) {
        content = content.slice(3);
    }
    
    // Fix encoding artifacts
    content = content.replace(/Â£/g, '£');
    content = content.replace(/â€™/g, "'");
    content = content.replace(/â€"/g, '-');
    content = content.replace(/â€"/g, '"');
    content = content.replace(/â€˜/g, "'");
    
    return content;
}

// Parse CSV handling quoted fields
function parseCSV(content) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentLine.push(currentField);
                currentField = '';
            } else if (char === '\r' || char === '\n') {
                if (currentField.length > 0 || currentLine.length > 0) {
                    currentLine.push(currentField);
                    lines.push(currentLine);
                    currentLine = [];
                    currentField = '';
                }
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                currentField += char;
            }
        }
    }
    
    if (currentField.length > 0 || currentLine.length > 0) {
        currentLine.push(currentField);
        lines.push(currentLine);
    }
    
    return lines;
}

// Convert back to CSV string
function toCSV(lines) {
    return lines.map(line => 
        line.map(field => {
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                return '"' + field.replace(/"/g, '""') + '"';
            }
            return field;
        }).join(',')
    ).join('\n');
}

// Main fix and combine function
function fixSmartEdAndCombine() {
    const companyFolders = fs.readdirSync(path.join(OUTPUT_DIR, 'jobs company wise'));
    const allJobs = [];
    let headerAdded = false;
    
    console.log('Processing company folders...');
    
    for (const folder of companyFolders) {
        const csvPath = path.join(OUTPUT_DIR, 'jobs company wise', folder, 'jobs.csv');
        
        if (!fs.existsSync(csvPath)) {
            console.log(`Skipping ${folder} - no jobs.csv`);
            continue;
        }
        
        let content = fs.readFileSync(csvPath, 'utf-8');
        
        // Special handling for SmartEd
        if (folder === 'smart-ed') {
            console.log('Fixing SmartEd encoding...');
            content = fixSmartEdEncoding(content);
            
            // Parse, fix, and re-save SmartEd
            const rows = parseCSV(content);
            const fixedCSV = toCSV(rows);
            fs.writeFileSync(csvPath, fixedCSV, 'utf-8');
            console.log(`SmartEd fixed: ${rows.length - 1} jobs`);
            
            content = fixedCSV;
        }
        
        const rows = parseCSV(content);
        
        if (rows.length === 0) {
            console.log(`Skipping ${folder} - empty file`);
            continue;
        }
        
        // Header
        if (!headerAdded) {
            allJobs.push(rows[0]);
            headerAdded = true;
        }
        
        // Add data rows (skip header)
        const dataRows = rows.slice(1);
        allJobs.push(...dataRows);
        
        console.log(`${folder}: ${dataRows.length} jobs`);
    }
    
    // Write combined CSV
    const combinedPath = path.join(OUTPUT_DIR, 'all_jobs_combined.csv');
    const combinedCSV = toCSV(allJobs);
    fs.writeFileSync(combinedPath, combinedCSV, 'utf-8');
    
    console.log(`\n=== COMBINED FILES ===`);
    console.log(`Total jobs: ${allJobs.length - 1}`);
    console.log(`Output: ${combinedPath}`);
}

fixSmartEdAndCombine();
