import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboard, type Runner } from "../server/app.js";
import { catalogFromRows } from "../server/catalog.js";
import { normalizeJobs } from "../src/normalize.js";
import { outputCsv, outputRows } from "../src/output.js";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function fixtureOutput(directory: string) {
  await mkdir(join(directory, "code/src"), { recursive: true });
  const normalized = normalizeJobs([{
    jobId: "test-101", title: "Software Engineer", description: "Build useful software.\nSecond line.",
    jobUrl: "https://example.com/job/101", company: "Fixture company", postedDate: "2026-08-20",
    locations: [{ city: "London", state: "England", country: "UK" }], ats: "Fixture", worktype: "Hybrid",
  }], new Date("2026-09-15T12:00:00Z"));
  const report = {
    sourceUrl: "https://example.com/jobs", process: "STATIC", status: "ok", candidates: 1,
    pagesVisited: 1, rows: 1, window: { from: "2026-07-15", to: "2026-09-15" },
    scrapedAt: "2026-09-15T12:00:00Z", skipped: [], issues: [], limited: false,
    dateFallbacks: normalized.dateFallbacks, dataNotes: normalized.dataNotes,
  };
  const rows = outputRows({ rows: normalized.rows, report });
  await writeFile(join(directory, "jobs.csv"), outputCsv(rows));
  await writeFile(join(directory, "export-rows.json"), JSON.stringify(rows));
  await writeFile(join(directory, "scrape-report.json"), JSON.stringify(report));
  for (const name of ["package.json", "package-lock.json", "tsconfig.json"]) await writeFile(join(directory, "code", name), "{}");
  await writeFile(join(directory, "code/scrape.ts"), "// Standalone fixture code\n");
  await writeFile(join(directory, "code/src/example.ts"), "// Fixture module\n");
  return { company: "Fixture company", status: "ok", process: "STATIC", scrapedAt: report.scrapedAt,
    jobs: 1, locationRows: 1, reviewNotes: 0, postingDateFallbacks: 0 };
}

export async function dashboardFixture(runner?: Runner) {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-ui-"));
  const rows = [["company", "company_url", "career_url"], ...Array.from({ length: 8 }, (_, i) => [
    i === 0 ? "Acme & Sons" : `Company ${i + 1}`, `https://company${i}.example`, `https://company${i}.example/careers`,
  ])];
  const companies = catalogFromRows(rows);
  companies[0]!.summary = await fixtureOutput(join(root, "output", companies[0]!.slug));
  companies[0]!.resultDir = join(root, "output", companies[0]!.slug);
  companies[7]!.taken = true;
  const app = await createDashboard({
    root, companies, publicDir: join(projectRoot, "ui"),
    runner: runner || (async (_, directory, log) => { log("Fixture: 1/1 job pages read."); return fixtureOutput(directory); }),
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server address missing.");
  const base = `http://127.0.0.1:${address.port}`;
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  const post = (path: string, payload: unknown, token = dashboard.token, origin = base) =>
    fetch(`${base}${path}`, { method: "POST", headers: {
      "Content-Type": "application/json", "X-Workspace-Token": token, Origin: origin,
    }, body: JSON.stringify(payload) });
  return {
    root, companies, app, base, dashboard, post,
    async close() {
      await app.close();
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("fieldwork-ui-")) throw new Error("Unsafe fixture cleanup.");
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function waitForIdle(base: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const data = await (await fetch(`${base}/api/dashboard`)).json();
    if (!data.activeRun) return data;
    await new Promise(resolveWait => setTimeout(resolveWait, 30));
  }
  throw new Error("Fixture run did not finish.");
}
