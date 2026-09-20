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

export interface RunItem {
  companyId: string; name: string; status: "queued" | "running" | "completed" | "needs-review" | "failed" | "cancelled" | "interrupted";
  progress: number; total: number; error?: string; summary?: Record<string, unknown>;
}
export interface Run {
  id: string; createdAt: string; finishedAt?: string;
  status: "running" | "completed" | "stopping" | "stopped" | "needs-review" | "interrupted";
  items: RunItem[]; logs: { time: string; message: string }[];
}
export type Runner = (company: Company, directory: string, log: (line: string) => void) => Promise<Record<string, unknown>>;
interface ImportRecord { id: string; name: string; sheet: string; importedAt: string; inputRows: number; added: number; merged: number; rejected: number; companyIds: string[] }
interface State {
  taken: Record<string, boolean>;
  results: Record<string, { directory: string; summary: Record<string, unknown> }>;
  runs: Run[];
  importedCompanies?: Company[];
  imports?: ImportRecord[];
  settings?: Record<string, Partial<Company>>;
}
export interface AppOptions { root: string; companies?: Company[]; workbookRows?: number; runner?: Runner; publicDir?: string }

export function inside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
async function safeFile(directory: string, name: string): Promise<string> {
  const file = resolve(directory, name);
  if (!inside(directory, file) || !inside(await realpath(directory), await realpath(file))) throw new Error("Unsafe file path.");
  return file;
}

