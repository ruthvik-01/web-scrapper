import { readFileSync, writeFileSync } from "node:fs";
const out = [];
const log = (...a) => { const s = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); out.push(s); console.log(s); };

function parseLds(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results = [];
  for (const m of html.matchAll(re)) {
    try { results.push(JSON.parse(m[1])); }
    catch (e) {
      // try sanitization: strip control chars
      let cleaned = m[1].replace(/[\x00-\x1F]/g, " ").replace(/,([\s}]+)/g, "$1");
      try { results.push(JSON.parse(cleaned)); log("  (sanitized OK)"); }
      catch (e2) { log("  (sanitized also failed:", e2.message.slice(0, 60), ")"); }
    }
  }
  return results;
}
function walk(o, depth = 0, found = []) {
  if (depth > 8 || !o || typeof o !== "object") return found;
  if (Array.isArray(o)) { for (const c of o) walk(c, depth + 1, found); return found; }
  if (o["@type"] && (Array.isArray(o["@type"]) ? o["@type"].includes("JobPosting") : o["@type"] === "JobPosting" || (o["@type"]||"").includes("JobPosting"))) found.push(o);
  for (const v of Object.values(o)) walk(v, depth + 1, found);
  return found;
}

// LTF detail
{
  const html = readFileSync("ltf-detail.html", "utf8");
  log("=== LTF JSON-LD @graph JobPosting search ===");
  const lds = parseLds(html);
  log("  parsed ld blocks:", lds.length);
  for (const ld of lds) {
    const jps = walk(ld);
    log("  JobPosting nodes found:", jps.length);
    for (const jp of jps.slice(0, 2)) {
      log("   title:", (jp.title || "").slice(0, 60), "loc:", JSON.stringify(jp.jobLocation));
    }
  }
}

// MP detail
{
  const html = readFileSync("mp-detail.html", "utf8");
  log("\n=== Michael Page JSON-LD ===");
  const lds = parseLds(html);
  log("  parsed ld blocks:", lds.length);
  for (const ld of lds) {
    const jps = walk(ld);
    log("  JobPosting nodes:", jps.length);
    for (const jp of jps.slice(0, 2)) {
      log("   title:", (jp.title || "").slice(0, 60));
      log("   loc:", JSON.stringify(jp.jobLocation));
      log("   hiringOrg:", JSON.stringify(jp.hiringOrganization));
      log("   datePosted:", jp.datePosted, "validThrough:", jp.validThrough);
      log("   salary:", JSON.stringify(jp.baseSalary));
    }
  }
}

writeFileSync("ld-probe.txt", out.join("\n") + "\n");
log("=== WROTE ld-probe.txt ===");
