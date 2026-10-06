import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { dateWindow } from "../src/normalize.js";
import { attachHistory, jsonFile, loadCatalog, type Company } from "./catalog.js";
import { Imports, mapImport, publicUrl } from "./imports.js";
import { IMPORT_LIMITS, type ImportMapping } from "./import-types.js";
import { load } from "cheerio";

export type RunItemStatus = "queued" | "running" | "completed" | "empty" | "needs-review" | "failed" | "cancelled" | "interrupted";
/** Structured execution state for one company, mirrored from the scraper engine. */
export interface CompanyMetrics {
  stage: string; operation: string; currentUrl: string; ats: string;
  pagesDiscovered: number; pagesProcessed: number; pagesTotal: number;
  jobsDiscovered: number; jobsProcessed: number; jobsFound: number; jobsSkipped: number;
  startedAt: string; elapsedMs: number; error?: string;
}
export interface LogLine { time: string; message: string }
export interface RunItem {
  companyId: string; name: string; status: RunItemStatus;
  progress: number; total: number; error?: string; summary?: Record<string, unknown>;
  /** Isolated per-company log stream: companies never share one terminal. */
  logs: LogLine[];
  /** Structured progress; never parsed back out of log text. */
  metrics?: CompanyMetrics;
}
export interface Run {
  id: string; createdAt: string; finishedAt?: string;
  status: "running" | "completed" | "stopping" | "stopped" | "needs-review" | "interrupted";
  items: RunItem[]; logs: LogLine[];
}
export type Runner = (company: Company, directory: string, log: (line: string, metrics?: CompanyMetrics) => void) => Promise<Record<string, unknown>>;
interface ImportRecord { id: string; name: string; sheet: string; importedAt: string; inputRows: number; added: number; merged: number; rejected: number; companyIds: string[] }
interface State {
  taken: Record<string, boolean>;
  results: Record<string, { directory: string; summary: Record<string, unknown> }>;
  runs: Run[];
  importedCompanies?: Company[];
  imports?: ImportRecord[];
  settings?: Record<string, Partial<Company>>;
}
export interface AppOptions {
  root: string; dataRoot?: string; companies?: Company[]; workbookRows?: number; runner?: Runner; publicDir?: string;
  /** Companies processed concurrently within one batch. Default 1 (sequential). */
  runConcurrency?: number;
}

/** Per-company log tail kept in memory, in the UI payload and on disk. */
const ITEM_LOG_LIMIT = 250;
/** Lines of a company's isolated terminal returned by the log endpoint. */
const TERMINAL_LOG_LIMIT = 2000;
/** Tail of the mixed batch log kept for the run-history view. */
const RUN_LOG_LIMIT = 150;
const HISTORY_ITEM_LOG_LIMIT = 40;


export function inside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
/** Counters the UI needs at a glance; kept in sync with the structured metrics. */
export function metricsCounters(metrics: CompanyMetrics): { progress: number; total: number } {
  return { progress: metrics.pagesProcessed || metrics.jobsProcessed, total: metrics.pagesTotal };
}
async function safeFile(directory: string, name: string): Promise<string> {
  const file = resolve(directory, name);
  if (!inside(directory, file) || !inside(await realpath(directory), await realpath(file))) throw new Error("Unsafe file path.");
  return file;
}

