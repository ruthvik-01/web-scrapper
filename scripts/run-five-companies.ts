import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCompany, type CompanyConfig } from "../src/company-runner.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "output");
// Selected by the user; Malmaison is deliberately NOT included (already taken).
const companies: CompanyConfig[] = [
  { name: "MWH Treatment", slug: "mwh-treatment", workbookRow: 2,
    careersUrl: "https://careers.mwhtreatment.com/vacancies/vacancy-search-results.aspx",
    sitemapUrl: "https://careers.mwhtreatment.com/sitemap.xml" },
  { name: "Thinking Schools Academy Trust", slug: "thinking-schools-academy-trust", workbookRow: 6,
    careersUrl: "https://careers.tsatrust.org.uk/vacancies/vacancy-search-results.aspx",
    sitemapUrl: "https://careers.tsatrust.org.uk/sitemap.xml" },
  { name: "Walkers — Walker's Shortbread", slug: "walkers-shortbread", workbookRow: 18,
    careersUrl: "https://careers.walkersshortbread.com/vacancies/vacancy-search-results.aspx",
    sitemapUrl: "https://careers.walkersshortbread.com/sitemap.xml" },
  { name: "Guide Dogs", slug: "guide-dogs", workbookRow: 10,
    careersUrl: "https://careers.guidedogs.org.uk/vacancies/vacancy-search-results.aspx",
    sitemapUrl: "https://careers.guidedogs.org.uk/sitemap.xml" },
  { name: "Alzheimer's Society", slug: "alzheimers-society", workbookRow: 7,
    careersUrl: "https://careers.alzheimers.org.uk/vacancies/vacancy-search-results.aspx",
    sitemapUrl: "https://careers.alzheimers.org.uk/sitemap.xml" },
];
await mkdir(resolve(output, "_tracking"), { recursive: true });
const manifest = companies.map(company => ({ ...company, status: "selected" }));
await writeFile(resolve(output, "_tracking/selected-companies.json"), JSON.stringify(manifest, null, 2));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const tsconfig = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
const sourceFiles = (await readdir(resolve(root, "src"))).filter(name => name.endsWith(".ts"));
for (const company of companies) {
  const directory = resolve(output, company.slug);
  const code = resolve(directory, "code");
  await mkdir(resolve(code, "src"), { recursive: true });
  for (const file of sourceFiles) await copyFile(resolve(root, "src", file), resolve(code, "src", file));
  await copyFile(resolve(root, "package-lock.json"), resolve(code, "package-lock.json"));
  await writeFile(resolve(code, "package.json"), JSON.stringify({
    ...packageJson, scripts: { scrape: "tsx scrape.ts", typecheck: "tsc --noEmit" },
  }, null, 2) + "\n");
  await writeFile(resolve(code, "tsconfig.json"), JSON.stringify({
    ...tsconfig, include: ["scrape.ts", "src/**/*.ts"],
  }, null, 2) + "\n");
  await writeFile(resolve(code, "scrape.ts"), [
    'import { dirname, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import { runCompany } from "./src/company-runner.js";',
    "",
    `const company = ${JSON.stringify(company, null, 2)};`,
    'const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
    "const summary = await runCompany(company, directory);",
    'if (summary.status === "partial" || summary.status === "unsupported") process.exitCode = 2;',
    "",
  ].join("\n"));
  await writeFile(resolve(directory, "README.md"), `# ${company.name}

Workbook source: COMPANIE LIST.xlsx, Sheet1 row ${company.workbookRow}.

- \`jobs.csv\`: latest 15-column CSV; ats is Custom and diagnostics are in scrape-report.json.
- \`code/\`: complete runnable TypeScript source, package manifest and lockfile.
- \`export-rows.json\`: the same output data in JSON.
- \`scrape-report.json\`: counts, exclusions, posting-date fallbacks and errors.
- \`scrape-result.json\`: raw structured records plus normalized rows for audit.

## Run this company independently

Open a terminal in this folder:

\`\`\`powershell
cd code
npm ci
npm run scrape
\`\`\`

The script writes fresh output into the parent company folder. No API key is needed.
This company uses STATIC public sitemap/job-page extraction plus the public Postcodes.io API for address verification; Chromium installation is not needed for this path.

UK locations only. Known posting dates must be within the inclusive last two calendar months.
If the source posting date is absent, use this invocation's current Europe/London date and record the fallback in \`report.dateFallbacks\`.
Other missing fields are empty, not NULL. Present but invalid dates are excluded.
Multi-location jobs have one row per UK location, preserving shared job fields.
Visible job locations take priority over conflicting structured office addresses. Verified postcode/place context is recorded in the report. Ambiguous locations retain the source label and are flagged in the report; missing city/state values are not guessed. State means source county or a verified county/unitary district, not necessarily a ceremonial county.

Source careers page: ${company.careersUrl}
Public sitemap: ${company.sitemapUrl}
`);
}

type Summary = Awaited<ReturnType<typeof runCompany>>;
const summaries: Summary[] = [];
const failures: { company: string; error: string }[] = [];
// Two independent hosts at a time; requests to each company remain sequential/paced.
let next = 0;
async function worker(): Promise<void> {
  while (next < companies.length) {
    const company = companies[next++]!;
    try {
      const summary = await runCompany(company, resolve(output, company.slug));
      summaries.push(summary);
      manifest.find(item => item.slug === company.slug)!.status = summary.status === "ok" || summary.status === "no_matches" ? "completed" : "needs-review";
    } catch (error) {
      failures.push({ company: company.name, error: String(error) });
      manifest.find(item => item.slug === company.slug)!.status = "failed";
    }
  }
}
await Promise.all([worker(), worker()]);
await writeFile(resolve(output, "_tracking/selected-companies.json"), JSON.stringify(manifest, null, 2));
summaries.sort((a, b) => companies.findIndex(c => c.slug === a.slug) - companies.findIndex(c => c.slug === b.slug));
await writeFile(resolve(output, "_tracking/completed-companies.json"), JSON.stringify({ summaries, failures }, null, 2));
const columns = ["company", "status", "process", "pagesRead", "advertisedJobs", "jobs", "locationRows", "postingDateFallbacks", "reviewNotes", "excluded", "issues", "csv", "code"] as const;
const quote = (value: unknown): string => `"${String(value).replace(/"/g, '""')}"`;
await writeFile(resolve(output, "completed-companies.csv"), "\uFEFF" + [
  columns.join(","), ...summaries.map(summary => columns.map(column => quote(summary[column])).join(",")),
].join("\r\n") + "\r\n");
// Preserve the previous download path, now reflecting the user's revised rules.
if (summaries.some(summary => summary.slug === "mwh-treatment")) {
  await copyFile(resolve(output, "mwh-treatment/jobs.csv"), resolve(output, "mwh-treatment/MWH_Treatment_UK_Jobs_2026-09-15.csv"));
}
console.log(JSON.stringify({ summaries, failures }, null, 2));
if (failures.length || summaries.some(summary => summary.status === "partial")) process.exitCode = 2;
