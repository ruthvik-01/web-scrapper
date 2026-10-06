import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { projectRoot } from "./dashboard-helpers.js";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

function launch(port: number, dataRoot: string): { child: ChildProcess; output: () => string } {
  let log = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server/main.ts"], {
    cwd: projectRoot, env: { ...process.env, PORT: String(port), FIELDWORK_DATA_DIR: dataRoot, FIELDWORK_OPEN_BROWSER: "0" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  child.stdout?.on("data", chunk => { log += String(chunk); });
  child.stderr?.on("data", chunk => { log += String(chunk); });
  return { child, output: () => log };
}

async function waitForDashboard(port: number): Promise<unknown> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      if (response.ok) return response.json();
    } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Fieldwork did not start");
}

test("local launch uses private data and a second launch exits without another writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-launch-"));
  const port = await freePort();
  const first = launch(port, root);
  try {
    const dashboard = await waitForDashboard(port) as { companies: unknown[]; token: string };
    assert.equal(dashboard.companies.length, 0);
    assert.equal(typeof dashboard.token, "string");
    const second = launch(port, root);
    const [code] = await once(second.child, "exit") as [number];
    assert.equal(code, 0, second.output());
    assert.match(second.output(), /already running/);
    assert.deepEqual(await readdir(root), ["output"]);
    assert.equal((await waitForDashboard(port) as { companies: unknown[] }).companies.length, 0);
  } finally {
    first.child.kill();
    await once(first.child, "exit").catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("a foreign program on the port is reported as a conflict", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-conflict-"));
  const server = createServer((_request, response) => { response.end("another program"); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const instance = launch(address.port, root);
    const [code] = await once(instance.child, "exit") as [number];
    assert.equal(code, 1);
    assert.match(instance.output(), /used by another program/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows launcher rejects a missing user data location", async () => {
  const child = spawn("cmd.exe", ["/d", "/c", "Start-Fieldwork.cmd"], {
    cwd: projectRoot, env: { ...process.env, LOCALAPPDATA: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  child.stdout?.on("data", chunk => { output += String(chunk); });
  child.stderr?.on("data", chunk => { output += String(chunk); });
  const [code] = await once(child, "exit") as [number];
  assert.equal(code, 1);
  assert.match(output, /LOCALAPPDATA is unavailable/);
});
