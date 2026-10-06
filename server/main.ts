import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { createDashboard } from "./app.js";
import { prepareDataRoot, resolveDataRoot } from "./runtime.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Direct developer starts retain the parent workspace; the Windows launcher
// sets FIELDWORK_DATA_DIR to the current user's local data folder.
const dataRoot = resolveDataRoot(root, process.env.FIELDWORK_DATA_DIR);
await prepareDataRoot(dataRoot);
const port = Number(process.env.PORT || "4317");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
// Companies run concurrently only when asked: DASHBOARD_CONCURRENCY=1..5.
// Each company already processes its own jobs concurrently inside its worker.
const requested = Number(process.env.DASHBOARD_CONCURRENCY || "1");
const runConcurrency = Number.isSafeInteger(requested) ? Math.max(1, Math.min(5, requested)) : 1;
const app = await createDashboard({ root, dataRoot, runConcurrency });
const url = `http://127.0.0.1:${port}/`;
function openBrowser(): void {
  if (process.env.FIELDWORK_OPEN_BROWSER !== "1") return;
  execFile("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true }, error => {
    if (error) console.warn(`Could not open browser. Visit ${url}`);
  });
}
app.server.on("error", async error => {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    try {
      const response = await fetch(`${url}api/dashboard`, { signal: AbortSignal.timeout(1500) });
      const payload = response.ok ? await response.json() : null;
      if (payload && typeof payload.token === "string" && Array.isArray(payload.companies) && payload.stats) {
        console.log(`Fieldwork is already running at ${url}`);
        openBrowser();
        return;
      }
    } catch { /* Another program owns the port. */ }
    console.error(`Port ${port} is used by another program. Close it or set PORT to a free port.`);
  } else console.error(error);
  process.exitCode = 1;
});
app.server.listen(port, "127.0.0.1", () => {
  console.log(`\nFieldwork · UK job collector\n${url}\nLocal only. Company concurrency: ${runConcurrency}. Press Ctrl+C to stop.\n`);
  openBrowser();
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().then(() => process.exit(0));
  });
}
