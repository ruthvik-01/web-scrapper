import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collection = path.join(root, "companies code");
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const inventory = await readJson(path.join(collection, "inventory.json"));
const selection = await readJson(path.join(root, "scripts/company-code-selection.json"));
assert.deepEqual(new Set(inventory.companies.map(c => c.slug)), new Set(selection));
const requested = process.argv.slice(2);
const companies = inventory.companies.filter(c => !requested.length || requested.includes(c.slug));
assert(companies.length > 0 && requested.every(s => companies.some(c => c.slug === s)));
// Outside the repository: parent node_modules must not mask missing dependencies.
const isolated = await fs.mkdtemp(path.join(path.dirname(root), "uk-company-portability-"));
const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
await fs.access(npmCli);
const snapshots = new Map();
async function snapshot(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Unexpected link: ${entry.name}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assert(!["node_modules", "runs"].includes(entry.name), `Generated artifacts in ${file}`);
      await snapshot(file);
    } else {
      const content = await fs.readFile(file);
      snapshots.set(file, createHash("sha256").update(content).digest("hex"));
      if (file.endsWith(".ts")) {
        for (const match of content.toString().matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g)) {
          const target = path.resolve(path.dirname(file), match[1]);
          const companyRoot = path.join(collection, path.relative(collection, file).split(path.sep)[0]);
          assert(target.startsWith(companyRoot + path.sep), `Cross-company import: ${file}: ${match[1]}`);
          await fs.access(target.replace(/\.js$/, ".ts"));
        }
      }
    }
  }
}
for (const company of companies) await snapshot(path.join(collection, company.slug));
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/robots.txt") return response.end("User-agent: *\nDisallow:");
  const slug = url.pathname.split("/")[2];
  const company = inventory.companies.find(c => c.slug === slug);
  if (!company) { response.statusCode = 404; return response.end("Not found"); }
  if (url.pathname.endsWith("/unavailable")) {
    response.statusCode = 503;
    return response.end("Deliberate local fixture failure");
  }
  const base = `http://127.0.0.1:${server.address().port}`;
  if (url.pathname.endsWith("/sitemap.xml")) {
    response.setHeader("Content-Type", "application/xml");
    return response.end(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/jobs/${slug}/vacancy</loc></url></urlset>`);
  }
  const config = fixtureConfigs.get(slug);
  const job = {
    "@context": "https://schema.org", "@type": "JobPosting",
    identifier: { value: `fixture-${slug}` },
    title: `${config.titlePrefixes?.[0] || ""} Fixture Engineer`.trim(),
    description: "Local portability verification vacancy. This is test data, not a real job. Build and maintain software for a UK team.",
    url: `${base}/jobs/${slug}/vacancy`, datePosted: new Date().toISOString().slice(0, 10),
    hiringOrganization: { name: config.employerNames?.[0] || config.name },
    jobLocation: { address: { addressLocality: "London", addressRegion: "England", addressCountry: "GB" } },
    employmentType: "FULL_TIME",
  };
  response.setHeader("Content-Type", "text/html");
  response.end(`<html><head><title>Fixture vacancy</title><script type="application/ld+json">${JSON.stringify(job)}</script></head><body>Fixture vacancy</body></html>`);
});
const fixtureConfigs = new Map();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
async function command(folder, label, args, expected = 0) {
  const started = Date.now();
  let result;
  try {
    result = await exec(process.execPath, [npmCli, ...args], {
      cwd: folder, timeout: 300_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", npm_config_update_notifier: "false" },
      windowsHide: true,
    });
    result.code = 0;
  } catch (error) {
    result = error;
  }
  await fs.writeFile(path.join(folder, `${label}.log`), `${result.stdout || ""}\n${result.stderr || ""}`);
  assert.equal(result.code, expected, `${label} failed for ${path.basename(folder)}; see ${path.join(folder, `${label}.log`)}`);
  return Date.now() - started;
}
async function verifyCompany(company) {
  const folder = path.join(isolated, company.slug);
  const result = { slug: company.slug, implementation: company.implementation };
  try {
    await fs.cp(path.join(collection, company.slug), folder, { recursive: true });
    const config = await readJson(path.join(folder, "company.json"));
    const legacy = company.implementation === "legacy-sitemap";
    const fixture = { ...config, careersUrl: `${base}/jobs/${company.slug}/vacancy` };
    if (legacy) fixture.sitemapUrl = `${base}/jobs/${company.slug}/sitemap.xml`;
    else fixture.options = { mode: "static", maxPages: 5, delayMs: 0, timeoutMs: 5000 };
    fixtureConfigs.set(company.slug, fixture);
    // Fixture URLs affect temporary copies only, never delivered company configurations.
    await fs.writeFile(path.join(folder, "company.json"), JSON.stringify(fixture, null, 2));
    result.installMs = await command(folder, "install", ["ci", "--no-audit", "--no-fund"]);
    result.typecheckMs = await command(folder, "typecheck", ["run", "typecheck"]);
    for (let run = 1; run <= 2; run++) {
      await command(folder, `scrape-${run}`, ["run", "scrape"]);
      const runs = (await fs.readdir(path.join(folder, "runs"))).sort();
      assert.equal(runs.length, run, "A rerun must create a new output folder.");
      const output = path.join(folder, "runs", runs.at(-1), ...(legacy ? [] : [company.slug]));
      const rows = await readJson(path.join(output, "export-rows.json"));
      const report = await readJson(path.join(output, "scrape-report.json"));
      assert.equal(rows.length, 1, `${company.slug}: fixture should export one job`);
      assert.equal(rows[0].jobId, `fixture-${company.slug}`);
      assert.equal(rows[0].company, config.exportCompanyName || config.name);
      assert.equal(rows[0].country, "UK");
      assert.equal(Object.keys(rows[0]).length, 15);
      assert.equal(report.status, "ok");
      assert.equal(report.geographicApiRequests ?? 0, 0, "Fixtures must not require external geocoding.");
      if (run === 1) result.firstRun = { file: path.join(output, "export-rows.json"), text: await fs.readFile(path.join(output, "export-rows.json"), "utf8") };
      else assert.equal(await fs.readFile(result.firstRun.file, "utf8"), result.firstRun.text);
    }
    delete result.firstRun;
    result.install = "passed";
    result.typecheck = "passed";
    result.twoIsolatedCliRuns = "passed";
    result.status = "passed";
  } catch (error) {
    delete result.firstRun;
    result.status = "failed";
    result.error = String(error);
  }
  results.push(result);
  console.log(JSON.stringify({ completed: results.length, total: companies.length, slug: result.slug, status: result.status, error: result.error }));
}
try {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, companies.length) }, async () => {
    while (index < companies.length) await verifyCompany(companies[index++]);
  }));
  // Installation and all CLI runs above use each company's own node_modules.
  const framework = results.find(r => r.status === "passed" && r.implementation === "full-framework");
  if (framework) {
    const folder = path.join(isolated, framework.slug);
    await command(folder, "unit-tests", ["test"]);
    framework.packagedUnitTests = "passed";
    await command(folder, "browser-install", ["exec", "--", "playwright", "install", "chromium"]);
    await command(folder, "browser-tests", ["run", "test:browser"]);
    framework.packagedBrowserTests = "passed";
  }
  for (const implementation of ["legacy-sitemap", "full-framework"]) {
    const representative = results.find(r => r.status === "passed" && r.implementation === implementation);
    if (!representative) continue;
    const folder = path.join(isolated, representative.slug);
    const config = await readJson(path.join(folder, "company.json"));
    config.careersUrl = `${base}/jobs/${representative.slug}/unavailable`;
    if (implementation === "legacy-sitemap") config.sitemapUrl = config.careersUrl;
    await fs.writeFile(path.join(folder, "company.json"), JSON.stringify(config));
    await command(folder, "failure-exit", ["run", "scrape"], 2);
    representative.failedSourceReturnsNonzero = "passed";
  }
} catch (error) {
  results.push({ status: "failed", stage: "additional-verification", error: String(error) });
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
for (const [file, expected] of snapshots) {
  assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"), expected, `Delivery changed: ${file}`);
}
const report = {
  verifiedAt: new Date().toISOString(), nodeVersion: process.version, platform: `${os.platform()} ${os.arch()}`,
  isolatedRoot: isolated, companyCount: companies.length,
  allPassed: results.every(r => r.status === "passed") && results.length === companies.length,
  preservedDeliveredFiles: snapshots.size, results,
  scope: "Fresh npm ci and two real npm run scrape CLI invocations per company in isolated copies outside the repository, using local JSON-LD/sitemap fixtures and current dates. One identical full-framework copy also runs its bundled unit/browser tests. This verifies portability, not live employer availability. Company configurations in delivery are unchanged; fixture modifications exist only in isolated copies.",
};
const reportName = requested.length ? `portability-validation-${requested.join("-")}.json` : "portability-validation.json";
await fs.writeFile(path.join(collection, reportName), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: path.join(collection, reportName), isolated, allPassed: report.allPassed }));
if (!report.allPassed) process.exitCode = 1;
