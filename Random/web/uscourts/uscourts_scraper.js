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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const fs = __importStar(require("fs"));
const p_queue_1 = __importDefault(require("p-queue"));
const CONFIG = {
    url: "https://www.uscourts.gov/careers/search-judiciary-jobs",
    company: "US Courts",
    refDate: "2026-08-14",
    concurrency: 5
};
const parseDateRange = (range) => {
    const match = range.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(.+)/);
    if (!match)
        return {};
    const toIso = (d) => {
        const [mm, dd, yyyy] = d.split("/");
        return `${yyyy}-${mm}-${dd}`;
    };
    const deadline = match[2].includes("/") ? toIso(match[2]) : match[2];
    return { posted: toIso(match[1]), deadline };
};
const isOlderThan30Days = (dateStr, ref) => {
    const d = new Date(dateStr);
    const refDate = new Date(ref);
    const diff = (refDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 30;
};
const isMexicoLocation = (city, state) => {
    const indicators = ["mexico", "monterrey", "mexico city", "nm"];
    const loc = `${city || ""} ${state || ""}`.toLowerCase();
    return indicators.some(ind => loc.includes(ind));
};
const cleanDate = (dateStr) => {
    if (!dateStr || dateStr.toLowerCase().includes("open until filled") || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/))
        return "";
    return dateStr;
};
async function discoverPage(pageNum) {
    const url = pageNum === 0 ? CONFIG.url : `${CONFIG.url}?page=${pageNum}`;
    const { data } = await axios_1.default.get(url, { timeout: 30000 });
    const $ = cheerio.load(data);
    const jobs = [];
    $("table tbody tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5)
            return;
        const link = cells.eq(0).find("a");
        const href = link.attr("href") || "";
        const idMatch = href.match(/(\d+)/);
        if (!idMatch)
            return;
        jobs.push({
            jobId: idMatch[1],
            title: link.text().trim(),
            jobUrl: href.startsWith("http") ? href : `https://www.uscourts.gov${href}`
        });
    });
    return jobs;
}
async function discover() {
    const all = [];
    for (let page = 0;; page++) {
        const jobs = await discoverPage(page);
        if (!jobs.length)
            break;
        all.push(...jobs);
        if (jobs.length < 25)
            break;
    }
    const seen = new Set();
    return all.filter(j => {
        if (seen.has(j.jobId))
            return false;
        seen.add(j.jobId);
        return true;
    });
}
async function fetchExternalDescription(url) {
    try {
        const { data } = await axios_1.default.get(url, { timeout: 30000 });
        const $ = cheerio.load(data);
        const desc = $("#job-description, .job-description, [data-testid='job-description'], .description, .posting-description").text().trim();
        if (desc && desc.length > 50)
            return desc;
        const bodyText = $("body").text().trim();
        if (bodyText.length > 100)
            return bodyText.substring(0, 5000);
        return null;
    }
    catch {
        return null;
    }
}
async function scrape(partial) {
    const { data } = await axios_1.default.get(partial.jobUrl, { timeout: 30000 });
    const $ = cheerio.load(data);
    const sections = [];
    $(".field--name-field-position-description, .field--name-field-qualifications, .field--name-field-employee-benefits, .field--name-field-miscellaneous, .field--name-field-application-info").each((_, el) => {
        sections.push($(el).text().trim());
    });
    let description = sections.join("\n\n").replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();
    if (!description || description.length < 100) {
        const externalLink = $("a[href*='trakstar.com'], a[href*='hire.com'], a[href*='apply'], .apply-link, a:contains('Apply'), a:contains('External')").attr("href");
        if (externalLink) {
            const externalDesc = await fetchExternalDescription(externalLink);
            if (externalDesc)
                description = externalDesc;
        }
    }
    const dateText = $(".field--name-field-date-range .field__item").text().trim();
    const dates = parseDateRange(dateText);
    const salaryText = $(".field--name-field-salary-range .field__item").text().trim();
    const salaryRange = salaryText || "";
    const locationText = $(".field--name-field-vacancy-location .field__item").text().trim();
    const [city = "", state = ""] = locationText.split(",").map(s => s.trim());
    const companyText = $(".field--name-field-court .field__item").text().trim();
    const employmentType = $(".field--name-field-duration .field__item").text().trim();
    const mexico = isMexicoLocation(city, state);
    if (mexico && !dates.posted)
        return null;
    if (dates.posted && isOlderThan30Days(dates.posted, CONFIG.refDate))
        return null;
    return {
        jobId: partial.jobId,
        title: partial.title,
        description: description,
        jobUrl: partial.jobUrl,
        postedDate: cleanDate(dates.posted || "") || CONFIG.refDate,
        jdDeadline: cleanDate(dates.deadline || ""),
        company: companyText || CONFIG.company,
        salaryRange,
        employmentType,
        worktype: "",
        location: locationText || `${city}, ${state}`.replace(/^, |, $/g, ""),
        city,
        state,
        country: state === "MX" ? "Mexico" : (state ? "United States" : ""),
        ats: "Custom"
    };
}
async function main() {
    console.log("Discovering jobs...");
    const discovered = await discover();
    console.log(`Discovered: ${discovered.length}`);
    const queue = new p_queue_1.default({ concurrency: CONFIG.concurrency });
    const jobs = [];
    const errors = [];
    const tasks = discovered.map(partial => queue.add(async () => {
        try {
            const job = await scrape(partial);
            if (job)
                jobs.push(job);
        }
        catch (e) {
            errors.push({ jobId: partial.jobId, error: String(e) });
        }
    }));
    await Promise.all(tasks);
    fs.writeFileSync("uscourts_jobs.json", JSON.stringify(jobs, null, 2));
    if (errors.length) {
        fs.writeFileSync("uscourts_errors.json", JSON.stringify(errors, null, 2));
    }
    console.log(`Company: ${CONFIG.company}`);
    console.log(`Discovered: ${discovered.length}`);
    console.log(`Scraped: ${jobs.length}`);
    console.log(`JSON: uscourts_jobs.json`);
}
main().catch(console.error);
//# sourceMappingURL=uscourts_scraper.js.map