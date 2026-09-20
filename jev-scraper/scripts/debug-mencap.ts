import { Http } from "../src/fetch.js";
import { pageLinks, extractJobs } from "../src/extract.js";
const http = new Http(700, 30000);
try {
  const { body, url } = await http.html("https://jobs.mencap.org.uk/vacancies/vacancy-search-results.aspx");
  console.log("final:", url, "bytes:", body.length);
  console.log("schema jobs:", extractJobs(body, url).length);
  const links = pageLinks(body, url);
  console.log("candidate links:", links.length);
  for (const l of links.slice(0, 20)) console.log("  ", JSON.stringify(l));
} catch (e) { console.log("ERROR:", e instanceof Error ? e.message : String(e)); }
