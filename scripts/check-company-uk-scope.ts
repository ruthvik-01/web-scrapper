import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Offline checks against each company's actual normalizer. No scraper entrypoints
// are imported: some of them overwrite dated deliveries as a side effect.
const root = resolve(import.meta.dirname, "../..");
const auditDirectory = resolve(root, "web_scrapper_project/docs/universal-audit");
const directory = resolve(root, "web_scrapper_project/docs/universal-implementation/uk-regression");
mkdirSync(directory, { recursive: true });
interface Company {
  slug: string;
  name: string;
  sourceUrl: string;
  platform: string;
  architecture: string;
  config: Record<string, unknown>;
  sourceFiles: string[];
  missingRelativeImports: { file: string; specifier: string }[];
}
const inventory: Company[] = JSON.parse(readFileSync(resolve(auditDirectory, "company-inventory.json"), "utf8"));
const date = new Date("2026-10-05T05:00:00Z");
const job = {
  jobId: "uk-scope-fixture", title: "Software Engineer",
  description: "Develop and maintain software applications. Collaborate with the engineering team and review code. Deliver reliable services and investigate production defects.",
  jobUrl: "https://example.org/jobs/uk-scope-fixture", company: "Fixture Employer",
  postedDate: "2026-10-01", locations: [],
};
const cases = [
  { name: "explicit GB", location: { country: "GB", city: "London" }, accepted: true },
  { name: "explicit UK", location: { country: "UK" }, accepted: true },
  { name: "explicit United Kingdom", location: { country: "United Kingdom" }, accepted: true },
  ...["England", "Scotland", "Wales", "Northern Ireland"].map(country => ({ name: country, location: { country }, accepted: true })),
  { name: "UK in role location", location: { location: "London, United Kingdom" }, accepted: true },
  { name: "foreign London", location: { city: "London", country: "CA" }, accepted: false },
  { name: "foreign overrides UK label", location: { location: "London, UK", country: "US" }, accepted: false },
  { name: "Germany", location: { country: "Germany" }, accepted: false },
  { name: "unknown city only", location: { city: "London" }, accepted: false },
  { name: "unscoped remote", location: { location: "Remote" }, accepted: false },
  { name: "unknown location", location: {}, accepted: false },
];
interface ScopeResult {
  slug: string; name: string; platform: string; sourceUrl: string;
  status: string; reason: string; normalizerChecks: number; failures: string[];
  normalizer: string | undefined;
}
const results: ScopeResult[] = [];
for (const company of inventory) {
  const framework = ["copied modular framework", "copied sitemap framework"].includes(company.architecture);
  let checks = 0;
  const failures: string[] = [];
  const normalizer = company.sourceFiles.find(file => /(?:^|\/)src\/normalize\.ts$/.test(file));
  if (framework && normalizer) {
    try {
      const { normalizeJobs } = await import(pathToFileURL(resolve(root, normalizer)).href);
      for (const sample of cases) {
        checks++;
        const result = normalizeJobs([{ ...job, locations: [sample.location] }], date);
        try {
          assert.equal(result.rows.length > 0, sample.accepted);
          assert.ok(result.rows.every((row: { country: string }) => row.country === "UK" || row.country === "United Kingdom"));
        } catch { failures.push(sample.name); }
      }
      checks++;
      const mixed = normalizeJobs([{ ...job, locations: [{ city: "London", country: "GB" }, { city: "Berlin", country: "DE" }] }], date);
      if (mixed.rows.length !== 1 || mixed.rows[0]?.city !== "London") failures.push("mixed UK and foreign locations");
    } catch (error) { failures.push(`Normalizer import/check failed: ${String(error)}`); }
  }
  let status = framework && checks === 15 && !failures.length ? "uk-filter-checked" : "held-for-review";
  let reason = status === "uk-filter-checked"
    ? "Actual normalizer passed UK acceptance, foreign/unknown rejection, mixed-location checks. Live source and full extraction are not verified."
    : "No equivalent deterministic UK gate verified for this implementation; do not run or migrate automatically.";
  if (company.missingRelativeImports.length) {
    status = "held-for-review";
    reason = "Broken relative imports; UK normalizer checks do not prove launcher works.";
  }
  if (["alice", "classiq", "persivalenic"].includes(company.slug)) {
    status = "held-for-review";
    reason = "Known supplied-company identity mismatch or demo board; UK filtering alone does not validate source identity.";
  }
  if (company.slug === "mayra-property-services") reason = "Supplied board identifies a German employer; weak city/substring UK matching; source identity unresolved.";
  if (company.slug === "oliver-roberts-ltd") reason = "Identity investigation/report, not a job scraper; no verified careers source.";
  if (["prdc-dental", "prince-of-wales-medical-centre"].includes(company.slug)) reason = "Folder has no scraper source; its historical metadata is not a runnable UK scraper.";
  if (company.slug === "mber-london") reason = "Placeholder always returns []; historical zero jobs does not establish current UK scraping support; missing types import.";
  if (company.slug === "mountain-healthcare-ltd") reason = "Saved-data exporter for Occy; appends UK country to historical rows, not a verified live UK scraper.";
  if (["mega-food-centre", "sjc-partners", "no35-mackenzie-walk", "northwood-hygiene-products-limited", "pinpoint-group-recruitment-ltd", "ppghealthinjusticeweb"].includes(company.slug)) reason = "Company-specific UK assignment/place assumptions need review; no generic foreign/unknown rejection proof. Preserve source, hold automatic migration.";
  if (company.architecture === "legacy JEV framework") reason = "Rejects explicit foreign country, but may accept model uk_location probability >= 0.5 without independent source proof; hold strict UK-only migration.";
  if (["pgs-ltd", "pinpoint-resourcing-ltd", "operations-resources-limited", "rodericks-dental-partners"].includes(company.slug)) reason = "Source inspection found explicit country/postcode checks, but Python/historical snapshot implementation needs TypeScript migration and offline regression proof first.";
  if (["p-ducker-systems-ltd", "partnering-health-ltd"].includes(company.slug)) reason = "Historical Python exporter with company/role-specific UK place clauses; preserve evidence, require TypeScript UK rejection/regression checks.";
  results.push({ slug: company.slug, name: company.name, platform: company.platform, sourceUrl: company.sourceUrl, status, reason, normalizerChecks: checks, failures, normalizer });
}
const counts = {
  companyFolders: results.length,
  normalizersChecked: results.filter(result => result.normalizerChecks === 15).length,
  assertions: results.reduce((sum, result) => sum + result.normalizerChecks, 0),
  failures: results.flatMap(result => result.failures).length,
  eligibleForUkOnlyMigration: results.filter(result => result.status === "uk-filter-checked").length,
  held: results.filter(result => result.status !== "uk-filter-checked").length,
  liveCompaniesTested: 0,
};
const { normalizeJobs: currentNormalize } = await import("../src/normalize.js");
const currentFailures: string[] = [];
for (const sample of cases) {
  const result = currentNormalize([{ ...job, locations: [sample.location] }], date);
  if ((result.rows.length > 0) !== sample.accepted || result.rows.some(row => row.country !== "UK")) currentFailures.push(sample.name);
}
const mixedCurrent = currentNormalize([{ ...job, locations: [{ city: "London", country: "GB" }, { city: "Berlin", country: "DE" }] }], date);
if (mixedCurrent.rows.length !== 1 || mixedCurrent.rows[0]?.city !== "London") currentFailures.push("mixed UK and foreign locations");
writeFileSync(resolve(directory, "current-normalizer.json"), JSON.stringify({ assertions: cases.length + 1, failures: currentFailures }, null, 2) + "\n");
writeFileSync(resolve(directory, "uk-scope-check.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "Offline normalizer tests and source review; not live vacancy verification", counts, results }, null, 2) + "\n");
writeFileSync(resolve(directory, "uk-only-candidates.json"), JSON.stringify(inventory.filter(company => results.find(result => result.slug === company.slug)?.status === "uk-filter-checked").map(company => company.config), null, 2) + "\n");
const markdown = [
  "# UK-only company scraper check", "",
  "Checked every supplied company folder. These checks verify normalizer behavior; they do not establish current vacancies or whole-scraper completeness. Global employers are eligible only for their UK-based roles. Unknown locations and overseas roles must be excluded. NHS Jobs remains excluded.", "",
  `- Folders: ${counts.companyFolders}; normalizers checked: ${counts.normalizersChecked}; cases executed: ${counts.assertions}; failures: ${counts.failures}.`,
  `- UK-filter-checked migration candidates: ${counts.eligibleForUkOnlyMigration}; held: ${counts.held}; live companies tested: 0.`,
  "- Candidates are audit scope only. They must pass end-to-end regression and the shared UK evidence gate before production cutover.", "",
  "| Company / folder | Platform | Migration scope | UK evidence / limitation |",
  "|---|---|---|---|",
  ...results.map(result => `| ${result.name} / ${result.slug} | ${result.platform} | ${result.status} | ${result.reason} |`),
  "", "## Reproduce", "", "From web_scrapper_project: `node --import tsx scripts/check-company-uk-scope.ts`.",
];
writeFileSync(resolve(directory, "uk-scope-check.md"), markdown.join("\n") + "\n");
const migration = [
  "# Proposed migration map — every supplied company", "",
  "No company has been cut over. Engines below are proposals; held companies are excluded from the candidate catalog. The existing source configuration is evidence, not a new implemented config file.", "",
  "| Company | Old scraper / entrypoint | Platform | Proposed engine | Existing config evidence | Status |",
  "|---|---|---|---|---|---|",
  ...inventory.map(company => {
    const entry = typeof company.config.codeFile === "string" ? `companies code/${company.slug}/${company.config.codeFile}`
      : company.sourceFiles.find(file => file === `companies code/${company.slug}/scrape.ts`) ?? company.sourceFiles.find(file => /\/scrape[^/]*\.ts$/.test(file)) ?? "No scraper entrypoint";
    const engine = company.platform === "Comeet" ? "Existing comeet.ts"
      : company.platform.startsWith("Eploy") ? "Existing sitemap.ts + extract.ts"
      : company.platform === "Jobtrain" ? "Existing jobtrain.ts" : "Specialized strategy; further review";
    const status = results.find(result => result.slug === company.slug)?.status;
    return `| ${company.name} | ${entry} | ${company.platform} | ${engine} | companies code/${company.slug}/company.json${Object.keys(company.config).length ? "" : " (absent; entrypoint constants)"} | ${status}; not migrated |`;
  }),
];
writeFileSync(resolve(directory, "migration-map.md"), migration.join("\n") + "\n");
console.log(JSON.stringify(counts, null, 2));
console.log(JSON.stringify({ currentNormalizerAssertions: cases.length + 1, currentFailures }));
if (counts.failures || currentFailures.length) process.exitCode = 1;
