import { chromium, Browser } from "playwright";
declare const require: any;
const fs = require("fs");
import PQueue from "p-queue";

const CONFIG = {
    url: "https://careers.farrow-ball.com/",
    company: "Farrow & Ball",
    refDate: "2026-08-14",
    concurrency: 5
};

interface Job {
    jobId: string;
    title: string;
    description: string;
    jobUrl: string;
    postedDate: string;
    jdDeadline: string | null;
    company: string;
    salaryRange: string;
    employmentType: string;
    worktype: string;
    location: string;
    city: string;
    state: string;
    country: string;
    ats: string;
}

type PartialJob = { jobId: string; title: string; jobUrl: string; location: string };
type ErrorRecord = { jobId: string; error: string };

const MEXICO = ["mexico city", "monterrey", "new mexico", "mexico", "mx", "nm"];

const cleanDescription = (value: string): string =>
    value
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z0-9#]+;/gi, " ")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

const plain = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(plain).filter(Boolean).join(", ");
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const candidate = [
            record.name,
            record.streetAddress,
            record.addressLocality,
            record.addressRegion,
            record.addressCountry,
            record.value,
            record.text
        ].find(item => plain(item));
        return candidate ? plain(candidate) : "";
    }
    return String(value).trim();
};

const toDate = (value: unknown): string | null => {
    const text = plain(value);
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const toDeadline = (value: unknown): string | null => {
    const text = plain(value);
    if (!text || /open until filled|immediate start/i.test(text)) return null;
    return toDate(text);
};

const inWindow = (postedDate: string): boolean => {
    const posted = new Date(`${postedDate}T00:00:00Z`).getTime();
    const ref = new Date(`${CONFIG.refDate}T00:00:00Z`).getTime();
    return posted >= ref - 30 * 86400000 && posted <= ref;
};

const isMexico = (...values: string[]): boolean => {
    const text = values.join(" ").toLowerCase();
    return MEXICO.some(term => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "i").test(text));
};

const locationParts = (value: string): { city: string; state: string } => {
    const parts = value.split(",").map(part => part.trim()).filter(Boolean);
    return { city: parts[0] || "", state: parts[1] || "" };
};

const salaryRange = (schema: any, fallback: string): string => {
    const base = schema?.baseSalary;
    if (!base) return fallback.trim();

    const values = Array.isArray(base.value) ? base.value : [base.value];
    const amounts = values
        .map((item: unknown) =>
            plain(
                typeof item === "object" && item != null
                    ? (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).amount ?? item
                    : item
            )
        )
        .filter(Boolean);

    if (amounts.length) return amounts.join(" - ");

    const min = plain(base.minValue ?? base.minSalary);
    const max = plain(base.maxValue ?? base.maxSalary);
    if (min || max) return [min, max].filter(Boolean).join(" - ");

    return plain(base) || fallback.trim();
};

