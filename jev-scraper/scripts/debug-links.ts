import { loadEnv } from "../src/env.js";
import { Http } from "../src/fetch.js";
import { pageLinks } from "../src/extract.js";
import { Jev } from "../src/jev.js";
import { judgeLinks } from "../src/questions.js";

loadEnv();
const url = process.argv[2] ?? "https://www.jobs.nhs.uk/xi/search_vacancy/?keyword=support%20worker";
const http = new Http(700, 30_000);
const { body, url: finalUrl } = await http.html(url);
console.log("final url:", finalUrl, "bytes:", body.length);
const links = pageLinks(body, finalUrl).slice(0, 60);
console.log("candidate links:", links.length);
for (const l of links.slice(0, 12)) console.log("  ", JSON.stringify(l));
const jev = new Jev();
const verdicts = await judgeLinks(jev, links);
for (const v of verdicts.slice(0, 15)) console.log(`  ${v.answer.choice} conf=${v.answer.confidence} :: ${v.label} :: ${v.url}`);
console.log("stats:", jev.stats());
