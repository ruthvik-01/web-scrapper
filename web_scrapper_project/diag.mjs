import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const log = (...a) => console.log(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "));

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  return { status: r.status, html: await r.text(), headers: Object.fromEntries(r.headers.entries()) };
}

const sites = {
  "morgan-law": "https://www.morgan-law.com/jobs/",
  "long-term-futures": "https://www.longtermfutures.co.uk/job-search/",
  "michael-page": "https://www.michaelpage.co.uk/jobs",
  "louis-vuitton": "https://jobs.louisvuitton.com/en/search-page?searchTerm=&facetName3=locations&facetValue3=%5BcountryRegion%3DGB%5D",
};

const results = {};
for (const [name, url] of Object.entries(sites)) {
  try {
    const origin = new URL(url).origin;
    let sitemap = "";
    let robotsStatus = 0;
    try {
      const rr = await get(origin + "/robots.txt");
      robotsStatus = rr.status;
      const m = rr.html.match(/Sitemap:\s*(\S+)/i);
      if (m) sitemap = m[1];
    } catch (e) { sitemap = "ERR:" + e.message; }
    const p = await get(url);
    writeFileSync(name.replace(/-/g, "_") + "-page.html", p.html);
    const links = [...new Set([...p.html.matchAll(/href="([^"]*)"/gi)].map(m => m[1]))];
    const jobLinks = links.filter(h => h && !h.startsWith("#") && /job|vacan|position|oppor/i.test(h));
    const ldjsonBlocks = [...p.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].filter(m => m[0].includes("ld+json"));
    results[name] = {
      status: p.status, len: p.html.length, robotsStatus, sitemap,
      jobLinksInStaticHtml: jobLinks.length, jobLinkSamples: jobLinks.slice(0, 12),
      ldjsonBlocks: ldjsonBlocks.length, contentType: p.headers["content-type"] || "",
    };
    log("===", name, "** page status:", p.status, "len:", p.html.length, "robots:", robotsStatus, "sitemap:", sitemap, "jobLinks:", jobLinks.length, "ldjson:", ldjsonBlocks.length);
    log("  jobLinks:", JSON.stringify(jobLinks.slice(0, 12)));
  } catch (e) {
    results[name] = { error: e.message };
    log("===", name, "** ERROR:", e.message);
  }
}
writeFileSync("diag2.json", JSON.stringify(results, null, 2));
log("=== WROTE diag2.json ===");
