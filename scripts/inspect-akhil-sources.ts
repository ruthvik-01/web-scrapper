import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import { AccessPolicy } from "../src/crawl.js";
import { extractJobs } from "../src/extract.js";

const targets: { slug: string; url: string; timeoutMs?: number }[] =
  JSON.parse(await readFile(process.argv[2]!, "utf8"));
const directory = resolve("output/akhil-ruthvik-2026-09-18/research");
await mkdir(directory, { recursive: true });
for (const target of targets) {
  const path = resolve(directory, target.slug);
  await mkdir(path, { recursive: true });
  try {
    const policy = new AccessPolicy(1000, target.timeoutMs || 120000);
    const page = await policy.html(target.url);
    const $ = load(page.body);
    const links = $("a[href],iframe[src]").toArray().map(node => ({
      text: $(node).text().replace(/\s+/g, " ").trim(),
      href: new URL($(node).attr("href") || $(node).attr("src")!, page.url).href,
    })).filter(link => /career|vacan|jobs?|recruit|opportunit|work with|join us/i.test(link.text + " " + link.href));
    const scripts = $("script[src]").map((_, node) => $(node).attr("src")).get();
    $("script,style,nav,header,footer").remove();
    const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
    const summary = {
      input: target.url, url: page.url, fetchedAt: new Date().toISOString(),
      title: $("title").text(), links, scripts,
      structuredJobs: extractJobs(page.body, page.url).map(j => ({ title: j.title, url: j.jobUrl })),
      text,
    };
    await writeFile(resolve(path, "page.html"), page.body);
    await writeFile(resolve(path, "inspection.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ slug: target.slug, url: page.url, title: summary.title, links: links.slice(0, 30), text: text.slice(0, 1000) }));
  } catch (error) {
    const summary = { input: target.url, error: String(error), fetchedAt: new Date().toISOString() };
    await writeFile(resolve(path, "inspection.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ slug: target.slug, ...summary }));
  }
}
