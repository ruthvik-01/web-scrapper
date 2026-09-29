import { chromium } from "playwright";
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

async function probe() {
  const browser = await chromium.launch({ headless: true });

  console.log("--- 1. LAAT (Zoho) ---");
  try {
    const page = await browser.newPage({ userAgent: UA });
    const res = await page.goto("https://laat.zohorecruit.eu/jobs/Careers", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log("LAAT status:", res?.status());
    const content = await page.content();
    console.log("LAAT length:", content.length);
    // check if jobs input or json-ld is present
    const $ = cheerio.load(content);
    const jobsVal = $("#jobs").val();
    console.log("LAAT #jobs exists:", !!jobsVal, "len:", String(jobsVal || "").length);
    const scripts = $("script").map((_, el) => $(el).html()).get();
    const zohoScript = scripts.find(s => s && s.includes("JSON.parse"));
    console.log("LAAT script with JSON.parse:", !!zohoScript);
    await page.close();
  } catch (e: any) {
    console.log("LAAT error:", e.message);
  }

  console.log("\n--- 2. Long Term Futures ---");
  try {
    const page = await browser.newPage({ userAgent: UA });
    const res = await page.goto("https://www.longtermfutures.co.uk/job-search/", { waitUntil: "networkidle", timeout: 30000 });
    console.log("LTF status:", res?.status());
    const content = await page.content();
    const $ = cheerio.load(content);
    const links = $("a").map((_, el) => $(el).attr("href")).get().filter(Boolean);
    const jobLinks = links.filter(h => h.includes("/job/") || h.includes("/jobs/") || h.includes("external_job"));
    console.log("LTF total links:", links.length, "job links:", jobLinks.length, jobLinks.slice(0, 5));
    const nextLinks = links.filter(h => h.includes("/page/") || h.includes("page="));
    console.log("LTF pagination links:", nextLinks.slice(0, 5));
    await page.close();
  } catch (e: any) {
    console.log("LTF error:", e.message);
  }

  console.log("\n--- 3. Louis Vuitton ---");
  try {
    const page = await browser.newPage({ userAgent: UA, locale: "en-GB" });
    const res = await page.goto("https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D", { waitUntil: "networkidle", timeout: 30000 });
    console.log("LV status:", res?.status());
    const content = await page.content();
    const $ = cheerio.load(content);
    const links = $("a").map((_, el) => $(el).attr("href")).get().filter(Boolean);
    const jobLinks = links.filter(h => h.includes("/job/") || h.includes("/search-page/job/"));
    console.log("LV total links:", links.length, "job links:", jobLinks.length, [...new Set(jobLinks)].slice(0, 10));
    await page.close();
  } catch (e: any) {
    console.log("LV error:", e.message);
  }

  console.log("\n--- 4. Michael Page Technology ---");
  try {
    const page = await browser.newPage({ userAgent: UA, locale: "en-GB" });
    const res = await page.goto("https://www.michaelpage.co.uk/jobs", { waitUntil: "networkidle", timeout: 30000 });
    console.log("MichaelPage status:", res?.status());
    const content = await page.content();
    const $ = cheerio.load(content);
    const links = $("a").map((_, el) => $(el).attr("href")).get().filter(Boolean);
    const jobLinks = links.filter(h => h.includes("/job-detail/") || h.includes("/job/"));
    console.log("MichaelPage total links:", links.length, "job links:", jobLinks.length, [...new Set(jobLinks)].slice(0, 10));
    await page.close();
  } catch (e: any) {
    console.log("MichaelPage error:", e.message);
  }

  console.log("\n--- 5. Morgan Law ---");
  try {
    const page = await browser.newPage({ userAgent: UA, locale: "en-GB" });
    const res = await page.goto("https://www.morgan-law.com/jobs/", { waitUntil: "networkidle", timeout: 30000 });
    console.log("Morgan Law status:", res?.status());
    const content = await page.content();
    const $ = cheerio.load(content);
    const links = $("a").map((_, el) => $(el).attr("href")).get().filter(Boolean);
    const jobLinks = links.filter(h => h.includes("/job/") || h.includes("/jobs/"));
    console.log("Morgan Law total links:", links.length, "job links:", jobLinks.length, [...new Set(jobLinks)].slice(0, 10));
    await page.close();
  } catch (e: any) {
    console.log("Morgan Law error:", e.message);
  }

  await browser.close();
}

probe().catch(console.error);
