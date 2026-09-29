import { mkdir, writeFile } from "node:fs/promises";
import { load } from "cheerio";
import { loadCatalog } from "../server/catalog.js";
import { AccessPolicy } from "../src/crawl.js";
import { extractJobs } from "../src/extract.js";

const directory = "output/batch-2026-09-16/evidence";
await mkdir(directory, { recursive: true });
const { companies } = await loadCatalog(process.cwd());
for (const company of companies.filter(item => [4, 12, 13, 14, 15].includes(item.workbookRow))) {
  const policy = new AccessPolicy(1000, 30000);
  try {
    const page = await policy.html(company.careersUrl);
    await writeFile(`${directory}/${company.slug}-listing.html`, page.body);
    const $ = load(page.body);
    const robots = await fetch(`${new URL(company.careersUrl).origin}/robots.txt`);
    const sitemap = /^sitemap:\s*(\S+)/im.exec(await robots.text())?.[1];
    let urls: string[] = [];
    if (sitemap) {
      const maps = [sitemap];
      for (let i = 0; i < maps.length && i < 5; i++) {
        const xml = load((await policy.html(maps[i]!)).body, { xmlMode: true });
        maps.push(...xml("sitemap > loc").map((_, e) => xml(e).text()).get());
        urls.push(...xml("url > loc").map((_, e) => xml(e).text()).get());
      }
    }
    const detailUrl = urls.find(url => /\/vacancies\/\d+\//.test(url)) ||
      $("a[href]").map((_, e) => $(e).attr("href")!).get().find(url => /\/vacancies\/\d+\//.test(url));
    let detail;
    if (detailUrl) {
      const sample = await policy.html(new URL(detailUrl, company.careersUrl).href);
      await writeFile(`${directory}/${company.slug}-detail.html`, sample.body);
      detail = { url: sample.url, jobs: extractJobs(sample.body, sample.url, company.name) };
    }
    console.log(JSON.stringify({ company: company.name, slug: company.slug, title: $("title").text(), sitemap, urls: urls.length, detail }));
  } catch (error) { console.log(JSON.stringify({ company: company.name, error: String(error) })); }
}
