import { chromium } from "playwright";
import * as fs from "fs";
import PQueue from "p-queue";
const REF_DATE = "2026-08-14";
const COMPANY_CONCURRENCY = 5;
const JOB_CONCURRENCY = 10;
const MEXICO_TERMS = ["mexico", "mexico city", "monterrey", "mx", "new mexico", "nm"];
const cleanText = (s) => s.replace(/\\[nt]/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/[^\w\s.,\-\/()]/g, "").replace(/\s+/g, " ").trim();
const toIsoDate = (s) => {
    if (!s)
        return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const withinWindow = (posted) => {
    const ref = new Date(REF_DATE).getTime();
    const p = new Date(posted).getTime();
    return ref - p <= 30 * 86400000 && p <= ref;
};
const isMexico = (j) => MEXICO_TERMS.some(t => [j.location, j.city, j.state, j.country].filter(Boolean).some(f => f.toLowerCase().includes(t)));
const applyDateRules = (j) => {
    if (!j.postedDate || !j.jdDeadline) {
        if (isMexico(j)) {
            j.postedDate = REF_DATE;
            j.state = "NM";
        }
        else if (!j.postedDate)
            j.postedDate = REF_DATE;
    }
    return j;
};
const isValid = (j) => !!j.jobId && !!j.title && !!j.description && !!j.jobUrl && !!j.postedDate && !!j.company && j.ats === "Custom";
async function autoScroll(page) {
    let stable = 0, lastHeight = 0;
    while (stable < 3) {
        const height = await page.evaluate(() => document.body.scrollHeight);
        if (height === lastHeight)
            stable++;
        else
            stable = 0;
        lastHeight = height;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);
    }
}
// --- JSON-LD schema.org/JobPosting extraction (most reliable, standards-based) ---
async function getJsonLd(page) {
    const blocks = await page.$$eval("script[type='application/ld+json']", els => els.map(e => e.textContent ?? ""));
    return blocks.flatMap(b => {
        try {
            const parsed = JSON.parse(b);
            return Array.isArray(parsed) ? parsed : [parsed];
        }
        catch {
            return [];
        }
    });
}
const findJobPosting = (blocks) => blocks.find(b => b["@type"] === "JobPosting") ??
    blocks.flatMap(b => b["@graph"] ?? []).find((b) => b["@type"] === "JobPosting") ?? null;
