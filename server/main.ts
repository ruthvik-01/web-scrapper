import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboard } from "./app.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || "4317");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
const app = await createDashboard({ root });
app.server.on("error", error => { console.error(error); process.exitCode = 1; });
app.server.listen(port, "127.0.0.1", () => {
  console.log(`\nFieldwork · UK job collector\nhttp://127.0.0.1:${port}\nLocal only. Press Ctrl+C to stop.\n`);
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().then(() => process.exit(0));
  });
}
