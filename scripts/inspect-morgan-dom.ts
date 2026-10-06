import * as cheerio from "cheerio";

const url = "https://www.morgan-law.com/job/interim-workforce-change-er-lead-20631/";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
const $ = cheerio.load(html);

console.log("Job item text:");
$(".job-item, .job-details, .entry-content, .job-meta").each((_, el) => {
  console.log("Class:", $(el).attr("class"));
  console.log("Text:", $(el).text().slice(0, 500));
});

console.log("\nMeta/Badges/Details:");
$("ul.job-meta li, .job-details-list li, .badge, .meta-item, [class*='location'], [class*='salary']").each((_, el) => {
  console.log($(el).attr("class"), "-->", $(el).text().trim());
});
