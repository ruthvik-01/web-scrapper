import { loadEnv } from "../src/env.js";
import { Jev } from "../src/jev.js";
import { judgeJob } from "../src/questions.js";

loadEnv();
const jev = new Jev();
if (!jev.live) {
  console.error("TYPESAFE_API_KEY not set. Add it to jev-scraper/.env.");
  process.exit(2);
}

const started = Date.now();
const { answers, tokens } = await judgeJob(jev, {
  title: "Support Worker",
  locationText: "Manchester, England",
  dateText: "Posted 12 days ago",
  salaryText: "£24,500 - £26,000 per annum",
  body: "We are looking for a Support Worker in Manchester. You must already have the right to work in the UK; we cannot offer sponsorship. This is a full-time, permanent, hybrid role with two days on site.",
});
const ms = Date.now() - started;
console.log(`latency: ${ms}ms, input tokens: ${tokens}`);
for (const [key, answer] of Object.entries(answers)) {
  if (answer.type === "boolean") console.log(`${key}: probability=${answer.probability}`);
  else if (answer.type === "choice") console.log(`${key}: choice=${answer.choice} (confidence=${answer.confidence})`);
  else console.log(`${key}: score=${answer.score}`);
}
console.log("stats:", jev.stats());
