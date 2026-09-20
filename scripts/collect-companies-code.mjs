import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "output");
const destination = path.join(root, "companies code");
assert(!fs.existsSync(destination), "Destination already exists; refusing to overwrite.");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const companies = new Map();
const inputs = new Map();
const copies = [];
const remember = file => inputs.set(file, hash(file));
const load = file => { remember(file); return readJson(file); };
const register = (config, source, packaged = null) => {
  assert(/^[a-z0-9][a-z0-9-]*$/.test(config.slug));
  const previous = companies.get(config.slug);
  companies.set(config.slug, {
    config, source, packaged: packaged ?? previous?.packaged ?? null,
    sources: [...new Set([...(previous?.sources ?? []), relative(source)])],
  });
};

// The replacement CSV manifest explicitly supersedes the clipped PDF manifest.
const manifests = fs.readdirSync(root).filter(name =>
  /^companies.*\.json$/.test(name) && name !== "companies-akhil-team-2026-09-18.json");
for (const name of manifests.sort()) {
  const file = path.join(root, name);
  for (const config of load(file)) register(config, file);
}
const batches = fs.readdirSync(output, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith("_"))
  .map(entry => entry.name);
const priority = name => name === "comeet-updated-fields-2026-09-18" ? 3
  : name === "combined 17-9-26 batches" ? 2 : 1;
for (const batch of [...batches].sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))) {
  const code = path.join(output, batch, "code");
  if (!fs.existsSync(code)) continue;
  for (const entry of fs.readdirSync(code, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "universal_scraper") continue;
    const folder = path.join(code, entry.name);
    const configFile = path.join(folder, "company.json");
    if (fs.existsSync(configFile)) register(load(configFile), configFile, folder);
    else {
      const entryPoint = path.join(folder, "scrape.ts");
      remember(entryPoint);
      const text = fs.readFileSync(entryPoint, "utf8");
      const match = text.match(/const company = (\{[\s\S]*?\n\});/);
      assert(match, `Unrecognized standalone code: ${folder}`);
      register(JSON.parse(match[1]), entryPoint, folder);
    }
  }
}
// Explicit policy revisions take precedence over earlier packaged configuration.
for (const name of ["companies-akhil-ruthvik-2026-09-18.json", "companies-comeet-updated-fields-2026-09-18.json"]) {
  const file = path.join(root, name);
  for (const config of load(file)) register(config, file);
}
const selection = load(path.join(root, "scripts/company-code-selection.json"));
assert.equal(new Set(selection).size, 48, "Expected exactly the 48 requested companies.");
for (const slug of selection) assert(companies.has(slug), `Requested company missing: ${slug}`);
for (const slug of companies.keys()) if (!selection.includes(slug)) companies.delete(slug);

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function json(file, value) { write(file, JSON.stringify(value, null, 2) + "\n"); }
function copy(source, target) {
  remember(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  copies.push({ source: relative(source), target: path.relative(destination, target), sha256: hash(source) });
}
function copyTree(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (["node_modules", "runs", ".git"].includes(entry.name)) continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symbolic link: ${from}`);
    if (entry.isDirectory()) copyTree(from, to);
    else copy(from, to);
  }
}
const pkg = load(path.join(root, "package.json"));
const tsconfig = load(path.join(root, "tsconfig.json"));
const inventory = [];
for (const [slug, item] of [...companies].sort(([a], [b]) => a.localeCompare(b))) {
  const folder = path.join(destination, slug);
  const legacy = item.packaged && !fs.existsSync(path.join(item.packaged, "company.json"));
  if (legacy) {
    // Preserve the delivered sitemap implementation, but make company.json authoritative.
    copyTree(path.join(item.packaged, "src"), path.join(folder, "src"));
    for (const name of ["package.json", "package-lock.json", "tsconfig.json"])
      copy(path.join(item.packaged, name), path.join(folder, name));
    write(path.join(folder, "scrape.ts"), [
      'import { readFile } from "node:fs/promises";',
      'import { resolve } from "node:path";',
      'import { runCompany, type CompanyConfig } from "./src/company-runner.js";',
      'const config: CompanyConfig = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));',
      'const directory = resolve(import.meta.dirname, "runs", new Date().toISOString().replace(/[:.]/g, "-"));',
      'console.log(`Saving this run to ${directory}`);',
      'const summary = await runCompany(config, directory);',
      'if (["failed", "partial", "unsupported"].includes(summary.status)) process.exitCode = 2;',
      "",
    ].join("\n"));
  } else {
    copyTree(path.join(root, "src"), path.join(folder, "src"));
    copy(path.join(root, "package-lock.json"), path.join(folder, "package-lock.json"));
    copy(path.join(root, "scraper.ts"), path.join(folder, "scraper.ts"));
    for (const name of ["api.test.ts", "comeet.test.ts", "extract.test.ts", "geography.test.ts",
      "normalize.test.ts", "output.test.ts", "crawl.integration.ts", "strategy.integration.ts",
      "batch.test.ts", "batch-rules.test.ts"])
      copy(path.join(root, "tests", name), path.join(folder, "tests", name));
    json(path.join(folder, "package.json"), { ...pkg, scripts: {
      scrape: "tsx scrape.ts", typecheck: "tsc --noEmit",
      test: "tsx --test tests/*.test.ts", "test:browser": "tsx --test tests/*.integration.ts",
    } });
    json(path.join(folder, "tsconfig.json"), {
      ...tsconfig, include: ["scrape.ts", "scraper.ts", "src/**/*.ts", "tests/**/*.ts"],
    });
    write(path.join(folder, "scrape.ts"), [
      'import { readFile } from "node:fs/promises";',
      'import { resolve } from "node:path";',
      'import { runBatch, type BatchCompany } from "./src/batch.js";',
      'const config: BatchCompany = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));',
      'const directory = resolve(import.meta.dirname, "runs", new Date().toISOString().replace(/[:.]/g, "-"));',
      'console.log(`Saving this run to ${directory}`);',
      'const report = await runBatch([config], directory);',
      'if (report.some(item => ["failed", "partial", "unsupported"].includes(String(item.status)))) process.exitCode = 2;',
      "",
    ].join("\n"));
  }
  json(path.join(folder, "company.json"), item.config);
  const kind = legacy ? "self-contained sitemap scraper" : "self-contained full-framework scraper";
  write(path.join(folder, ".gitignore"), "node_modules/\nruns/\n");
  write(path.join(folder, "README.md"), `# ${item.config.name}\n\nFull, self-contained scraper. Copy this entire folder to any location; no sibling company, original repository or universal_scraper folder is required.\n\n` +
    (legacy ? "" : "The company entry point is `scrape.ts` (`npm run scrape`). The additional `scraper.ts` is the generic CLI used by bundled integration tests, not a replacement for the company entry point.\n\n") +
    "## First-time setup\n\nInstall Node.js 22 or newer with npm. Open a terminal in this folder and run:\n\n```sh\nnpm ci\nnpx playwright install chromium\nnpm run typecheck\nnpm run scrape\n```\n\n" +
    "Setup requires internet access. On a different computer or operating system, run setup again; do not copy node_modules between machines. Linux may need browser system dependencies (`npx playwright install --with-deps chromium`).\n\n" +
    "## Later runs\n\n```sh\nnpm run scrape\n```\n\nEach invocation fetches the current website using the current date and writes a new dated folder under `runs/`; previous runs are not overwritten. Edit `company.json` to update this company's configuration.\n\n" +
    `Job exports and scrape-report.json are under \`runs/<timestamp>/${legacy ? "" : `${slug}/`}\`. Review the report even if no jobs are exported. Exit code 2 signals partial, failed or unsupported extraction; unexpected errors also return a nonzero code.\n\n` +
    "## Limits\n\nWebsites can change, go offline, block automation, or publish no qualifying UK jobs. This package cannot guarantee future site availability or bypass access restrictions. Existing filtering and source limitations are preserved; missing job fields are never invented.\n\n" +
    `Configuration source: \`${relative(item.source)}\`.\n\n${item.config.sourceNote || "Original delivered company configuration and scraper rules retained."}\n`);
  inventory.push({ company: item.config.name, slug, kind, implementation: legacy ? "legacy-sitemap" : "full-framework",
    configurationSource: relative(item.source),
    packagedSource: item.packaged ? relative(item.packaged) : null, sources: item.sources });
}
json(path.join(destination, "inventory.json"), { batchesInspected: batches,
  selectionSource: "scripts/company-code-selection.json",
  excluded: ["output/_history: superseded checkpoints", "output/_tracking: administrative tracking",
    "companies-akhil-team-2026-09-18.json: superseded by replacement CSV manifest",
    "Eight held Akhil entries: no approved company configuration",
    "Uploaded job-sheet corrections: data processing only, no company scraper source supplied",
    "All companies outside the user's explicit 48-company selection"],
  companies: inventory });
