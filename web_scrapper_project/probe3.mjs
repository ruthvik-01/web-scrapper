import { readFileSync, writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const out = [];
const log = (...a) => { const s = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); out.push(s); console.log(s); };
async function get(url, t = 15000) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(t) });
  return { status: r.status, html: await r.text() };
}
function locs(html) { return [...html.matchAll(/<loc>([^<]*)<\/loc>/gi)].map(m => m[1]).filter(Boolean); }

// ===== LTF detail HTML structure =====
{
  const html = readFileSync("ltf-detail.html", "utf8");
  log("=== LTF detail structure ===");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  log("h1:", h1 ? h1[1].replace(/<[^>]+>/g, "").trim().slice(0, 100) : "none");
  const strongs = [...html.matchAll(/<strong>([^<]+)<\/strong>([\s\S]*?)(?=<strong>|<\/p>)/gi)].slice(0, 20);
  log("strong fields:");
  for (const m of strongs) {
    const val = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ").slice(0, 70);
    log("  " + m[1] + " = " + val);
  }
}

// ===== Morgan Law WP REST API =====
{
  log("\n=== Morgan Law WP REST API ===");
  for (const test of [
    "https://www.morgan-law.com/wp-json/wp/v2/job?_per_page=5",
    "https://www.morgan-law.com/wp-json/wp/v2/jobs?_per_page=5",
    "https://www.morgan-law.com/wp-json/wp/v2/job?_embed&per_page=5",
  ]) {
    try {
      const r = await get(test);
      log("  " + test + " -> status", r.status, "len", r.html.length);
      if (r.status === 200 && (r.html.startsWith("[") || r.html.startsWith("{"))) {
        try { const arr = JSON.parse(r.html); const a = Array.isArray(arr) ? arr : [arr]; log("    count:", a.length, "sample:", JSON.stringify({ id: a[0]?.id, title: a[0]?.title?.rendered?.slice(0, 40), link: a[0]?.link, content_len: a[0]?.content?.rendered?.length })); }
        catch(e) { log("    parse err:", r.html.slice(0, 160)); }
      } else { log("    body:", r.html.slice(0, 120)); }
    } catch (e) { log("  ERR", e.message); }
  }
}

// ===== Louis Vuitton sitemap + job detail =====
{
  log("\n=== Louis Vuitton ===");
  const s = await get("https://jobs.louisvuitton.com/service-sitemap-en-sitemap_index.xml");
  log("  sitemap status:", s.status, "len:", s.html.length);
  if (s.status === 200) {
    const subs = locs(s.html);
    log("  sub-sitemaps:", subs.slice(0, 10));
  } else { log("  body:", s.html.slice(0, 200)); }
  const d = await get("https://jobs.louisvuitton.com/en/search-page/job/client-advisor-heathrow-united-kingdom-london-LVM33877");
  log("  job detail status:", d.status, "len:", d.html.length);
  const ld = [...d.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  log("  ld+json blocks:", ld.length);
  for (const m of ld) { try { const o = JSON.parse(m[1]); log("    @type:", JSON.stringify(o["@type"]), "title:", (o.title || "").slice(0, 40), "loc:", JSON.stringify(o.jobLocation)); } catch(e){ log("    parse err:", e.message, m[1].slice(0, 100)); } }
}

// ===== Michael Page JSON-LD parse =====
{
  log("\n=== Michael Page detail JSON-LD ===");
  const html = readFileSync("mp-detail.html", "utf8");
  const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ld) {
    try { const o = JSON.parse(m[1]); log("  OK @type:", JSON.stringify(o["@type"]), "title:", (o.title || "").slice(0, 40), "hiringOrg:", JSON.stringify(o.hiringOrganization?.name)); }
    catch(e) { log("  PARSE ERR:", e.message, "raw:", m[1].slice(0, 120)); }
  }
}

writeFileSync("probe3.txt", out.join("\n") + "\n");
log("=== WROTE probe3.txt ===");
