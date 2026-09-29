"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cheerio = __importStar(require("cheerio"));
// Required 15-column CSV header
const CSV_HEADER = 'jobId,title,description,jobUrl,postedDate,jdDeadline,company,salaryRange,employmentType,worktype,location,city,state,country,ats';
// Two-month cutoff: 25 July 2026
const CUTOFF_DATE = new Date('2026-07-25');
function escapeCSV(field) {
    if (!field)
        return '';
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
}
function jobToCSVRow(job) {
    return [
        escapeCSV(job.jobId),
        escapeCSV(job.title),
        escapeCSV(job.description),
        escapeCSV(job.jobUrl),
        escapeCSV(job.postedDate),
        escapeCSV(job.jdDeadline),
        escapeCSV(job.company),
        escapeCSV(job.salaryRange),
        escapeCSV(job.employmentType),
        escapeCSV(job.worktype),
        escapeCSV(job.location),
        escapeCSV(job.city),
        escapeCSV(job.state),
        escapeCSV(job.country),
        escapeCSV(job.ats)
    ].join(',');
}
// Parse LAAT (Zoho Recruit) - Has structured JSON in HTML
function parseLAAT(htmlPath) {
    const jobs = [];
    const html = fs.readFileSync(htmlPath, 'utf-8');
    // Find the JSON data in the hidden input field
    const jobDataMatch = html.match(/value="\[({[\s\S]*?"Remote_Job"[\s\S]*?})\]"/);
    if (!jobDataMatch) {
        console.log('LAAT: No job data found in expected format');
        return jobs;
    }
    // Parse the JSON data
    try {
        // Find the actual job array
        const jobsArrayMatch = html.match(/\[\{[^"]*"Posting_Title"[^\]]*\]/g);
        if (jobsArrayMatch) {
            // Manually extract job objects
            const jobObjects = html.match(/\{"Remote_Job"[^}]*"Publish":false[^}]*\}/g);
            // Try to extract structured data from the HTML
            let currentPos = 0;
            const postingTitlePattern = /"Posting_Title":"([^"]+)"/g;
            const cityPattern = /"City":"([^"]+)"/g;
            const countryPattern = /"Country":"([^"]+)"/g;
            const jobTypePattern = /"Job_Type":"([^"]+)"/g;
            const datePattern = /"Date_Opened":"([^"]+)"/g;
            const expPattern = /"Work_Experience":"([^"]+)"/g;
            const industryPattern = /"Industry":"([^"]+)"/g;
            // Extract from the full HTML content
            const sections = html.split('{');
            let job = {};
            let inJobObject = false;
            // Simple extraction by finding key patterns
            const postTitles = [...html.matchAll(/"Posting_Title":"([^"]+)"/g)];
            const cities = [...html.matchAll(/"City":"([^"]+)"/g)];
            const countries = [...html.matchAll(/"Country":"([^"]+)"/g)];
            const jobTypes = [...html.matchAll(/"Job_Type":"([^"]+)"/g)];
            const dates = [...html.matchAll(/"Date_Opened":"([^"]+)"/g)];
            const experiences = [...html.matchAll(/"Work_Experience":"([^"]+)"/g)];
            const industries = [...html.matchAll(/"Industry":"([^"]+)"/g)];
            const jobDescriptions = [...html.matchAll(/"Job_Description":"([^"]+)"/g)];
            // Number of jobs = number of Posting_Title matches
            const numJobs = postTitles.length;
            for (let i = 0; i < numJobs; i++) {
                const title = postTitles[i]?.[1] || '';
                const city = cities[i]?.[1] || '';
                const country = countries[i]?.[1] || '';
                const jobType = jobTypes[i]?.[1] || '';
                const dateOpened = dates[i]?.[1] || '';
                const description = jobDescriptions[i]?.[1]?.replace(/\\n/g, '\n').replace(/\\u[\dA-Fa-f]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16))) || '';
                // Skip if posting date is before cutoff
                if (dateOpened) {
                    const posted = new Date(dateOpened);
                    if (posted < CUTOFF_DATE) {
                        console.log(`LAAT: Skipping ${title} - posted ${dateOpened} before cutoff`);
                        continue;
                    }
                }
                jobs.push({
                    jobId: `LAAT-${i + 1}`,
                    title: title,
                    description: description.substring(0, 5000), // Limit description length
                    jobUrl: 'https://laat.zohorecruit.eu/jobs/Careers',
                    postedDate: dateOpened,
                    jdDeadline: '',
                    company: 'London Academy for Applied Technology',
                    salaryRange: '',
                    employmentType: jobType,
                    worktype: '',
                    location: city,
                    city: city,
                    state: 'London',
                    country: 'United Kingdom',
                    ats: 'Custom'
                });
            }
        }
    }
    catch (error) {
        console.error('LAAT parsing error:', error);
    }
    return jobs;
}
// Parse The Independent School (Finalsite CMS)
function parseIndependentSchool(htmlPath) {
    const jobs = [];
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const $ = cheerio.load(html);
    // Job 1: Co-Lead Teacher
    const coLeadDesc = $('section#fsEl_6748 .fsElementContent').text().trim();
    if (coLeadDesc) {
        jobs.push({
            jobId: 'TIS-ELC-1',
            title: 'Co-Lead Teacher',
            description: 'The Independent Early Learning Center in Wichita, KS is a high-quality early childhood program that supports learning through play, developmentally appropriate practice, and loving environments.',
            jobUrl: 'https://www.theindependentschool.com/about-us/careers',
            postedDate: '',
            jdDeadline: '',
            company: 'First Rung Independent School',
            salaryRange: '',
            employmentType: '',
            worktype: '',
            location: 'Wichita, KS',
            city: 'Wichita',
            state: 'Kansas',
            country: '', // US-based school, not UK
            ats: 'Custom'
        });
    }
    // Job 2: Head Tennis Coach
    const tennisDesc = $('section#fsEl_6210 .fsElementContent').text().trim();
    if (tennisDesc) {
        jobs.push({
            jobId: 'TIS-ATH-1',
            title: 'Head Tennis Coach',
            description: 'The Independent School in Wichita, Kansas, is seeking a Head Tennis Coach for the upcoming season. This position will work with both Middle School and Upper School student-athletes.',
            jobUrl: 'https://www.theindependentschool.com/about-us/careers',
            postedDate: '',
            jdDeadline: '',
            company: 'First Rung Independent School',
            salaryRange: '',
            employmentType: '',
            worktype: '',
            location: 'Wichita, Kansas',
            city: 'Wichita',
            state: 'Kansas',
            country: '', // US-based school, not UK
            ats: 'Custom'
        });
    }
    // Job 3: Substitute Teachers (ongoing)
    jobs.push({
        jobId: 'TIS-SUB-1',
        title: 'Substitute Teachers',
        description: 'We welcome ongoing applications for substitute teaching positions at The Independent School.',
        jobUrl: 'https://www.theindependentschool.com/about-us/careers',
        postedDate: '',
        jdDeadline: '',
        company: 'First Rung Independent School',
        salaryRange: '',
        employmentType: '',
        worktype: '',
        location: 'Wichita, KS',
        city: 'Wichita',
        state: 'Kansas',
        country: '', // US-based school, not UK
        ats: 'Custom'
    });
    return jobs;
}
// Main function
async function main() {
    const outputDir = path.join(__dirname, '..', '..');
    const jobsDir = path.join(outputDir, 'jobs company wise');
    const companies = [
        { slug: 'ew-recruitment', name: 'EW Recruitment Limited', source: 'https://ewrecruitment.co.uk/job-search/' },
        { slug: 'first-rung-independent-school', name: 'First Rung Independent School', source: 'https://www.theindependentschool.com/about-us/careers' },
        { slug: 'fusion-people', name: 'Fusion People Ltd', source: 'https://www.fusionpeople.com/jobs/' },
        { slug: 'london-academy-for-applied-technology', name: 'London Academy for Applied Technology', source: 'https://laat.zohorecruit.eu/jobs/Careers' },
        { slug: 'mcginnis-loy', name: 'McGinnis Loy Associates Ltd', source: 'https://mcginnisloy.com/jobs/' },
        { slug: 'meridial', name: 'Meridial', source: 'https://www.meridial.ai/projects' }
    ];
    const allJobs = [];
    const sourceReport = {
        scrapeDate: '2026-09-25',
        cutoffDate: '2026-07-25',
        companies: {}
    };
    // Note: TheIndependentSchool is US-based, not UK - all jobs should be excluded from UK scrape
    // Parse LAAT (UK-based)
    const laatHtmlPath = 'C:\\Users\\RUTHVIK\\.pi-desktop\\scratch\\a53f6d91-15eb-4b18-a55d-203b6be0532c\\laat.html';
    if (fs.existsSync(laatHtmlPath)) {
        const laatJobs = parseLAAT(laatHtmlPath);
        console.log(`LAAT: Found ${laatJobs.length} UK jobs`);
        // Write to company folder
        const csvContent = CSV_HEADER + '\n' + laatJobs.map(jobToCSVRow).join('\n');
        fs.writeFileSync(path.join(jobsDir, 'london-academy-for-applied-technology', 'jobs.csv'), csvContent, 'utf-8');
        fs.writeFileSync(path.join(jobsDir, 'london-academy-for-applied-technology', 'jobs.json'), JSON.stringify(laatJobs, null, 2), 'utf-8');
        allJobs.push(...laatJobs);
        sourceReport.companies['london-academy-for-applied-technology'] = {
            source: 'https://laat.zohorecruit.eu/jobs/Careers',
            exported: laatJobs.length,
            platform: 'Zoho Recruit',
            extractionMethod: 'HTML JSON parsing'
        };
    }
    // JavaScript-dependent companies - mark as requiring browser automation
    const jsDependent = ['ew-recruitment', 'fusion-people', 'mcginnis-loy', 'meridial'];
    for (const slug of jsDependent) {
        const company = companies.find(c => c.slug === slug);
        if (!company)
            continue;
        // Write header-only CSV and empty JSON
        fs.writeFileSync(path.join(jobsDir, slug, 'jobs.csv'), CSV_HEADER, 'utf-8');
        fs.writeFileSync(path.join(jobsDir, slug, 'jobs.json'), '[]', 'utf-8');
        sourceReport.companies[slug] = {
            source: company.source,
            exported: 0,
            platform: slug === 'meridial' ? 'Webflow' : 'WordPress + WP Job Manager',
            status: 'JavaScript-rendered content requires browser automation',
            note: 'Jobs loaded dynamically via JavaScript. Use Puppeteer/Playwright for extraction.'
        };
    }
    // First Rung Independent School - US-based, not UK
    fs.writeFileSync(path.join(jobsDir, 'first-rung-independent-school', 'jobs.csv'), CSV_HEADER, 'utf-8');
    fs.writeFileSync(path.join(jobsDir, 'first-rung-independent-school', 'jobs.json'), '[]', 'utf-8');
    sourceReport.companies['first-rung-independent-school'] = {
        source: 'https://www.theindependentschool.com/about-us/careers',
        exported: 0,
        platform: 'Finalsite CMS',
        status: 'US-based school (Wichita, Kansas) - not UK scope',
        note: 'All vacancies are US-based. Excluded from UK scrape as per scope rules.'
    };
    // Write combined master
    const masterCsv = CSV_HEADER + '\n' + allJobs.map(jobToCSVRow).join('\n');
    fs.writeFileSync(path.join(outputDir, 'companies.csv'), masterCsv, 'utf-8');
    fs.writeFileSync(path.join(outputDir, 'companies.json'), JSON.stringify(allJobs, null, 2), 'utf-8');
    fs.writeFileSync(path.join(outputDir, 'source-report.json'), JSON.stringify(sourceReport, null, 2), 'utf-8');
    console.log(`\nTotal UK jobs extracted: ${allJobs.length}`);
    console.log('Source report written to source-report.json');
}
main().catch(console.error);
