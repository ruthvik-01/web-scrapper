import { chromium, request } from "playwright";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const out = [];
const log = (...a) => { const s = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); out.push(s); console.log(s); };

const browser = await chromium.launch({ headless: true });

// ---- LAAT: check Zoho payload ----
{
  const ctx = await browser.newContext({ userAgent: UA });
  const r = await ctx.request.get("https://laat.zohorecruit.eu/jobs/Careers", { headers: { "User-Agent": UA }, timeout: 30000 });
  const html = await r.text();
  const hiddenJobs = (html.match(/id="jobs"[^>]*value="([^"]*)"/i) || [, ""])[1]?.slice(0, 200);
  const literal = /var\s+jobs\s*=\s*JSON\.parse\('/i.test(html);
  const parseMatch = /var\s+jobs\s*=\s*JSON\.parse\('((?:\\[\s\S]|[^'\\])*)/i.exec(html);
  log("LAAT static: status", r.status(), "len", html.length);
  log("  hidden #jobs input present:", !!hiddenJobs);
  log("  var jobs=JSON.parse literal present:", literal);
  if (parseMatch) log("  literal preview:", parseMatch[1].slice(0, 200));
  // Check for job detail links
  const detailLinks = [...html.matchAll(/href="([^"]*)"/gi)].map(m => m[1]).filter(h => /\/\d+\/|jobs\/Careers/i.test(h)).slice(0, 5);
  log("  detail-link samples:", detailLinks);
  await ctx.close();
}

// ---- LTF: render job-search, find job links + AJAX ----
{
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  await page.goto("https://www.longtermfutures.co.uk/job-search/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const allHrefs = await page.$$eval("a[href]", els => els.map(a => a.href)).catch(() => []);
  const jobHrefs = allHrefs.filter(h => /external_job|job|vacan/i.test(h));
  log("LTF JS: total hrefs", allHrefs.length, "job-related hrefs", jobHrefs.length);
  log("  distinct job hrefs sample:", [...new Set(jobHrefs)].slice(0, 8));
  // look for AJAX /api/ or endpoint hints in source
  const src = await page.content();
  const endpoints = [...new Set([...src.matchAll(/https?:\\/(?:\\/[^"'\s<>`)]+)/gi)].map(m => m[0]).filter(u => /api|ajax|wp-json|graphql|search|jobs?/i.test(u)))];
  log("  endpoint hints sample:", endpoints.slice(0, 8));
  await ctx.close();
}

// ---- Morgan Law: check JSON-LD type ----
{
  const ctx = await browser.newContext({ userAgent: UA });
  const r = await ctx.request.get("https://www.morgan-law.com/jobs/", { headers: { "User-Agent": UA }, timeout: 30000 });
  const html = await r.text();
  log("MorganLaw static: status", r.status(), "len", html.length);
  const ld = [...html.matchAll(/<script[^>]*type="application\\\/ld\\+json"[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m => {
    try { const o = JSON.parse(m[1]); return { "@type": o["@type"], "name": o.name, "url": o.url, "jobCount": o.jobCount }; } catch { return m[1].slice(0, 120); }
  });
  log("  JSON-LD blocks:", JSON.stringify(ld));
  const jobLinks = [...html.matchAll(/href="([^"]*)"/gi)].map(m => m[1]).filter(h => /job/i.test(h)).slice(0, 8);
  log("  job hrefs:", jobLinks);
  await ctx.close();
}

// ---- Michael Page: render, check JSON-LD + job links ----
{
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  await page.goto("https://www.michaelpage.co.uk/jobs", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const html = await page.content();
  const ld = [...html.matchAll(/<script[^>]*type="application\\\/ld\\+json"[^>]*>([\\s\\S]*?)<\\/script>/gi)].map(m => {
    try { const o = JSON.parse(m[1]); return { "@type": o["@type"], title: o.title || o.name, url: o.url || o.jobBoard?.url }; } catch { return m[1].slice(0, 120); }
  });
  log("MichaelPage JS: len", html.length, "JSON-LD blocks:", JSON.stringify(ld));
  const jobLinks = await page.$$eval("a[href]", els => els.map(a => a.href).filter(h => /job-detail|job-search|page=|\\/jobs\\//i.test(h))).catch(() => []);
  log("  job-link samples:", [...new Set(jobLinks)].slice(0, 10));
  await ctx.close();
}

// ---- Louis Vuitton: retry with enhanced headers + JS ----
{
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "en-GB",
    viewport: { width: 1280, height: 2000 },
    extraHTTPHeaders: { "Accept-Language": "en-GB,en;q=0.9", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto("https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D", { waitUntil: "domcontentloaded", timeout: 30000 });
    log("LouisVuitton JS: status", resp?.status());
  } catch (e) { log("LouisVuitton JS: navigate error", e.message); }
  await page.waitForTimeout(6000);
  const html = await page.content();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ""])[1];
  log("  title:", title.slice(0, 80));
  log("  len:", html.length, "ldjson:", (html.match(/application\\/ld\\+json/gi)||[]).length);
  const jobLinks = await page.$$eval("a[href]", els => els.map(a => a.href).filter(h => /job|career/i.test(h))).catch(() => []);
  log("  job-link samples:", [...new Set(jobLinks)].slice(0, 10));
  const bodyClass = (html.match(/<body[^>]*class="([^"]*)"/i) || [, ""])[1];
  log("  body class:", bodyClass);
  await ctx.close();
}

await browser.close();
import { writeFileSync } from "node:fs";
writeFileSync("probe-diag.txt", out.join("\n") + "\n");
console.log("=== WROTE probe-diag.txt ===");

