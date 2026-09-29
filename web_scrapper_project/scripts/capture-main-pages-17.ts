import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AccessPolicy } from "../src/crawl.js";

const root = resolve(import.meta.dirname, "..");
const input = resolve(root, "output/batch 17-9-2026/company-names-corrected");
const out = resolve(root, "output/_history/batch-17-main-page-review");
const companies = JSON.parse(await readFile(resolve(input,"code/universal_scraper/companies.json"),"utf8"));
await mkdir(out,{recursive:true});
await Promise.all(companies.map(async (c: {slug:string;careersUrl:string}) => {
  const rows = JSON.parse(await readFile(resolve(input,"jobs company wise",c.slug,"export-rows.json"),"utf8"));
  const policy = new AccessPolicy(1000,15000);
  const folder = resolve(out,c.slug);
  await mkdir(folder,{recursive:true});
  for (const row of rows.filter((r:{jobId:string})=>r.jobId)) {
    const file=resolve(folder,`${row.jobId}.json`);
    try { const saved=JSON.parse(await readFile(file,"utf8")); if(saved.status==="read") continue; } catch { /* No successful checkpoint */ }
    // Public company domains publish these same vacancy paths in their sitemaps.
    const target = new URL(row.jobUrl);
    if (["news-uk","tower-hamlets"].includes(c.slug)) target.host=new URL(c.careersUrl).host;
    try {
      const page = await policy.html(target.href);
      await writeFile(resolve(folder,`${row.jobId}.html`),page.body);
      await writeFile(file,JSON.stringify({jobId:row.jobId,originalUrl:row.jobUrl,url:page.url,checkedAt:new Date().toISOString(),status:"read"},null,2));
      console.log(`${c.slug} ${row.jobId}: read`);
    } catch(e) {
      await writeFile(file,JSON.stringify({jobId:row.jobId,url:target.href,checkedAt:new Date().toISOString(),status:"unavailable",error:String(e)},null,2));
      console.log(`${c.slug} ${row.jobId}: ${String(e)}`);
    }
  }
}));
console.log("ALL MAIN-PAGE CHECKS FINISHED");
