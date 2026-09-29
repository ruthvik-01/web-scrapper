import * as cheerio from "cheerio";

const url = "https://www.morgan-law.com/job/interim-workforce-change-er-lead-20631/";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
const html = await res.text();
console.log("Status:", res.status, "Length:", html.length);
const $ = cheerio.load(html);

console.log("Title:", $("title").text());
console.log("h1:", $("h1").text());

const ld = $("script[type='application/ld+json']").map((_, el) => $(el).html()).get();
console.log("JSON-LD scripts found:", ld.length);
for (const s of ld) {
  try {
    const parsed = JSON.parse(s);
    console.log("Parsed LD:", JSON.stringify(parsed, null, 2));
  } catch (e: any) {
    console.log("Malformed LD:", s.slice(0, 100));
  }
}

console.log("Job details elements:");
$(".job-details, .job_details, .wpjb-job, .single-job, article").each((_, el) => {
  console.log("Tag:", el.tagName, "class:", $(el).attr("class"));
});