export async function createDashboard(options: AppOptions): Promise<{ server: Server; close: () => Promise<void> }> {
  const root = resolve(options.root);
  const publicDir = options.publicDir || resolve(dirname(fileURLToPath(import.meta.url)), "../ui");
  const outputRoot = resolve(root, "output");
  await mkdir(outputRoot, { recursive: true });
  const realOutputRoot = await realpath(outputRoot);
  if (!inside(await realpath(root), realOutputRoot)) throw new Error("Output directory must remain within the project.");
  const statePath = resolve(outputRoot, "_tracking/ui-state.json");
  const catalog = options.companies
    ? { companies: options.companies, workbookRows: options.workbookRows || options.companies.length }
    : await loadCatalog(root);
  const state = await jsonFile<State>(statePath, { taken: {}, results: {}, runs: [] });
  const defaultCompanyIds = catalog.companies.map(company => company.id);
  state.importedCompanies ||= [];
  state.imports ||= [];
  state.settings ||= {};
  for (const imported of state.importedCompanies) {
    const existing = catalog.companies.find(company => company.id === imported.id);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, imported.name, ...imported.aliases])].filter(name => name !== existing.name);
      existing.website ||= imported.website;
      existing.apiUrl ||= imported.apiUrl;
      existing.sitemapUrl ||= imported.sitemapUrl;
    }
    else catalog.companies.push(imported);
  }
  if (!options.companies) await attachHistory(root, catalog.companies);
  for (const company of catalog.companies) Object.assign(company, state.settings[company.id] || {});
  const imports = new Imports(resolve(outputRoot, "_imports"));
  await mkdir(resolve(outputRoot, "_imports"), { recursive: true });
  if (!inside(realOutputRoot, await realpath(resolve(outputRoot, "_imports")))) throw new Error("Import staging must remain within the output directory.");
  await imports.cleanupStale();
  for (const run of state.runs) {
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
  const taken = (company: Company) => state.taken[company.id] ?? company.taken;
  const status = (company: Company): string => {
    const item = active?.items.find(item => item.companyId === company.id && ["running", "queued"].includes(item.status));
    if (item) return item.status;
    if (taken(company)) return "taken";
    const latest = state.runs.flatMap(run => run.items).find(item => item.companyId === company.id);
    if (latest && ["failed", "interrupted", "needs-review"].includes(latest.status)) return "needs-review";
    const saved = result(company);
    if (saved) return ["ok", "no_matches"].includes(String(saved.summary.status)) ? "completed" : "needs-review";
    return "ready";
  };
  const runner: Runner = options.runner || ((company, directory, log) => new Promise((resolveRun, reject) => {
    const workerFile = company.engine === "jev" ? "jev-worker.ts" : "worker.ts";
    const child = fork(resolve(dirname(fileURLToPath(import.meta.url)), workerFile), [
      JSON.stringify({ root, directory, company }),
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
      const data = message as { type?: string; summary?: Record<string, unknown>; line?: string };
      if (data.type === "result") summary = data.summary;
      if (data.type === "log" && data.line) log(String(data.line));
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
    for (const item of run.items) {
      if (closing) return;
      if (run.status === "stopping") { item.status = "cancelled"; continue; }
      const company = find(item.companyId);
      item.status = "running";
      await save();
      const directory = resolve(outputRoot, company.slug, "runs", run.id);
      try {
        if (!inside(outputRoot, directory)) throw new Error("Company output path is outside the project.");
        await mkdir(dirname(directory), { recursive: true });
        if (!inside(realOutputRoot, await realpath(dirname(directory)))) throw new Error("Company output path is outside the project.");
        const summary = await runner(company, directory, line => {
          run.logs.push({ time: new Date().toISOString(), message: line.slice(0, 2000) });
          if (run.logs.length > 150) run.logs.shift();
          const progress = /(\d+)\/(\d+) job pages read/.exec(line);
          if (progress) { item.progress = Number(progress[1]); item.total = Number(progress[2]); }
          revision++;
        });
        item.summary = summary;
        item.status = ["ok", "no_matches"].includes(String(summary.status)) ? "completed" : "needs-review";
        state.results[company.id] = { directory, summary };
      } catch (error) {
        item.status = "failed"; item.error = error instanceof Error ? error.message : String(error);
        run.logs.push({ time: new Date().toISOString(), message: `${company.name}: ${item.error}` });
      }
      await save();
    }
    run.status = run.status === "stopping" ? "stopped" :
      run.items.some(item => ["failed", "needs-review"].includes(item.status)) ? "needs-review" : "completed";
    run.finishedAt = new Date().toISOString();
    active = undefined;
    await save();
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
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        const companies = catalog.companies.map(company => ({
          ...company, resultDir: undefined, status: status(company), taken: taken(company),
          summary: result(company)?.summary, hasOutput: Boolean(result(company)),
        }));
        return json(200, {
          token, revision, window: dateWindow(), workbookRows: catalog.workbookRows + state.imports!.reduce((sum, source) => sum + source.inputRows, 0),
          sources: [
            ...(catalog.workbookRows ? [{ id: "default", name: "COMPANIE LIST.xlsx", inputRows: catalog.workbookRows, companyIds: defaultCompanyIds }] : []),
            ...state.imports!,
          ],
          companies, activeRun: active || null, runs: state.runs,
          stats: {
            companies: companies.length, completed: companies.filter(company => company.status === "completed").length,
            ready: companies.filter(company => company.status === "ready").length,
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
            if (!options.companies) await attachHistory(root, catalog.companies);
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
        if (chosen.some(taken)) return json(409, { error: "A selected company is marked as taken." });
        const run: Run = {
          id: randomUUID(), createdAt: new Date().toISOString(), status: "running", logs: [],
          items: chosen.map(company => ({ companyId: company.id, name: company.name, status: "queued", progress: 0, total: 0 })),
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
      const route = /^\/api\/companies\/([a-f0-9]{12})\/(taken|settings|results|download)$/.exec(url.pathname);
      if (route) {
        const company = find(route[1]!);
        if (route[2] === "settings" && request.method === "POST") {
          if (active?.items.some(item => item.companyId === company.id && ["queued", "running"].includes(item.status))) return json(409, { error: "Wait until this company's run finishes before changing its settings." });
          const payload = await body();
          const engine = payload.engine === undefined ? (company.engine || "deterministic") : String(payload.engine);
          if (!["deterministic", "jev"].includes(engine)) return json(400, { error: "Choose the deterministic or Jev engine." });
          if (!["auto", "api", "static", "dom"].includes(String(payload.mode))) return json(400, { error: "Choose Auto, API, Static, or DOM." });
          const config: Partial<Company> = { mode: payload.mode as Company["mode"] };
          for (const key of ["apiUrl", "sitemapUrl"] as const) {
            if (typeof payload[key] !== "string") return json(400, { error: "Endpoint URLs must be text." });
            config[key] = payload[key] ? publicUrl(payload[key]) : "";
            if (payload[key] && !config[key]) return json(400, { error: "Use a public HTTP(S) endpoint without embedded credentials." });
          }
          const allowed = new Set(["job", "jobLinks", "next", "loadMore", "title", "description", "jobId", "jobUrl", "postedDate", "jdDeadline", "company", "salaryRange", "employmentType", "worktype", "location", "city", "state", "country"]);
          const selectors = payload.selectors || {};
          if (typeof selectors !== "object" || Array.isArray(selectors)) return json(400, { error: "Selectors must be a JSON object." });
          for (const [name, selector] of Object.entries(selectors)) {
            if (!allowed.has(name) || typeof selector !== "string" || selector.length > 300) return json(400, { error: `Invalid selector setting: ${name}` });
            try { load("<div></div>")(selector); } catch { return json(400, { error: `Invalid CSS selector for ${name}.` }); }
          }
          config.selectors = selectors;
          const pages = Number(payload.maxPages ?? 250);
          const wait = Number(payload.renderWaitMs ?? 1500);
          if (!Number.isSafeInteger(pages) || pages < 1 || pages > 1000 || !Number.isSafeInteger(wait) || wait < 0 || wait > 10000) return json(400, { error: "Use 1–1000 pages and a render wait of 0–10000 ms." });
          config.maxPages = pages; config.renderWaitMs = wait;
          config.engine = engine as Company["engine"];
          state.settings![company.id] = config;
          Object.assign(company, config);
          await save();
          return json(200, { saved: true });
        }
        if (route[2] === "taken" && request.method === "POST") {
          const payload = await body();
          if (typeof payload.taken !== "boolean") return json(400, { error: "taken must be true or false." });
          if (active?.items.some(item => item.companyId === company.id && ["queued", "running"].includes(item.status))) {
            return json(409, { error: "This company is in the running batch." });
          }
          state.taken[company.id] = payload.taken; await save();
          return json(200, { taken: payload.taken });
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
          // Jev-engine runs keep the parent-contract CSV at the run root and the
          // engine's own outputs under output/; prefer the root files.
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