const findJobList = (blocks) => {
    const list = blocks.find(b => b["@type"] === "ItemList");
    if (!list?.itemListElement)
        return [];
    return list.itemListElement.map((i) => i.url ?? i.item?.url).filter(Boolean);
};
function fieldsFromJsonLd(posting) {
    const loc = posting.jobLocation?.address ?? posting.jobLocation?.[0]?.address ?? {};
    const salary = posting.baseSalary?.value;
    const salaryRange = salary ? [salary.minValue, salary.maxValue].filter(Boolean).join(" - ") + (salary.unitText ? ` / ${salary.unitText}` : "") : "";
    return {
        title: posting.title ?? "",
        description: posting.description ? cleanText(posting.description.replace(/<[^>]+>/g, " ")) : "",
        postedDate: posting.datePosted ?? "",
        jdDeadline: posting.validThrough ?? "",
        salaryRange,
        employmentType: posting.employmentType ?? "",
        worktype: posting.jobLocationType ?? (posting.applicantLocationRequirements ? "Remote" : ""),
        location: [loc.addressLocality, loc.addressRegion, loc.addressCountry].filter(Boolean).join(", "),
        city: loc.addressLocality ?? "",
        state: loc.addressRegion ?? "",
        country: loc.addressCountry ?? "",
    };
}
// --- Fallback: meta tags ---
async function getMeta(page, name) {
    const content = await page.$eval(`meta[property='${name}'], meta[name='${name}']`, el => el.getAttribute("content") ?? "").catch(() => "");
    return cleanText(content);
}
// --- Fallback: label-based regex scan of visible page text ---
async function getPageText(page) {
    return page.$eval("body", b => b.innerText).catch(() => "");
}
const labelMatch = (text, labels) => {
    for (const label of labels) {
        const re = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n]{2,120})`, "i");
        const m = text.match(re);
        if (m)
            return cleanText(m[1]);
    }
    return "";
};
async function extractDetailFallback(page, text) {
    const title = await page.$eval("h1", el => el.textContent ?? "").then(cleanText).catch(() => "");
    const description = await page.$eval("main, article, [role='main'], body", el => el.innerText)
        .then(t => cleanText(t)).catch(() => "");
    return {
        title,
        description,
        postedDate: labelMatch(text, ["Posted Date", "Date Posted", "Posted", "Post Date"]),
        jdDeadline: labelMatch(text, ["Closing Date", "Deadline", "Apply By", "Application Deadline"]),
        salaryRange: labelMatch(text, ["Salary Range", "Salary", "Pay Range", "Compensation"]),
        employmentType: labelMatch(text, ["Employment Type", "Job Type", "Type"]),
        worktype: labelMatch(text, ["Work Type", "Work Arrangement", "Remote"]),
        location: labelMatch(text, ["Location"]),
        city: "", state: "", country: "",
    };
}
const extractCityStateCountry = (location) => {
    const parts = location.split(",").map(p => p.trim()).filter(Boolean);
    return { city: parts[0] ?? "", state: parts[1] ?? "", country: parts[2] ?? "" };
};
// --- Discovery ---
async function discoverViaApi(page, url) {
    const hits = [];
    page.on("response", async (r) => {
        const ct = r.headers()["content-type"] ?? "";
        if (!ct.includes("json"))
            return;
        try {
            const body = await r.json();
            const arr = Array.isArray(body) ? body : body.searchResults ?? body.jobs ?? body.results ?? body.data ?? body.items ?? [];
            if (!Array.isArray(arr))
                return;
            arr.forEach((j) => {
                const u = j.url ?? j.jobUrl ?? j.applyUrl ?? j.detailUrl ?? j.link;
                if (typeof u === "string")
                    hits.push(u);
            });
        }
        catch { /* not usable json */ }
    });
    await page.goto(url, { waitUntil: "networkidle" }).catch(() => null);
    await page.waitForTimeout(2000);
    return hits.length ? [...new Set(hits)] : null;
}
async function discoverViaJsonLd(page) {
    const blocks = await getJsonLd(page);
    const urls = findJobList(blocks);
    return urls.length ? urls : null;
}
async function discoverViaDom(page) {
    await autoScroll(page);
    const candidates = await page.$$eval("a", els => els
        .map(e => ({ href: e.href, text: e.textContent ?? "" }))
        .filter(e => e.href && e.href.startsWith("http")));
    const jobLike = candidates.filter(c => /job|career|position|posting|requisition|vacan/i.test(c.href) ||
        /job|career|position|posting|requisition|vacan/i.test(c.text));
    return [...new Set((jobLike.length ? jobLike : candidates).map(c => c.href))];
}
async function discoverJobUrls(browser, company) {
    const page = await browser.newPage();
    const apiUrls = await discoverViaApi(page, company.careerUrl);
    if (apiUrls) {
        await page.close();
        return apiUrls;
    }
    const ldUrls = await discoverViaJsonLd(page);
    if (ldUrls) {
        await page.close();
        return ldUrls;
    }
    const domUrls = await discoverViaDom(page);
    await page.close();
    return domUrls;
}
async function scrapeJob(browser, company, jobUrl) {
    const page = await browser.newPage();
    await page.goto(jobUrl, { waitUntil: "networkidle" }).catch(() => null);
    const ldBlocks = await getJsonLd(page);
    const posting = findJobPosting(ldBlocks);
    const text = await getPageText(page);
    const fields = posting ? fieldsFromJsonLd(posting) : await extractDetailFallback(page, text);
    if (!fields.description) {
        const ogDesc = await getMeta(page, "og:description");
        if (ogDesc)
            fields.description = ogDesc;
    }
    if (!fields.title)
        fields.title = await getMeta(page, "og:title");
    await page.close();
    if (!fields.description)
        return null;
    const { city, state, country } = fields.city || fields.state || fields.country
        ? { city: fields.city, state: fields.state, country: fields.country }
        : extractCityStateCountry(fields.location);
    const jobIdFromUrl = jobUrl.match(/[?&](?:id|jobId|reqId|req)=([\w-]+)/i)?.[1]
        ?? jobUrl.match(/\/([\w-]+)\/?$/)?.[1] ?? jobUrl;
    return applyDateRules({
        jobId: jobIdFromUrl,
        title: fields.title,
        description: fields.description,
        jobUrl,
        postedDate: toIsoDate(fields.postedDate),
        jdDeadline: toIsoDate(fields.jdDeadline),
        company,
        salaryRange: fields.salaryRange,
        employmentType: fields.employmentType,
        worktype: fields.worktype,
        location: fields.location,
        city, state, country,
        ats: "Custom",
    });
}
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
async function processCompany(browser, c) {
    const outFile = `${c.company}_jobs.json`;
    const errFile = `${c.company}_errors.json`;
    const jobUrls = await discoverJobUrls(browser, c);
    const seen = new Set();
    const jobs = [];
    const errors = [];
    const queue = new PQueue({ concurrency: JOB_CONCURRENCY });
    for (const batch of chunk(jobUrls, JOB_CONCURRENCY)) {
        const results = await Promise.all(batch.map(url => queue.add(async () => {
            return scrapeJob(browser, c.company, url).catch(e => {
                errors.push({ jobUrl: url, reason: String(e) });
                return null;
            });
        })));
        results
            .filter((j) => !!j && isValid(j) && withinWindow(j.postedDate) && !seen.has(j.jobId))
            .forEach(j => { seen.add(j.jobId); jobs.push(j); });
        fs.writeFileSync(outFile, JSON.stringify(jobs, null, 2));
    }
    if (errors.length)
        fs.writeFileSync(errFile, JSON.stringify(errors, null, 2));
    console.log(`Company: ${c.company}`);
    console.log(`Discovered: ${jobUrls.length}`);
    console.log(`Scraped: ${jobs.length}`);
    console.log(`JSON: ${outFile}`);
}
async function main() {
    const companies = JSON.parse(fs.readFileSync("companies.json", "utf-8"));
    const browser = await chromium.launch();
    const queue = new PQueue({ concurrency: COMPANY_CONCURRENCY });
    await Promise.all(companies.map(c => queue.add(() => processCompany(browser, c))));
    await browser.close();
}
main().catch(console.error);
