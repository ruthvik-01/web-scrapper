import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { createHash } from "node:crypto";

// Read-only source audit. Outputs evidence; never executes company scrapers.
const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "web_scrapper_project/docs/universal-audit");
const excluded = new Set(["node_modules", "dist", ".git", "runs", "output", "Random", ".playwright-mcp"]);
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name)) return [];
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const slash = (file: string) => relative(root, file).replaceAll("\\", "/");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceExtensions = new Set([".ts", ".js", ".py", ".mjs", ".cjs"]);
const sources = walk(root).filter(file => sourceExtensions.has(extname(file)));
const files = sources.map(file => {
  const content = readFileSync(file, "utf8");
  const imports = new Set<string>();
  const symbols: { name: string; line: number }[] = [];
  // Lexical evidence only: declarations are navigation hints, not semantic equivalence.
  for (const match of content.matchAll(/(?:\bfrom\s*|\brequire\s*\(|\bimport\s*)["']([^"']+)["']/g)) imports.add(match[1]!);
  for (const match of content.matchAll(/(?:\bfunction\s+|\bdef\s+)([\w$]+)\s*\(/g)) {
    symbols.push({ name: match[1]!, line: content.slice(0, match.index).split(/\r?\n/).length });
  }
  const endpoints = [...new Set(content.match(/https?:\/\/[^\s"'`<>\\)]+/g) ?? [])].map(url => url.replace(/([?&](?:key|token|secret|password|api_key)=)[^&]*/gi, "$1[redacted]"));
  const evidence = content.split(/\r?\n/).flatMap((text, index) =>
    /paginate|pagination|nextUrl|nextPage|offset|hasNext|sitemap|maxPages|retry|attempt|backoff|delayMs|pace|sleep|setTimeout|waitForTimeout|salary|compensation|jobId|identifier|reference|description|plainText|htmlToText|locations|location:|city:|state:|country:|geograph|company:|hiringOrganization|exportCompanyName|employerNames|deduplic|new Set|fingerprint|\.launch\(|\.newContext\(|catch|throw|issues|partial|unsupported|detail|extractJobs|JobPosting|__NEXT_DATA__|JSON.parse|json\.loads|fetch\(|requests\./i.test(text)
      ? [{ line: index + 1, text: /(?:authorization|password|secret|api[_-]?key)/i.test(text) ? "[credential-related line omitted]" : text.trim().slice(0, 260) }] : []);
  const missingRelativeImports = [...imports].filter(specifier => {
    if (!specifier.startsWith(".")) return false;
    const target = resolve(dirname(file), specifier);
    return ![target, target.replace(/\.js$/, ".ts"), `${target}.ts`, `${target}.js`, resolve(target, "index.ts")].some(existsSync);
  });
  return { file: slash(file), hash: hash(content), lines: content.split(/\r?\n/).length, imports: [...imports], missingRelativeImports, symbols, endpoints, evidence };
});
const groups = new Map<string, typeof files>();
for (const file of files) {
  const list = groups.get(file.hash) ?? [];
  list.push(file);
  groups.set(file.hash, list);
}
const companyRoot = resolve(root, "companies code");
const companies = readdirSync(companyRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
  const prefix = `companies code/${entry.name}/`;
  const companyFiles = files.filter(file => file.file.startsWith(prefix));
  const allFiles = walk(resolve(companyRoot, entry.name));
  const configs = allFiles.filter(file => /(?:company|config|package|tsconfig).*\.json$/i.test(file) && !file.endsWith("package-lock.json"))
    .map(file => {
      try { return { file: slash(file), value: JSON.parse(readFileSync(file, "utf8")) }; }
      catch { return { file: slash(file), value: { auditError: "Invalid JSON" } }; }
    });
  const readmes = allFiles.filter(file => /\.md$/i.test(file)).map(file => ({ file: slash(file), content: readFileSync(file, "utf8") }));
  const config = configs.find(item => item.file === `${prefix}company.json`)?.value ?? {};
  const architecture = companyFiles.some(file => file.file.endsWith("src/jev.ts")) ? "legacy JEV framework"
    : companyFiles.some(file => file.file.endsWith("src/strategy.ts")) ? "copied modular framework"
    : companyFiles.some(file => file.file.endsWith("src/company-runner.ts")) ? "copied sitemap framework"
    : companyFiles.some(file => file.file.endsWith(".py")) ? "legacy Python" : "specialized standalone";
  const sourcePath = config.codeFile ? `${prefix}${config.codeFile}` : `${prefix}scrape.ts`;
  const entryContent = existsSync(resolve(root, sourcePath)) ? readFileSync(resolve(root, sourcePath), "utf8") : "";
  const sourceUrl = config.careersUrl || config.sourceUrl || /\burl:\s*"([^"]+)"/.exec(entryContent)?.[1] || /SOURCE_URL\s*=\s*"([^"]+)"/.exec(entryContent)?.[1] || "";
  const name = config.name || config.company || /\bcompany:\s*"([^"]+)"/.exec(entryContent)?.[1] || /COMPANY_LABEL\s*=\s*"([^"]+)"/.exec(entryContent)?.[1] || entry.name;
  const platform = /comeet\.com/.test(sourceUrl) ? "Comeet"
    : /jobtrain\.co\.uk/.test(sourceUrl) ? "Jobtrain"
    : /vacancy-search-results\.aspx|\/vacancies\/$|intercity\.technology/.test(sourceUrl) && /framework/.test(architecture) || entry.name === "ppghealthinjusticeweb" ? "Eploy (source/config evidence)"
    : ["northwood-hygiene-products-limited", "p-ducker-systems-ltd", "partnering-health-ltd"].includes(entry.name) ? "WordPress"
    : ["pgs-ltd", "pinpoint-resourcing-ltd"].includes(entry.name) ? "Reed / linked Reed details"
    : entry.name === "sjc-partners" ? "JobAdder"
    : entry.name === "mountain-healthcare-ltd" ? "Occy (saved snapshot)"
    : entry.name === "no35-mackenzie-walk" ? "Portobello Next.js"
    : entry.name === "operations-resources-limited" ? "Haystack JSON-LD"
    : entry.name === "mayra-property-services" ? "Custom Supabase REST"
    : entry.name === "mber-london" ? "JOB TODAY placeholder"
    : entry.name === "oliver-roberts-ltd" ? "Identity investigation only"
    : entry.name === "rodericks-dental-partners" ? "Custom / Tribepad-style board (inferred URL pattern)"
    : companyFiles.length === 0 ? "Unresolved; no scraper" : "Custom HTML / unknown ATS";
  const mechanism = platform === "Comeet" ? "Embedded COMPANY_DATA / COMPANY_POSITIONS_DATA JSON, one board request"
    : architecture === "copied sitemap framework" || config.options?.sitemapUrl ? "Public XML sitemap/index discovery and HTML JobPosting details"
    : architecture === "legacy JEV framework" ? "HTTP ATS API / sitemap / crawl plus optional JEV judgments"
    : architecture === "copied modular framework" ? "API then sitemap/static, DOM fallback; configured mode controls selection"
    : config.status === "unresolved_no_verified_scraper" ? "No runnable implementation"
    : "Company-specific; see source evidence and review notes";
  const fields = Object.fromEntries([
    ["pagination", /nextUrl|nextPage|pagination|paginate|offset|sitemap|pageNum|maxPages/i],
    ["jobDetailExtraction", /detail|extractJobs|JobPosting|schema|page\.evaluate|__NEXT_DATA__/i],
    ["locationExtraction", /locations|location:|city:|state:|country:|geograph/i],
    ["descriptionExtraction", /description|roleDescription|plainText|htmlToText/i],
    ["salaryExtraction", /salary|compensation|annual|hourly/i],
    ["jobIdExtraction", /jobId|identifier|postid|page-id|reference/i],
    ["companyNormalization", /company:|hiringOrganization|exportCompanyName|employerNames/i],
    ["deduplication", /dedup|new Set|seenJobs|fingerprint/i],
    ["retry", /retry|attempt|backoff|429|502|503|504/i],
    ["rateLimiting", /pace|delayMs|sleep|setTimeout|waitForTimeout/i],
    ["errorHandling", /catch|throw|issues|partial|unsupported/i],
    ["jsonParsing", /JSON.parse|json\.loads|jsonPage|decode|__NEXT_DATA__/i],
    ["htmlParsing", /extractJobs|plainText|htmlToText|JobPosting|load\(|BeautifulSoup/i],
    ["browserAutomation", /\.launch\(|\.newContext\(|page\.|chromium/i],
  ].map(([field, pattern]) => [field as string, companyFiles.filter(file => !file.file.includes("/tests/")).flatMap(file => file.evidence.filter(item => (pattern as RegExp).test(item.text)).map(item => `${file.file}:${item.line}`))]));
  const libraries = [...new Set(companyFiles.flatMap(file => file.imports).filter(item => !item.startsWith(".") && !item.startsWith("node:")))];
  return { slug: entry.name, name, sourceUrl, platform, mechanism, config, architecture, sourceFiles: companyFiles.map(file => file.file), sourceLines: companyFiles.reduce((sum, file) => sum + file.lines, 0), libraries, missingRelativeImports: companyFiles.flatMap(file => file.missingRelativeImports.map(specifier => ({ file: file.file, specifier }))), auditFields: fields, configs, readmes };
});
const companyFiles = files.filter(file => file.file.startsWith("companies code/"));
const companyGroups = [...groups.values()].map(group => group.filter(file => file.file.startsWith("companies code/"))).filter(group => group.length);
const stats = {
  companyDirectories: companies.length,
  repositorySourceFilesRead: files.length,
  companySourceFiles: companyFiles.length,
  companySourceLines: companyFiles.reduce((sum, file) => sum + file.lines, 0),
  uniqueCompanySourceContents: companyGroups.length,
  exactDuplicateFileInstances: companyGroups.reduce((sum, group) => sum + group.length - 1, 0),
  exactDuplicateSourceLines: companyGroups.reduce((sum, group) => sum + (group.length - 1) * group[0]!.lines, 0),
  architectures: companies.reduce<Record<string, number>>((counts, company) => { counts[company.architecture] = (counts[company.architecture] ?? 0) + 1; return counts; }, {}),
};
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "source-evidence.json"), JSON.stringify({ stats, files, duplicateFiles: companyGroups.filter(group => group.length > 1).map(group => ({ hash: group[0]!.hash, lines: group[0]!.lines, files: group.map(file => file.file) })) }, null, 2) + "\n");
writeFileSync(resolve(output, "company-inventory.json"), JSON.stringify(companies, null, 2) + "\n");
console.log(JSON.stringify(stats, null, 2));
console.log(JSON.stringify({ platforms: companies.reduce<Record<string, number>>((counts, company) => { counts[company.platform] = (counts[company.platform] ?? 0) + 1; return counts; }, {}), brokenImportCompanies: companies.filter(company => company.missingRelativeImports.length).map(company => company.slug) }, null, 2));