export async function createDashboard(options: AppOptions): Promise<{ server: Server; close: () => Promise<void> }> {
  const root = resolve(options.root);
  // Data (output/, workbook) may live outside the code project when the code is
  // nested (e.g. web_scrapper_project/); dataRoot anchors those paths.
  const dataRoot = resolve(options.dataRoot || root);
  const publicDir = options.publicDir || resolve(dirname(fileURLToPath(import.meta.url)), "../ui");
  const outputRoot = resolve(dataRoot, "output");
  await mkdir(outputRoot, { recursive: true });
  const realOutputRoot = await realpath(outputRoot);
  if (!inside(await realpath(dataRoot), realOutputRoot)) throw new Error("Output directory must remain within the data root.");
  const deliveryNamePattern = String.raw`\d{4}-\d{2}-\d{2}-(?:verified|main-uk-scrape)`;
  const datedDelivery = new RegExp(`^${deliveryNamePattern}$`);
  const deliveryRoute = new RegExp(`^/api/deliveries/(${deliveryNamePattern}|\\d{1,2}-\\d{1,2}-\\d{2,4})/(companies\\.csv|final\\.zip|report\\.json|rejections\\.json|provenance\\.json)$`);
  const deliveries = async () => {
    const entries = await readdir(outputRoot, { withFileTypes: true });
    const found = [] as { name: string; rows: number; hasZip: boolean; hasReport: boolean; pipeline: boolean; directory: string }[];
    for (const entry of entries) {
      const pipeline = /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(entry.name);
      if (!entry.isDirectory() || (!pipeline && !datedDelivery.test(entry.name)) || found.some(item => item.name === entry.name)) continue;
      const directory = resolve(outputRoot, entry.name);
      try {
        await safeFile(directory, pipeline ? `${entry.name}.csv` : "companies.csv");
        let rowCount = 0;
        if (pipeline) {
          try {
            const reportPath = await safeFile(directory, `${entry.name}-summary.json`);
            const report = JSON.parse(await readFile(reportPath, "utf8"));
            rowCount = Number(report.finalRows) || 0;
          } catch { /* The CSV remains listed if an older delivery has no report. */ }
        } else {
          const rows = await jsonFile<unknown[]>(resolve(directory, "companies.json"), []);
          rowCount = Array.isArray(rows) ? rows.length : 0;
        }
        let hasZip = false;
        try { await safeFile(directory, "final.zip"); hasZip = true; } catch { /* Some working exports have no package. */ }
        let hasReport = false;
        if (pipeline) try { await safeFile(directory, `${entry.name}-summary.json`); hasReport = true; } catch { /* Optional for older deliveries. */ }
        found.push({ name: entry.name, rows: rowCount, hasZip, hasReport, pipeline, directory });
      } catch { /* Ignore incomplete dated folders. */ }
    }
    return found.sort((a, b) => b.name.localeCompare(a.name));
  };
  const statePath = resolve(outputRoot, "_tracking/ui-state.json");
  const catalog = options.companies
    ? { companies: options.companies, workbookRows: options.workbookRows || options.companies.length }
    : await loadCatalog(dataRoot);
  const state = await jsonFile<State>(statePath, { taken: {}, results: {}, runs: [] });
  const defaultCompanyIds = catalog.companies.map(company => company.id);
  state.importedCompanies ||= [];
  state.imports ||= [];
  state.settings ||= {};
  // Drop retired website engine choices while retaining each user's history.
  for (const setting of Object.values(state.settings)) delete (setting as Record<string, unknown>).engine;
  for (const imported of state.importedCompanies) {
    delete (imported as Company & { engine?: string }).engine;
    const existing = catalog.companies.find(company => company.id === imported.id);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, imported.name, ...imported.aliases])].filter(name => name !== existing.name);
      existing.website ||= imported.website;
      existing.apiUrl ||= imported.apiUrl;
      existing.sitemapUrl ||= imported.sitemapUrl;
    }
    else catalog.companies.push(imported);
  }
  if (!options.companies) await attachHistory(dataRoot, catalog.companies);
  for (const company of catalog.companies) Object.assign(company, state.settings[company.id] || {});
  const imports = new Imports(resolve(outputRoot, "_imports"));
  await mkdir(resolve(outputRoot, "_imports"), { recursive: true });
  if (!inside(realOutputRoot, await realpath(resolve(outputRoot, "_imports")))) throw new Error("Import staging must remain within the output directory.");
  await imports.cleanupStale();
  for (const run of state.runs) {
    run.logs ||= [];
    for (const item of run.items) item.logs ||= [];
    if (["running", "stopping"].includes(run.status)) {
      run.status = "interrupted"; run.finishedAt = new Date().toISOString();
      for (const item of run.items) if (["queued", "running"].includes(item.status)) item.status = "interrupted";
    }
  }
  const token = randomBytes(24).toString("hex");
  const children = new Set<ChildProcess>();
  let revision = 0;
  let active: Run | undefined;
  let closing = false;
  let saveQueue = Promise.resolve();
  const save = (): Promise<void> => {
    revision++;
    const snapshot = JSON.stringify(state, null, 2);
    saveQueue = saveQueue.then(async () => {
      await mkdir(dirname(statePath), { recursive: true });
      await writeFile(`${statePath}.tmp`, snapshot);
      await rename(`${statePath}.tmp`, statePath);
    });
    return saveQueue;
  };
  if (state.runs.length) await save();
  const find = (id: string): Company => {
    const company = catalog.companies.find(company => company.id === id);
    if (!company) throw Object.assign(new Error("Company not found."), { status: 404 });
    return company;
  };
  const result = (company: Company) => state.results[company.id] ||
    (company.resultDir && company.summary ? { directory: company.resultDir, summary: company.summary } : undefined);
  const resultDirectory = async (company: Company): Promise<string> => {
    const directory = result(company)?.directory;
    if (!directory || !inside(outputRoot, directory)) throw Object.assign(new Error("No output is available for this company."), { status: 404 });
    if (!inside(realOutputRoot, await realpath(directory))) throw Object.assign(new Error("Output path is outside the project."), { status: 403 });
    return directory;
  };
  /**
   * Company state is derived from structured run state, not from log text:
   * FAILED stays FAILED, a completed run with no usable jobs is NO JOBS, and a
   * company only counts as COLLECTED when a run actually produced rows.
   */
  const status = (company: Company): string => {
    const item = active?.items.find(item => item.companyId === company.id && ["running", "queued"].includes(item.status));
    if (item) return item.status;
    const latest = state.runs.flatMap(run => run.items).find(item => item.companyId === company.id);
    const saved = result(company);
    if (latest) {
      if (latest.status === "failed") return saved ? "needs-review" : "failed";
      if (latest.status === "empty") return Number(saved?.summary.jobs ?? 0) > 0 ? "completed" : "no-jobs";
      if (latest.status === "interrupted" || latest.status === "needs-review") return "needs-review";
      if (latest.status === "completed") return "completed";
    }
    if (saved) {
      const summaryStatus = String(saved.summary.status);
      const jobs = Number(saved.summary.jobs ?? 0);
      if (summaryStatus === "ok" && jobs > 0) return "completed";
      if (jobs === 0 && ["ok", "no_matches"].includes(summaryStatus)) return "no-jobs";
      return "needs-review";
    }
    return "ready";
  };
  /** Runs reused by the UI: isolated company logs stay capped per item. */
  const publicRun = (run: Run, full: boolean): Record<string, unknown> => ({
    ...run,
    logs: run.logs.slice(-RUN_LOG_LIMIT),
    items: run.items.map(item => ({
      ...item,
      logs: (item.logs || []).slice(-(full ? ITEM_LOG_LIMIT : HISTORY_ITEM_LOG_LIMIT)),
    })),
  });
  const runner: Runner = options.runner || ((company, directory, log) => new Promise((resolveRun, reject) => {
    const workerFile = "worker.ts";
    const child = fork(resolve(dirname(fileURLToPath(import.meta.url)), workerFile), [      JSON.stringify({ root, dataRoot, directory, company }),
      ], { cwd: root, execArgv: ["--import", import.meta.resolve("tsx")], silent: true });
    children.add(child);
    let summary: Record<string, unknown> | undefined;
    let buffer = "";
    const consume = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) if (line.trim()) log(line.replace(/\x1b\[[0-9;]*m/g, ""));
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.on("message", message => {
      const data = message as { type?: string; summary?: Record<string, unknown>; line?: string; metrics?: CompanyMetrics };
      if (data.type === "result") summary = data.summary;
      if (data.type === "log" && data.line) log(String(data.line));
      // Structured execution state: never reconstructed from log text.
      if (data.type === "progress" && data.metrics) log("", data.metrics);
    });
    child.on("error", reject);
    child.on("exit", code => {
      children.delete(child);
      if (buffer.trim()) log(buffer);
      if (code === 0 && summary) resolveRun(summary);
      else reject(new Error(`Scraper stopped${code !== null ? ` (exit ${code})` : ""}. Check the run log for details.`));
    });
  }));

  async function execute(run: Run): Promise<void> {
    // Fresh items start with their own isolated log stream.
    for (const item of run.items) item.logs ||= [];
    let cursor = 0;
    const runOne = async (): Promise<void> => {
      for (;;) {
        const item = run.items[cursor++];
        if (!item || closing) return;
        if (run.status === "stopping") { item.status = "cancelled"; await save(); continue; }
        const company = find(item.companyId);
        item.status = "running";
        item.metrics = {
          stage: "DISCOVERY", operation: "Starting", currentUrl: company.careersUrl, ats: "",
          pagesDiscovered: 0, pagesProcessed: 0, pagesTotal: 0, jobsDiscovered: 0, jobsProcessed: 0,
          jobsFound: 0, jobsSkipped: 0,
          startedAt: new Date().toISOString(), elapsedMs: 0,
        };
        await save();
        const directory = resolve(outputRoot, company.slug, "runs", run.id);
        // One isolated sink per company: its log lines never enter another
        // company's terminal, and its structured counters stay its own.
        const note = (line: string, metrics?: CompanyMetrics): void => {
          if (metrics) {
            const effective = metrics.elapsedMs || Date.now() - Date.parse(item.metrics?.startedAt || new Date().toISOString());
            item.metrics = { ...metrics, startedAt: item.metrics?.startedAt || metrics.startedAt, elapsedMs: effective };
            const counters = metricsCounters(item.metrics);
            if (counters.total) { item.progress = counters.progress; item.total = counters.total; }
            if (metrics.stage === "FAILED" && metrics.error) item.error = metrics.error;
            revision++;
          }
          if (line.trim()) {
            const entry = { time: new Date().toISOString(), message: line.slice(0, 2000) };
            item.logs.push(entry);
            if (item.logs.length > ITEM_LOG_LIMIT) item.logs.shift();
            run.logs.push(entry);
            if (run.logs.length > RUN_LOG_LIMIT) run.logs.shift();
            revision++;
          }
        };
        try {
          if (!inside(outputRoot, directory)) throw new Error("Company output path is outside the project.");
          await mkdir(dirname(directory), { recursive: true });
          if (!inside(realOutputRoot, await realpath(dirname(directory)))) throw new Error("Company output path is outside the project.");
          const summary = await runner(company, directory, note);
          item.summary = summary;
          // Keep a completed source report available even when it has no rows,
          // so the dashboard can show why the source returned no jobs.
          let hasReport = true;
          try { await safeFile(directory, "scrape-report.json"); } catch { hasReport = false; }
          if (hasReport) {
            state.results[company.id] = { directory, summary };
            company.resultDir = directory;
            company.summary = summary;
          }
          const unsupported = String(summary.status) === "unsupported";
          const jobs = Number(summary.jobs ?? 0);
          const empty = !unsupported && jobs === 0;
          if (unsupported) {
            item.status = "failed";
            item.error ||= String((summary.issues as string[] | undefined)?.[0] || "Extraction was unsupported for this source.");
          } else if (empty) {
            // A completed run with nothing usable is NOT a collection: it must
            // not be exported and must not be shown as collected.
            item.status = "empty";
            item.error = "The scrape finished but produced no jobs, so nothing is exported for this company.";
          } else if (summary.exportReady === false) {
            item.status = "needs-review";
            const quality = summary.quality as Record<string, unknown> | undefined;
            const failures = Object.entries(quality || {}).filter(([, count]) => Number(count) > 0)
              .map(([name, count]) => `${name}: ${count}`);
            item.error = `Quality checks need review${failures.length ? ` (${failures.join(", ")})` : ""}. CSV export is blocked.`;
          } else {
            item.status = "completed";
          }
          if (item.status !== "completed") {
            item.metrics = { ...(item.metrics as CompanyMetrics), stage: item.status === "needs-review" ? "REVIEW" : "FAILED", operation: item.error || "No usable jobs", error: item.error };
          }
        } catch (error) {
          item.status = "failed";
          item.error = error instanceof Error ? error.message : String(error);
          const message = `${company.name}: ${item.error}`;
          item.logs.push({ time: new Date().toISOString(), message });
          run.logs.push({ time: new Date().toISOString(), message });
          item.metrics = { ...(item.metrics as CompanyMetrics), stage: "FAILED", operation: item.error, error: item.error };
        }
        await save();
      }
    };
    const lanes = Math.max(1, Math.min(run.items.length || 1, options.runConcurrency ?? 1));
    await Promise.all(Array.from({ length: lanes }, runOne));
    const failed = run.items.filter(item => item.status === "failed").length;
    run.status = run.status === "stopping" ? "stopped" :
      failed || run.items.some(item => ["needs-review", "empty"].includes(item.status)) ? "needs-review" : "completed";
    run.finishedAt = new Date().toISOString();
    await save();
    active = undefined;
  }

  const server = createServer(async (request, response) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    const host = request.headers.host || "";
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    response.setHeader("Cache-Control", "no-store");
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    try {
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return json(403, { error: "Loopback host required." });
      const url = new URL(request.url || "/", `http://${host}`);
      if (request.method !== "GET") {
        if (request.method !== "POST") return json(405, { error: "Method not allowed." });
        if (request.headers.origin !== `http://${host}` || request.headers["x-workspace-token"] !== token) {
          return json(403, { error: "Open this dashboard on localhost to make changes." });
        }
      }
      async function body(): Promise<Record<string, unknown>> {
        let value = "";
        for await (const chunk of request) {
          value += chunk.toString();
          if (value.length > 16_384) throw Object.assign(new Error("Request is too large."), { status: 413 });
        }
        try {
          const parsed = JSON.parse(value || "{}");
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Object required.");
          return parsed;
        }
        catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
      }
      if (url.pathname === "/api/deliveries" && request.method === "GET") {
        return json(200, { deliveries: (await deliveries()).map(({ directory, ...delivery }) => delivery) });
      }
      const deliveryFile = deliveryRoute.exec(url.pathname);
      if (deliveryFile && request.method === "GET") {
        const name = deliveryFile[1]!;
        const file = deliveryFile[2]!;
        const pipeline = /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(name);
        const diskName = pipeline
          ? file === "companies.csv" ? `${name}.csv`
            : file === "report.json" ? `${name}-summary.json`
              : file
          : file;
        if (!pipeline && file !== "companies.csv" && file !== "final.zip") return json(404, { error: "Not found." });
        const delivery = (await deliveries()).find(item => item.name === name);
        if (!delivery) return json(404, { error: "Not found." });
        const directory = delivery.directory;
        const contents = await readFile(await safeFile(directory, diskName));
        response.writeHead(200, {
          "Content-Type": file.endsWith(".csv") ? "text/csv; charset=utf-8" : file.endsWith(".zip") ? "application/zip" : "application/json; charset=utf-8",
          "Content-Disposition": file.endsWith(".json") ? `inline; filename="${name}-${file}"` : `attachment; filename="${name}-${file}"`,
        });
        return response.end(contents);
      }
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        const companies = catalog.companies.map(company => ({
          ...company, resultDir: undefined, status: status(company), taken: false,
          summary: result(company)?.summary, hasOutput: Boolean(result(company)),
        }));
        return json(200, {
          token, revision, window: dateWindow(), workbookRows: catalog.workbookRows + state.imports!.reduce((sum, source) => sum + source.inputRows, 0),
          sources: [
            ...(catalog.workbookRows ? [{ id: "default", name: "COMPANIE LIST.xlsx", inputRows: catalog.workbookRows, companyIds: defaultCompanyIds }] : []),
            ...state.imports!,
          ],
          companies, activeRun: active ? publicRun(active, true) : null,
          runs: state.runs.map(run => (run === active ? publicRun(run, true) : publicRun(run, false))),
          stats: {
            companies: companies.length, completed: companies.filter(company => company.status === "completed").length,
            ready: companies.filter(company => company.status === "ready").length,
            failed: companies.filter(company => company.status === "failed").length,
            empty: companies.filter(company => company.status === "no-jobs").length,
            rows: companies.reduce((sum, company) => sum + Number(company.summary?.locationRows || 0), 0),
            notes: companies.reduce((sum, company) => sum + Number(company.summary?.reviewNotes || 0), 0),
          },
        });
      }
      if (url.pathname === "/api/imports/preview" && request.method === "POST") {
        try {
          const size = Number(request.headers["content-length"] || 0);
          if (size > IMPORT_LIMITS.bytes) return json(413, { error: "The file exceeds the 10 MB limit." });
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > IMPORT_LIMITS.bytes) return json(413, { error: "The file exceeds the 10 MB limit." });
            chunks.push(Buffer.from(chunk));
          }
          const name = decodeURIComponent(String(request.headers["x-upload-name"] || "upload.xlsx"));
          return json(200, await imports.preview(Buffer.concat(chunks), name));
        } catch (error) { return json(400, { error: (error as Error).message }); }
      }
      // Delete an uploaded source: removes the source record and the imported
      // company entries that belong ONLY to this source. Companies shared with
      // another source, their run history and their outputs are untouched.
      const deleteSource = /^\/api\/sources\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (deleteSource && request.method === "POST") {
        const index = state.imports!.findIndex(source => source.id === deleteSource[1]);
        if (index < 0) return json(404, { error: "That source does not exist or was already deleted." });
        const source = state.imports![index]!;
        const runningIds = new Set((active?.items || []).filter(item => ["queued", "running"].includes(item.status)).map(item => item.companyId));
        if (source.companyIds.some(id => runningIds.has(id))) {
          return json(409, { error: "A company from this source is in the running batch. Stop the run first." });
        }
        const otherSources = state.imports!.filter((_, i) => i !== index);
        // Workbook companies belong to the default source and are never removed.
        const removable = new Set(source.companyIds.filter(id => defaultCompanyIds.includes(id) === false));
        const removed: string[] = [];
        for (const id of removable) {
          const stillUsed = otherSources.some(other => other.companyIds.includes(id));
          if (stillUsed) continue;
          const companyIndex = state.importedCompanies!.findIndex(company => company.id === id);
          if (companyIndex >= 0) state.importedCompanies!.splice(companyIndex, 1);
          const catalogIndex = catalog.companies.findIndex(company => company.id === id);
          if (catalogIndex >= 0 && !defaultCompanyIds.includes(catalog.companies[catalogIndex]!.id)) catalog.companies.splice(catalogIndex, 1);
          delete state.settings![id];
          removed.push(id);
        }
        state.imports!.splice(index, 1);
        await save();
        return json(200, { deleted: source.name, removedCompanies: removed.length });
      }
      const importRoute = /^\/api\/imports\/([a-f0-9-]{36})\/(commit|discard|sheet)$/.exec(url.pathname);
      if (importRoute && request.method === "POST") {
        try {
          if (importRoute[2] === "discard") { await imports.discard(importRoute[1]!); return json(200, { discarded: true }); }
          const pending = imports.get(importRoute[1]!);
          if (importRoute[2] === "sheet") {
            const payload = await body();
            const index = Number(payload.sheet);
            const header = Number(payload.headerRow);
            const sheet = pending.sheets[index];
            if (!Number.isInteger(index) || !sheet || !Number.isInteger(header) || header < -1 || header >= sheet.rows.length) throw new Error("Choose a valid sheet and header row.");
            const start = header + 1;
            return json(200, {
              headers: header >= 0 ? sheet.rows[header] : [], sample: sheet.rows.slice(start, start + 5),
              rowNumbers: sheet.rows.slice(start, start + 5).map((_, i) => start + i),
              links: Object.fromEntries(Object.entries(sheet.links).filter(([cell]) => Number(cell.split(":")[0]) >= start && Number(cell.split(":")[0]) < start + 5).map(([cell, link]) => [cell, publicUrl(link)])),
            });
          }
          if (pending.committing) return json(409, { error: "This import is already being saved." });
          pending.committing = true;
          try {
            const payload = await body();
            const mapping = payload.mapping as ImportMapping;
            if (!mapping || typeof mapping !== "object") throw new Error("Choose the columns to import.");
            const mapped = mapImport(pending.sheets, mapping, pending.name);
            if (!mapped.companies.length) throw new Error("No valid public URLs were found. Check the worksheet and URL column.");
            let added = 0, merged = 0;
            const ids = new Set<string>();
            for (const incoming of mapped.companies) {
              ids.add(incoming.id);
              const existing = catalog.companies.find(company => company.id === incoming.id);
              let company = incoming;
              if (existing) {
                merged++;
                existing.aliases = [...new Set([...existing.aliases, incoming.name])].filter(name => name !== existing.name);
                existing.website ||= incoming.website;
                existing.apiUrl ||= incoming.apiUrl;
                existing.sitemapUrl ||= incoming.sitemapUrl;
                company = existing;
              } else { added++; catalog.companies.push(incoming); }
              const saved = { ...company, resultDir: undefined, summary: undefined };
              const index = state.importedCompanies!.findIndex(item => item.id === company.id);
              if (index < 0) state.importedCompanies!.push(saved);
              else state.importedCompanies![index] = saved;
            }
            if (!options.companies) await attachHistory(dataRoot, catalog.companies);
            for (const company of catalog.companies) Object.assign(company, state.settings![company.id] || {});
            const record: ImportRecord = {
              id: pending.id, name: pending.name, sheet: pending.sheets[mapping.sheet]!.name,
              importedAt: new Date().toISOString(), inputRows: mapped.inputRows,
              added, merged, rejected: mapped.rejected.length, companyIds: [...ids],
            };
            state.imports!.push(record);
            await save();
            await imports.discard(pending.id);
            return json(200, { ...record, rejectedRows: mapped.rejected.slice(0, 100), emptyRows: mapped.emptyRows });
          } finally { pending.committing = false; }
        } catch (error) { return json(400, { error: (error as Error).message }); }
      }
      if (url.pathname === "/api/runs" && request.method === "POST") {
        const payload = await body();
        if (active) return json(409, { error: "A batch is already running. Wait for it to finish." });
        const ids = payload.companyIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 5 || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) {
          return json(400, { error: "Select between one and five different companies." });
        }
        const chosen = ids.map(id => find(id));
        const run: Run = {
          id: randomUUID(), createdAt: new Date().toISOString(), status: "running", logs: [],
          items: chosen.map(company => ({ companyId: company.id, name: company.name, status: "queued", progress: 0, total: 0, logs: [] })),
        };
        state.runs.unshift(run); state.runs = state.runs.slice(0, 50); active = run;
        await save();
        void execute(run).catch(error => {
          run.status = "needs-review"; run.logs.push({ time: new Date().toISOString(), message: String(error) }); active = undefined;
          void save();
        });
        return json(202, { runId: run.id });
      }
      if (url.pathname === "/api/runs/stop" && request.method === "POST") {
        if (!active) return json(409, { error: "No batch is running." });
        active.status = "stopping"; await save();
        // Kill the running scraper worker now: a blocked or throttled source
        // can otherwise hold the stop request for minutes. Remaining companies
        // are skipped by the execute loop; the killed item is marked failed.
        for (const child of children) child.kill();
        return json(200, { message: "Stopping the current company now. Remaining companies will be skipped." });
      }
      // One company's isolated terminal: its own log stream plus the structured
      // execution state. Never mixes companies into a single readable-looking log.
      const terminal = /^\/api\/runs\/([a-f0-9-]{36})\/items\/([a-f0-9]{12})\/logs$/.exec(url.pathname);
      if (terminal && request.method === "GET") {
        const run = state.runs.find(candidate => candidate.id === terminal[1]);
        const item = run?.items.find(candidate => candidate.companyId === terminal[2]);
        if (!run || !item) return json(404, { error: "That company is not part of this run." });
        return json(200, {
          runId: run.id, runStatus: run.status, companyId: item.companyId, name: item.name,
          status: item.status, error: item.error, metrics: item.metrics ?? null,
          logs: (item.logs || []).slice(-TERMINAL_LOG_LIMIT),
        });
      }
      const route = /^\/api\/companies\/([a-f0-9]{12})\/(settings|results|download)$/.exec(url.pathname);
      if (route) {
        const company = find(route[1]!);
        if (route[2] === "settings" && request.method === "POST") {
          if (active?.items.some(item => item.companyId === company.id && ["queued", "running"].includes(item.status))) return json(409, { error: "Wait until this company's run finishes before changing its settings." });
          const payload = await body();
          if (!["auto", "api", "static", "dom"].includes(String(payload.mode))) return json(400, { error: "Choose Auto, API, Static, or DOM." });
          const config: Partial<Company> = { mode: payload.mode as Company["mode"] };
          for (const key of ["apiUrl", "sitemapUrl"] as const) {
            if (typeof payload[key] !== "string") return json(400, { error: "Endpoint URLs must be text." });
            config[key] = payload[key] ? publicUrl(payload[key]) : "";
            if (payload[key] && !config[key]) return json(400, { error: "Use a public HTTP(S) endpoint without embedded credentials." });
          }
          const allowed = new Set(["job", "jobLinks", "jobLinksOnly", "next", "loadMore", "title", "description", "jobId", "jobUrl", "postedDate", "jdDeadline", "company", "salaryRange", "employmentType", "worktype", "location", "city", "state", "country"]);
          const selectors = payload.selectors || {};
          if (typeof selectors !== "object" || Array.isArray(selectors)) return json(400, { error: "Selectors must be a JSON object." });
          for (const [name, selector] of Object.entries(selectors)) {
            if (!allowed.has(name) || typeof selector !== "string" || selector.length > 300) return json(400, { error: `Invalid selector setting: ${name}` });
            try { load("<div></div>")(selector); } catch { return json(400, { error: `Invalid CSS selector for ${name}.` }); }
          }
          config.selectors = selectors;
          const pages = payload.maxPages === "" || payload.maxPages == null ? undefined : Number(payload.maxPages);
          const wait = Number(payload.renderWaitMs ?? 1500);
          if (pages !== undefined && (!Number.isSafeInteger(pages) || pages < 1 || pages > 10000) || !Number.isSafeInteger(wait) || wait < 0 || wait > 10000) return json(400, { error: "Use Auto or 1–10000 pages and a render wait of 0–10000 ms." });
          config.maxPages = pages; config.renderWaitMs = wait;
          state.settings![company.id] = config;
          Object.assign(company, config);
          await save();
          return json(200, { saved: true });
        }
        if (request.method !== "GET") return json(405, { error: "Method not allowed." });
        const directory = await resultDirectory(company);
        if (route[2] === "results") {
          const outputDir = await safeFile(directory, "output").catch(() => directory);
          const rows = JSON.parse(await readFile(await safeFile(outputDir, "export-rows.json").catch(() => safeFile(directory, "export-rows.json")), "utf8")) as Record<string, string>[];
          const report = JSON.parse(await readFile(await safeFile(outputDir, "scrape-report.json").catch(() => safeFile(directory, "scrape-report.json")), "utf8"));
          const query = (url.searchParams.get("q") || "").toLowerCase();
          const filtered = rows.filter(row => (!query || `${row.title} ${row.jobId} ${row.location}`.toLowerCase().includes(query)) &&
            (url.searchParams.get("notes") !== "1" || row.reason));
          const offset = Math.max(0, Math.min(100_000, Number(url.searchParams.get("offset")) || 0));
          const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 10));
          return json(200, { company: company.name, rows: filtered.slice(offset, offset + limit), total: filtered.length, report });
        }
        if (route[2] === "download") {
          const kind = url.searchParams.get("kind");
          if (kind === "code") {
            const files: Record<string, Uint8Array> = {};
            const code = resolve(directory, "code");
            for (const name of ["scrape.ts", "package.json", "package-lock.json", "tsconfig.json"]) {
              files[`code/${name}`] = await readFile(await safeFile(directory, `code/${name}`));
            }
            for (const name of await readdir(resolve(code, "src"))) {
              if (name.endsWith(".ts") && !(await lstat(resolve(code, "src", name))).isSymbolicLink()) {
                files[`code/src/${name}`] = await readFile(await safeFile(directory, `code/src/${name}`));
              }
            }
            files["README.txt"] = Buffer.from("Run npm ci and npm run scrape inside code/. Results are written to the parent folder.\n");
            response.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${company.slug}-code.zip"` });
            return response.end(Buffer.from(zipSync(files, { level: 6 })));
          }
          const file = kind === "csv" ? "jobs.csv" : kind === "report" ? "scrape-report.json" : undefined;
          if (!file) return json(400, { error: "Choose csv, code, or report." });
          if (kind === "csv") {
            const reportPath = await safeFile(directory, "scrape-report.json").catch(async () => {
              const outputDir = await safeFile(directory, "output");
              return safeFile(outputDir, "scrape-report.json");
            });
            const report = JSON.parse(await readFile(reportPath, "utf8"));
            if (report.exportReady === false) return json(409, { error: "CSV export is blocked because there are no valid rows or quality checks need review. Open the company report for details." });
          }
          // Older runs may have outputs under output/; prefer root files.
          const contents = await readFile(await safeFile(directory, file).catch(async () => {
            const outputDir = await safeFile(directory, "output");
            return safeFile(outputDir, file);
          }));
          response.writeHead(200, {
            "Content-Type": kind === "csv" ? "text/csv; charset=utf-8" : "application/json",
            "Content-Disposition": `attachment; filename="${company.slug}-${file}"`,
          });
          return response.end(contents);
        }
      }
      if (request.method === "GET") {
        const asset = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        if (!["index.html", "app.js", "styles.css", "favicon.svg", "fonts/body.ttf", "fonts/mono.ttf"].includes(asset)) return json(404, { error: "Not found." });
        const contents = await readFile(resolve(publicDir, asset));
        const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
        response.writeHead(200, { "Content-Type": mime[extname(asset)] || "application/octet-stream" });
        return response.end(contents);
      }
      json(404, { error: "Not found." });
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = (error as { status?: number }).status || ((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500);
      json(status, { error: status === 500 ? "Could not complete this request. Check the local server terminal." : (error as Error).message });
      if (status === 500) console.error(error);
    }
  });
  return {
    server,
    close: async () => {
      closing = true;
      for (const child of children) child.kill();
      await imports.close();
      server.closeAllConnections();
      await new Promise<void>(resolveClose => server.close(() => resolveClose()));
      await saveQueue;
    },
  };
}
