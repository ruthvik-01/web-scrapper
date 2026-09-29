import { readFileSync, writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const out = [];
const log = (...a) => { const s = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); out.push(s); console.log(s); };

function findCtx(html, needle, radius = 160) {
  const i = html.indexOf(needle);
  if (i < 0) return null;
  return html.slice(Math.max(0, i - radius), i + needle.length + radius).replace(/\s+/g, " ").trim();
}

// ===== LTF detail page structure =====
{
  const html = readFileSync("ltf-detail.html", "utf8");
  log("=== LTF detail ===");
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ""])[1];
  log("title:", title);
  const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  log("ld+json count:", ld.length);
  for (const m of ld) {
    try { const o = JSON.parse(m[1]); log("  ld @type:", JSON.stringify(o["@type"]), "keys:", Object.keys(o).slice(0, 15).join(",")); } catch (e) { log("  ld parse err"); }
  }
  // location keywords
  ["Location", "location", "Salary", "salary", "Closing", "closing", "Posted", "posted", "Date", "date", "Ref", "ref", "Contract", "contract", "Hours", "hours"].forEach(k => {
    const c = findCtx(html, k);
    if (c) log("  has '" + k + "': ...", c.slice(0, 140));
  });
  // job board markers
  for (const pat of ["class=\"evo", "wp-job-manager", "job-single", "job-detail", "vacancy", "JobListing", "class=\"job"]) {
    if (html.includes(pat)) log("  marker found:", pat);
  }
}

// ===== Morgan Law structure =====
{
  const html = readFileSync("morgan-law-jobs.html", "utf8");
  log("\n=== Morgan Law /jobs/ ===");
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [, ""])[1];
  log("title:", title);
  // forms
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map(m => m[0].slice(0, 160));
  log("forms:", JSON.stringify(forms));
  // ajax endpoint
  const ajaxurl = html.match(/ajaxurl["'\s:=]+(https?:\/\/[^"'\s<]+)/i);
  log("ajaxurl:", ajaxurl ? ajaxurl[1] : "none");
  // any data-job / job-id attributes
  const jobIds = [...html.matchAll(/data-job-id=["']([^"']+)["']/gi)].map(m=>m[1]);
  log("data-job-id:", jobIds.slice(0,6));
  const jobSlug = [...new Set([...html.matchAll(/job_slug=["']([^"']+)["']/gi)].map(m=>m[1]))];
  log("job_slug:", jobSlug.slice(0,6));
  // script with job data
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1].trim()).filter(s => s.length > 30);
  log("scripts (>30 chars):", scripts.length);
  for (const s of scripts) {
    if (/job|vacan|post/i.test(s) && /ajax|wp|json|url/i.test(s)) log("  script candidate:", s.slice(0, 200));
  }
}

// ===== Michael Page detail page =====
{
  const r = await fetch("https://www.michaelpage.co.uk/job-detail/digital-marketing-executive/ref/jn-092026-7105505", {
    headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000)
  });
  const html = await r.text();
  log("\n=== Michael Page detail ===");
  log("status:", r.status, "len:", html.length);
  writeFileSync("mp-detail.html", html);
  const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  log("ld+json count:", ld.length);
  for (const m of ld) {
    try { const o = JSON.parse(m[1]); log("  @type:", JSON.stringify(o["@type"]), "title:", (o.title||"").slice(0,50), "loc:", JSON.stringify(o.jobLocation?.address || o.location)); } catch(e){ log("  parse err:", m[1].slice(0,100)); }
  }
  // microlinks / meta
  for (const pat of ["itemtype", "JobPosting", "data-"]); { }
  const metaDesc = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || [, ""])[1];
  log("meta desc:", (metaDesc||"").slice(0, 140));
  // class names with 'job'
  const jobClasses = [...new Set([...html.matchAll(/class="([^"]*job[^"]*)"/gi)].map(m=>m[1]))];
  log("job-related classes:", JSON.stringify(jobClasses.slice(0, 10)));
}

writeFileSync("inspect.txt", out.join("\n") + "\n");
log("=== WROTE inspect.txt ===");
