import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { OUTPUT_COLUMNS, outputCsv, type OutputRow } from "../src/output.js";
import { matchesCompanyTitle, type BatchCompany } from "../src/batch.js";

const root = resolve(import.meta.dirname, "..");

/** Assemble saved exports only: never invokes scraping or changes input exports. */
export async function packageBatch(directory: string, manifest: string) {
  directory = resolve(directory);
  manifest = resolve(manifest);
  const companies: BatchCompany[] = JSON.parse(await readFile(manifest, "utf8"));
  assert.ok(Array.isArray(companies) && companies.length > 0, "The company manifest must be a nonempty array.");
  const slugs = new Set<string>();
  for (const company of companies) {
    assert.ok(company && typeof company.name === "string" && company.name.trim()
      && typeof company.slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(company.slug)
      && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(company.slug)
      && !slugs.has(company.slug), "Each company needs a name and a unique safe folder slug.");
    slugs.add(company.slug);
  }
  const combined: OutputRow[] = [];
  const checks = [];
  const stamp = new Date().toISOString();
  // Only explicitly selected/generated files enter the delivery. Never walk old code/,
  // runs/, logs, node_modules, caches, or previous validation/test output.
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, text: string) => { files[name] = Buffer.from(text); };
  const copy = async (name: string, source: string) => { files[name] = await readFile(source); };
  const optionalCopy = async (name: string, source: string) => {
    try { await copy(name, source); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  };

  for (const company of companies) {
    const source = resolve(directory, company.slug);
    const rows: OutputRow[] = JSON.parse(await readFile(resolve(source, "export-rows.json"), "utf8"));
    const report = JSON.parse(await readFile(resolve(source, "scrape-report.json"), "utf8"));
    assert.ok(Array.isArray(rows), `${company.slug}: expected an array of job rows`);
    assert.equal(await readFile(resolve(source, "jobs.csv"), "utf8"), outputCsv(rows));
    const seen = new Set<string>();
    const jobUrls = new Map<string, string>();
    const jobs = rows.filter(row => row.jobId);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row), [...OUTPUT_COLUMNS]);
      assert.ok(Object.values(row).every(value => typeof value === "string"));
      if (row.jobId) {
        assert.equal(row.ats, "Custom");
        assert.equal(row.country, "UK");
        assert.equal(row.location, [row.city, row.state, row.country].filter(Boolean).join(", "));
        assert.ok(!row.salaryRange || /^£\d+(?:\.\d+)?(?:-£\d+(?:\.\d+)?)?$/.test(row.salaryRange));
        assert.ok(Object.values(row).every(value => value !== "NULL"));
        assert.ok(row.title && row.description && row.company && row.jobUrl);
        assert.ok(matchesCompanyTitle(row.title, company), `Outside title scope: ${row.jobId}`);
        assert.ok(!jobUrls.has(row.jobId) || jobUrls.get(row.jobId) === row.jobUrl, `Vacancy ID reused for different jobs: ${row.jobId}`);
        jobUrls.set(row.jobId, row.jobUrl);
        if (row.postedDate) {
          assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.postedDate)
            && !Number.isNaN(Date.parse(row.postedDate))
            && new Date(row.postedDate).toISOString().slice(0, 10) === row.postedDate,
          `Invalid postedDate: ${row.jobId}`);
          assert.ok(row.postedDate >= report.window.from && row.postedDate <= report.window.to,
            `postedDate outside reporting window: ${row.jobId}`);
        } else {
          assert.ok(row.jdDeadline.trim(), `Missing postedDate without deadline: ${row.jobId}`);
        }
        if (company.exportCompanyName) assert.equal(row.company, company.exportCompanyName, "Unexpected exported company name");
        if (company.employerNames) {
          const names = company.exportCompanyName ? report.exportCompanyIdentity?.sourceNames : [row.company];
          assert.ok(Array.isArray(names) && names.length > 0 && names.every((name: string) =>
            company.employerNames!.some(allowed => allowed.toLowerCase() === name.toLowerCase())));
        }
        const key = JSON.stringify(row);
        assert.ok(!seen.has(key), `Duplicate exported row: ${row.jobId}`);
        seen.add(key);
      } else {
        assert.fail("Diagnostic rows are not jobs; keep company outcomes in reports.");
      }
    }
    assert.equal(jobs.length, report.rows);
    combined.push(...rows);
    const folder = `code/${company.slug}`;
    const results = `jobs company wise/${company.slug}`;
    put(`${folder}/company.json`, JSON.stringify(company, null, 2));
    put(`${folder}/package.json`, JSON.stringify({
      private: true, type: "module",
      scripts: { scrape: "node ../universal_scraper/node_modules/tsx/dist/cli.mjs scrape.ts" },
    }, null, 2));
    put(`${folder}/scrape.ts`, [
      'import { readFile } from "node:fs/promises";',
      'import { resolve } from "node:path";',
      'import { runBatch, type BatchCompany } from "../universal_scraper/src/batch.js";',
      'const config: BatchCompany = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));',
      'const directory = resolve(import.meta.dirname, "runs", new Date().toISOString().replace(/[:.]/g, "-"));',
      'const report = await runBatch([config], directory);',
      'if (report.some(item => ["failed", "partial", "unsupported"].includes(String(item.status)))) process.exitCode = 2;',
    ].join("\n") + "\n");
    for (const name of ["jobs.csv", "export-rows.json", "scrape-report.json"]) {
      await copy(`${results}/${name}`, resolve(source, name));
    }
    await optionalCopy(`${results}/scrape-result.json`, resolve(source, "scrape-result.json"));
    const readme = `# ${company.name}\n\nSource: ${company.careersUrl}\n\n${company.sourceNote || ""}\n\n## Run\n\nRequires Node.js 22 or later. In \`code/universal_scraper\`, run \`npm ci\` and \`npx playwright install chromium\` once. Then in \`code/${company.slug}\`, run \`npm run scrape\`. Keep both folders together: this wrapper imports the shared framework; no per-company dependency install is needed. Each rerun writes a dated \`runs/\` folder beside the wrapper without overwriting delivered outputs. Edit the wrapper's \`company.json\` for extraction settings.\n\n## Delivered result\n\nOutputs are in \`jobs company wise/${company.slug}/\` at the delivery root. Status: **${report.status}**. ${jobs.length} UK location rows / ${new Set(jobs.map(row => row.jobId)).size} jobs. ${report.skipped.length} source records excluded; ${report.issues.length} extraction issues. Review the company's \`scrape-report.json\` before use. Zero qualifying jobs produce a header-only CSV and an empty JSON array; company outcomes remain in reports.\n\n15 columns; ATS is Custom on job rows. Missing data stays empty. Present posting dates must be within the inclusive two-calendar-month window. A missing posted date stays empty when a deadline is present; only when both dates are missing is the run's UK calendar date used, disclosed in the report. Present invalid dates are excluded. The source workbook's completion colours were not changed.\n`;
    const deliveryReadme = report.dateBasis
      ? readme.replace(
        "Present posting dates must be within the inclusive two-calendar-month window. A missing posted date stays empty when a deadline is present; only when both dates are missing is the run's UK calendar date used, disclosed in the report. Present invalid dates are excluded.",
        "Per user instruction, postedDate contains the Europe/London calendar date of Comeet time_updated (last modification, not publication). The inclusive two-calendar-month window applies to this update date. Missing or invalid updates are excluded, never replaced with the scrape date. Exact timestamps and source is_remote/employment_type/workplace_type fields are retained in scrape-report.json. Explicit workplace labels take precedence over the remote boolean; missing employment types stay empty.",
      )
      : readme;
    put(`${folder}/README.md`, deliveryReadme);
    put(`${results}/README.md`, deliveryReadme);
    checks.push({
      company: company.name, slug: company.slug, status: report.status, rows: jobs.length,
      jobs: new Set(jobs.map(row => row.jobId)).size, columns: OUTPUT_COLUMNS.length,
      excluded: report.skipped.length, scopeExcluded: report.scopeExcluded?.length || 0,
      issues: report.issues.length, limited: report.limited,
      csvSha256: createHash("sha256").update(outputCsv(rows)).digest("hex"),
    });
  }
  const universal = "code/universal_scraper";
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const tsconfig = JSON.parse(await readFile(resolve(root, "tsconfig.json"), "utf8"));
  for (const name of await readdir(resolve(root, "src"))) {
    if (name.endsWith(".ts")) await copy(`${universal}/src/${name}`, resolve(root, "src", name));
  }
  for (const name of ["scraper.ts", "batch.ts", "package-lock.json"]) {
    await copy(`${universal}/${name}`, resolve(root, name));
  }
  put(`${universal}/package.json`, JSON.stringify({
    ...pkg, scripts: {
      scrape: "tsx scraper.ts", batch: "tsx batch.ts",
      test: "tsx --test tests/*.test.ts", "test:browser": "tsx --test tests/*.integration.ts",
      typecheck: "tsc --noEmit",
    },
  }, null, 2));
  put(`${universal}/tsconfig.json`, JSON.stringify({
    ...tsconfig, include: ["scraper.ts", "batch.ts", "src/**/*.ts", "tests/**/*.ts", "../*/scrape.ts"],
  }, null, 2));
  await copy(`${universal}/companies.json`, manifest);
  await copy(`${universal}/README.md`, resolve(root, "UNIVERSAL_SCRAPER.md"));
  for (const name of ["api.test.ts", "comeet.test.ts", "extract.test.ts", "geography.test.ts", "normalize.test.ts", "output.test.ts", "crawl.integration.ts", "strategy.integration.ts", "batch.test.ts", "batch-rules.test.ts", "zoho.test.ts", "workable.test.ts", "nhs.test.ts", "targeted-strategy.test.ts"]) {
    await copy(`${universal}/tests/${name}`, resolve(root, "tests", name));
  }
  put("companies.csv", outputCsv(combined));
  assert.deepEqual(new Set(Object.keys(files).filter(name => name.startsWith("jobs company wise/"))
    .map(name => name.split("/")[1])), slugs);
  assert.deepEqual(new Set(Object.keys(files).filter(name => name.startsWith("code/"))
    .map(name => name.split("/")[1])), new Set([...slugs, "universal_scraper"]));
  assert.ok(Object.keys(files).every(name => name === "companies.csv"
    || name.startsWith("code/") || name.startsWith("jobs company wise/")));
  const archive = zipSync(files, { level: 6 });
  const reopened = unzipSync(archive);
  assert.deepEqual(Object.keys(reopened).sort(), Object.keys(files).sort());
  for (const [name, contents] of Object.entries(files)) {
    assert.deepEqual(Buffer.from(reopened[name]!), Buffer.from(contents), name);
  }
  // All inputs and the ZIP are validated before writing any delivery files.
  // Existing unrelated files/runs are left alone and are never archived.
  for (const [name, contents] of Object.entries(files)) {
    const destination = resolve(directory, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  await writeFile(resolve(directory, "final.zip"), archive);
  await writeFile(resolve(directory, "validation.json"), JSON.stringify({
    generatedAt: stamp, checks, zipEntries: Object.keys(files).length,
    zipBytes: archive.length, zipIntegrity: "all entries round-trip byte-exact",
    csvRows: combined.length, zipSha256: createHash("sha256").update(archive).digest("hex"),
  }, null, 2));
  return { archive: resolve(directory, "final.zip"), bytes: archive.length, checks };
}

// Explicit arguments prevent an accidental no-argument overwrite of an old delivery.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, "Usage: npm run package:batch -- <batch-directory> <manifest.json>");
  console.log(JSON.stringify(await packageBatch(process.argv[2]!, process.argv[3]!), null, 2));
}
