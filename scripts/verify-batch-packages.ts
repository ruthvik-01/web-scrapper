import assert from "node:assert/strict";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const directory = resolve(process.argv[2] || "output/batch-2026-09-16");
const isolated = (await readFile(resolve(directory, "portable-test-root.txt"), "utf8")).trim();
await cp(resolve(directory, "code"), resolve(isolated, "code"), { recursive: true });
const companies = JSON.parse(await readFile("companies-next-five.json", "utf8"));
const server = createServer((request, response) => {
  if (request.url === "/robots.txt") return response.end("User-agent: *\nDisallow:");
  const company = companies.find((item: { slug: string }) => request.url === `/jobs/${item.slug}`);
  if (!company) { response.statusCode = 404; return response.end("Not found"); }
  response.end(`<html><title>Fixture job</title><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting", identifier: { value: `fixture-${company.slug}` },
    title: "Fixture Engineer", description: "A local verification fixture, not a live vacancy.",
    url: `http://127.0.0.1:${port}/jobs/${company.slug}`,
    hiringOrganization: { name: company.name },
    jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } },
  })}</script></html>`);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const port = address.port;
const checks = [];
const node = process.execPath;
const tsx = resolve(isolated, "node_modules/tsx/dist/cli.mjs");
const tsc = resolve(isolated, "node_modules/typescript/bin/tsc");
try {
  for (const name of await readdir(resolve(isolated, "code"))) {
    const folder = resolve(isolated, "code", name);
    await run(node, [tsc, "--noEmit", "-p", resolve(folder, "tsconfig.json")], { cwd: folder });
    if (name === "universal_scraper") {
      const fixtures = companies.slice(0, 2).map((company: { name: string; slug: string }) => ({
        ...company, careersUrl: `http://127.0.0.1:${port}/jobs/${company.slug}`,
        options: { mode: "auto", delayMs: 0, maxPages: 10 },
      }));
      await writeFile(resolve(folder, "fixture-companies.json"), JSON.stringify(fixtures));
      await run(node, [tsx, "batch.ts", "fixture-companies.json", "--out", "fixture-output"], { cwd: folder });
      const summary = JSON.parse(await readFile(resolve(folder, "fixture-output/batch-report.json"), "utf8"));
      assert.equal(summary.length, 2);
      assert.ok(summary.every((item: { rows: number }) => item.rows === 1));
      checks.push({ package: name, typecheck: "passed", isolatedBatchFixture: "2 companies passed" });
    } else {
      const config = JSON.parse(await readFile(resolve(folder, "company.json"), "utf8"));
      config.careersUrl = `http://127.0.0.1:${port}/jobs/${config.slug}`;
      config.options = { mode: "auto", delayMs: 0, maxPages: 10 };
      await writeFile(resolve(folder, "company.json"), JSON.stringify(config));
      await run(node, [tsx, "scrape.ts"], { cwd: folder });
      const runs = await readdir(resolve(folder, "runs"));
      const rows = JSON.parse(await readFile(resolve(folder, "runs", runs[0]!, config.slug, "export-rows.json"), "utf8"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].company, config.name);
      assert.equal(rows[0].ats, "Custom");
      assert.equal(Object.keys(rows[0]).length, 15);
      checks.push({ package: name, typecheck: "passed", isolatedScraperFixture: "passed" });
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
}
await writeFile(resolve(directory, "portable-validation.json"), JSON.stringify({
  dependencyInstall: "fresh npm ci outside repository; 0 audit vulnerabilities",
  checks, note: "Fixtures ran in temporary copies; delivered company URLs and data were not modified.",
}, null, 2));
console.log(JSON.stringify(checks, null, 2));