async function discover(browser: Browser): Promise<PartialJob[]> {
    const page = await browser.newPage();

    try {
        await page.goto(CONFIG.url, { waitUntil: "networkidle" });

        const jobs = new Map<string, PartialJob>();

        const extractJobs = async (): Promise<PartialJob[]> =>
            page.$$eval("a[href]", anchors => {
                return anchors.map(anchor => {
                    const link = anchor as HTMLAnchorElement;
                    const title = link.textContent?.trim() || link.getAttribute("aria-label")?.trim() || link.getAttribute("title")?.trim() || "";

                    const href = link.href;
                    if (!title || !href) return { jobId: "", title, jobUrl: "", location: "" };

                    const url = new URL(href);
                    const idMatch = href.match(/(?:job|vacanc|position|requisition)[^\d]*(\d{3,})/i) || href.match(/[?&](?:id|jobid|job_id|positionid|position_id)=([^&#]+)/i);

                    const jobId = idMatch?.[1] || `${url.pathname}${url.search}${url.hash}`.replace(/\/+$/, "") || href;

                    const container = link.closest("li, article, div, section");
                    const lines = (container?.innerText || container?.textContent || "").split("\n").map(line => line.trim()).filter(Boolean);

                    const location = lines.find(line => /^[^,]+,\s*[A-Z]{2}$/.test(line)) || lines.find(line => /^[^,]+,\s*[A-Za-z .'-]+$/.test(line)) || "";

                    return { jobId, title, jobUrl: href, location };
                }).filter(job => job.jobId && job.title && job.jobUrl && /job|vacanc|position|opening|jobid|job_id/i.test(job.jobUrl));
            });

        for (; ;) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);

            const current = await extractJobs();
            let added = 0;

            current.forEach(job => {
                if (!jobs.has(job.jobId)) {
                    jobs.set(job.jobId, job);
                    added += 1;
                }
            });

            const next = page.locator("a, button").filter({ hasText: /next|load more|show more|see more|view more|siguiente/i }).first();

            if (!(await next.count()) || !(await next.isVisible().catch(() => false)) || added === 0) break;

            const clicked = await next.click({ timeout: 5000 }).then(() => true).catch(() => false);
            if (!clicked) break;

            await page.waitForLoadState("networkidle").catch(() => undefined);
        }

        return [...jobs.values()];
    } finally {
        await page.close();
    }
}

async function scrape(browser: Browser, partial: PartialJob): Promise<Job | null> {
    const page = await browser.newPage();

    try {
        await page.goto(partial.jobUrl, { waitUntil: "networkidle" });

        const schema = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            for (const script of scripts) {
                const text = script.textContent?.trim();
                if (!text) continue;

                try {
                    const parsed = JSON.parse(text);
                    const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
                    const posting = items.find((item: any) => {
                        const type = item?.["@type"];
                        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
                    });

                    if (posting) return posting;
                } catch { }
            }

            return null;
        });

        const domDescription = await page.evaluate(() => {
            const selectors = [
                '[itemprop="description"]',
                ".description",
                "#description",
                ".job-description",
                ".job-description-content",
                ".job-details",
                "main article",
                "article",
                "main",
                '[role="main"]'
            ];

            const candidates = selectors
                .flatMap(selector => Array.from(document.querySelectorAll(selector)))
                .map(node => node.innerText.trim())
                .filter(value => value.length > 80);

            return candidates.sort((a, b) => b.length - a.length)[0] || "";
        });

        const pageData = await page.evaluate(() => {
            const text = document.body?.innerText || "";
            const pick = (pattern: RegExp) => {
                const match = text.match(pattern);
                return match ? match[1].trim() : "";
            };

            return {
                posted: pick(/(?:posted date|date posted|posted|publish date)\s*:?\s*([^\n]+)/i),
                deadline: pick(/(?:closing date|deadline|close date|valid through)\s*:?\s*([^\n]+)/i),
                salary: pick(/(?:salary|compensation)\s*:?\s*([^\n]+)/i),
                employment: pick(/(?:employment type|contract type|job type)\s*:?\s*([^\n]+)/i),
                worktype: pick(/(?:worktype|work type|location type)\s*:?\s*([^\n]+)/i),
                location: pick(/location\s*:?\s*([^\n]+)/i)
            };
        });

        const description = cleanDescription(plain(schema?.description) || domDescription);
        if (!description) return null;

        const parsedPosted = toDate(schema?.datePosted) || toDate(pageData.posted);
        const deadlineValue = toDeadline(schema?.validThrough || pageData.deadline);

        const schemaAddress = schema?.jobLocation?.address;
        const addressRecord = schemaAddress && typeof schemaAddress === "object" && !Array.isArray(schemaAddress) ? schemaAddress as Record<string, unknown> : null;

        const schemaLocation = addressRecord
            ? [plain(addressRecord.streetAddress), plain(addressRecord.addressLocality), plain(addressRecord.addressRegion), plain(addressRecord.addressCountry)].filter(Boolean).join(", ")
            : plain(schemaAddress);

        const location = (addressRecord ? plain(addressRecord.streetAddress) || schemaLocation : schemaLocation) || pageData.location || partial.location;

        const mexico = isMexico(partial.location, location, addressRecord ? plain(addressRecord.addressLocality) : "", addressRecord ? plain(addressRecord.addressRegion) : "", addressRecord ? plain(addressRecord.addressCountry) : "");

        if ((!parsedPosted || !deadlineValue) && !mexico) return null;

        const postedDate = mexico && (!parsedPosted || !deadlineValue) ? CONFIG.refDate : parsedPosted || CONFIG.refDate;

        if (!inWindow(postedDate)) return null;

        const fallbackLocation = locationParts(partial.location || pageData.location || (addressRecord ? "" : schemaLocation));

        const city = (addressRecord ? plain(addressRecord.addressLocality) : "") || fallbackLocation.city;
        let state = (addressRecord ? plain(addressRecord.addressRegion) : "") || fallbackLocation.state;
        let country = addressRecord ? plain(addressRecord.addressCountry) : "";

        if (mexico) {
            state = "NM";
            country = "Mexico";
        }

        return {
            jobId: partial.jobId,
            title: partial.title,
            description,
            jobUrl: partial.jobUrl,
            postedDate,
            jdDeadline: deadlineValue,
            company: CONFIG.company,
            salaryRange: salaryRange(schema, pageData.salary),
            employmentType: plain(schema?.employmentType) || pageData.employment,
            worktype: plain(schema?.jobLocationType).replace(/^https?:\/\/schema\.org\//i, "") || pageData.worktype,
            location,
            city,
            state,
            country,
            ats: "Custom"
        };
    } finally {
        await page.close();
    }
}

async function main(): Promise<void> {
    const browser = await chromium.launch({ headless: true });

    try {
        const discovered = await discover(browser);
        const queue = new PQueue({ concurrency: CONFIG.concurrency });
        const errors: ErrorRecord[] = [];

        const results = await Promise.all(
            discovered.map(partial =>
                queue.add(async () => {
                    try {
                        return await scrape(browser, partial);
                    } catch (error) {
                        errors.push({ jobId: partial.jobId, error: String(error) });
                        return null;
                    }
                })
            )
        );

        const seen = new Set<string>();

        const jobs = results.filter(
            (job): job is Job =>
                Boolean(job) &&
                !seen.has(job!.jobId) &&
                Boolean(seen.add(job!.jobId)) &&
                job!.ats === "Custom" &&
                [job!.jobId, job!.title, job!.description, job!.jobUrl, job!.postedDate, job!.company].every(
                    field => field.trim().length > 0
                )
        );

        const filename = `${CONFIG.company.replace(/\s+/g, "_")}_jobs.json`;

        await fs.promises.writeFile(filename, JSON.stringify(jobs, null, 2));

        if (errors.length) {
            await fs.promises.writeFile(`${CONFIG.company.replace(/\s+/g, "_")}_errors.json`, JSON.stringify(errors, null, 2));
        }

        console.log(`Company: ${CONFIG.company}`);
        console.log(`Discovered: ${discovered.length}`);
        console.log(`Scraped: ${jobs.length}`);
        console.log(`JSON: ${filename}`);
    } finally {
        await browser.close();
    }
}

main().catch(error => console.error(String(error)));