write(path.join(destination, "README.md"), `# Companies code\n\n${companies.size} individual company folders, limited to the user's explicit selection in \`scripts/company-code-selection.json\`. Duplicate companies appear once using corrected configuration; previous batches and historical checkpoints remain untouched.\n\n` +
  "## Run any company independently\n\nCopy its entire folder anywhere. Install Node.js 22+ with npm, open a terminal inside that folder, then run:\n\n```sh\nnpm ci\nnpx playwright install chromium\nnpm run typecheck\nnpm run scrape\n```\n\nAfter first-time setup, use `npm run scrape` for later runs. Every company includes its own complete src/, company.json, scrape.ts, package.json, package-lock.json and tsconfig.json. No universal_scraper, sibling folder or original repository is needed. Dependencies and browser installation require internet access. Results stay under the company's dated runs/ directory. See its README for output paths and limitations.\n\n" +
  "## Scope\n\n`inventory.json` records every selected company and source. The 43 framework-based companies now include their own full framework source; the five legacy companies retain their sitemap implementations and now also read company.json. Walkers is `walkers-shortbread`; Aviation Inc is `persivalenic`; monday.com is `monday`; Upwind Security is `upwind`. No website can be guaranteed to remain available or unchanged. No live websites were re-scraped during packaging; read portability-validation.json for isolated installation/run checks.\n");
for (const [file, before] of inputs) assert.equal(hash(file), before, `Input changed: ${file}`);
for (const record of copies) {
  if (!record.modified) assert.equal(hash(path.join(destination, record.target)), record.sha256);
}
assert.equal(fs.readdirSync(destination, { withFileTypes: true }).filter(e => e.isDirectory()).length, companies.size);
for (const item of inventory) {
  const folder = path.join(destination, item.slug);
  assert.equal(readJson(path.join(folder, "company.json")).slug, item.slug);
  assert(fs.existsSync(path.join(folder, "scrape.ts")));
}
json(path.join(destination, "collection-validation.json"), {
  companyCount: companies.size, standaloneCount: companies.size,
  legacySitemapCount: inventory.filter(i => i.implementation === "legacy-sitemap").length,
  newlyPackagedCount: inventory.filter(i => !i.packagedSource).length,
  inputFilesUnchanged: inputs.size, copiedFiles: copies, layoutVerified: true,
  liveScrapingPerformed: false,
});
console.log(JSON.stringify({ destination, companies: companies.size,
  standalone: companies.size,
  newlyPackaged: inventory.filter(i => !i.packagedSource).length, inputsUnchanged: inputs.size }));
