import { readFile, mkdir, writeFile } from "node:fs/promises";
import { validateCompanies } from "../src/companies.js";
const audit = new URL("../docs/universal-audit/", import.meta.url);
const configs = JSON.parse(await readFile(new URL("uk-only-candidates.json", audit), "utf8")) as Record<string, unknown>[];
const scope = JSON.parse(await readFile(new URL("uk-scope-check.json", audit), "utf8")) as { results: { slug: string; name: string; platform: string; sourceUrl: string; reason: string; status: string }[] };
const companies = validateCompanies(configs.map(config => {
  const result = scope.results.find(item => item.slug === config.slug)!;
  return { ...config, platform: result.platform === "Comeet" ? "comeet" : result.platform === "Jobtrain" ? "jobtrain" : "eploy", country: "UK" };
}));
if (companies.length !== 45 || scope.results.filter(item => item.status === "held-for-review").length !== 30) throw new Error("Frozen audit scope changed; review before rebuilding catalog.");
const target = new URL("../config/", import.meta.url); await mkdir(target, { recursive: true });
await writeFile(new URL("companies.json", target), JSON.stringify(companies, null, 2) + "\n");
await writeFile(new URL("companies-held.json", target), JSON.stringify(scope.results.filter(item => item.status === "held-for-review").map(({ slug, name, platform, sourceUrl, reason }) => ({ slug, name, platform, sourceUrl, reason,
  requiredToMigrate: "Resolve blocker, verify employer/source and role UK evidence, implement TypeScript, pass old/new regressions and request migration approval." })), null, 2) + "\n");
console.log("Catalog: 45 candidates, 30 held; UTF-8 preserved.");
