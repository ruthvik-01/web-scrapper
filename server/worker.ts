import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrapeWebsite } from "../src/strategy.js";
import type { CompanyConfig } from "../src/company-runner.js";
import { outputCsv, outputRows } from "../src/output.js";
import type { Company } from "./catalog.js";

let finished = false;
process.on("disconnect", () => { if (!finished) process.exit(1); });

type SiteConfig = CompanyConfig & Pick<Company, "mode" | "apiUrl" | "selectors" | "maxPages" | "renderWaitMs">;
export async function prepareCode(root: string, directory: string, config: SiteConfig): Promise<void> {
  const code = resolve(directory, "code");
  await mkdir(resolve(code, "src"), { recursive: true });
  for (const name of await readdir(resolve(root, "src"))) {
    if (name.endsWith(".ts")) await copyFile(resolve(root, "src", name), resolve(code, "src", name));
  }
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  await writeFile(resolve(code, "package.json"), JSON.stringify({
    ...pkg, scripts: { scrape: "tsx scrape.ts", typecheck: "tsc --noEmit" },
  }, null, 2));
  await copyFile(resolve(root, "package-lock.json"), resolve(code, "package-lock.json"));
  const tsconfig = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
  await writeFile(resolve(code, "tsconfig.json"), JSON.stringify({ ...tsconfig, include: ["scrape.ts", "src/**/*.ts"] }, null, 2));
  const entry = [
    'import { dirname, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import { writeFile } from "node:fs/promises";',
    'import { scrapeWebsite } from "./src/strategy.js";',
    'import { outputRows, outputCsv } from "./src/output.js";',
    `const company = ${JSON.stringify(config, null, 2)};`,
    'const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");',
    '  const result = await scrapeWebsite(company.careersUrl, { ...company, company: company.name });',
    '  const rows = outputRows(result, company.name);',
    '  await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows));',
    '  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2));',
    '  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(result.report, null, 2));',
    '  if (["partial", "unsupported"].includes(result.report.status)) process.exitCode = 2;',
  ].join("\n");
  await writeFile(resolve(code, "scrape.ts"), entry + "\n");
  await writeFile(resolve(directory, "README.md"), `# ${config.name}\n\nRun \`npm ci\` and \`npm run scrape\` inside \`code/\`. For DOM/browser fallback, also run \`npx playwright install chromium\`.\n\nMode: ${config.mode || "auto"}. The CSV has 15 columns. Missing fields are empty. Absent posting dates use the current UK run day with disclosure in scrape-report.json. Review source-location notes before using uncertain city/state values. Public sources only: access restrictions and unsupported schemas are reported, not bypassed.\n\nSource: ${config.careersUrl}\n`);
}

async function work(root: string, directory: string, company: Company) {
  console.log(`Checking the public source for ${company.name}…`);
  const config: SiteConfig = {
    name: company.name, slug: company.slug, workbookRow: company.workbookRow,
    careersUrl: company.careersUrl, sitemapUrl: company.sitemapUrl,
    mode: company.mode || "auto", apiUrl: company.apiUrl || "", selectors: company.selectors || {},
    maxPages: company.maxPages || 250, renderWaitMs: company.renderWaitMs ?? 1500,
  };
  await mkdir(directory, { recursive: true });
  await prepareCode(root, directory, config);
  const result = await scrapeWebsite(company.careersUrl, { ...config, company: company.name });
  const rows = outputRows(result, company.name);
  await writeFile(resolve(directory, "jobs.csv"), outputCsv(rows));
  await writeFile(resolve(directory, "export-rows.json"), JSON.stringify(rows, null, 2));
  await writeFile(resolve(directory, "scrape-report.json"), JSON.stringify(result.report, null, 2));
  await writeFile(resolve(directory, "scrape-result.json"), JSON.stringify(result, null, 2));
  return {
    company: company.name, slug: company.slug, status: result.report.status,
    sourceUrl: company.careersUrl, scrapedAt: result.report.scrapedAt,
    process: result.report.process, pagesRead: result.report.pagesVisited,
    jobs: new Set(result.rows.map(row => row.jobId)).size, locationRows: result.rows.length,
    reviewNotes: result.report.dataNotes.length, postingDateFallbacks: result.report.dateFallbacks.length,
    excluded: result.report.skipped.length, issues: result.report.issues.length,
  };
}

if (process.argv[2]) {
  const { root, directory, company } = JSON.parse(process.argv[2]) as { root: string; directory: string; company: Company };
  work(root, directory, company).then(summary => {
    finished = true;
    process.send?.({ type: "result", summary });
    process.disconnect?.();
  }).catch(error => {
    finished = true;
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    process.disconnect?.();
  });
}
