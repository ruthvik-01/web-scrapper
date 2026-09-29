import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./dashboard-helpers.js";

const run = promisify(execFile);
const script = join(projectRoot, "Choose-Fieldwork-Location.ps1");
const invoke = (localAppData: string, args: string[]) => run("powershell.exe", ["-NoProfile", "-Sta", "-ExecutionPolicy", "Bypass", "-File", script, ...args], {
  cwd: projectRoot, env: { ...process.env, LOCALAPPDATA: localAppData, PORT: "0" }, windowsHide: true,
});

test("folder chooser copies an existing profile and saves the selected location", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-location-"));
  try {
    const local = join(root, "Local AppData");
    const old = join(local, "Fieldwork", "output", "_tracking");
    const destination = join(root, "Chosen Ü Data");
    await mkdir(old, { recursive: true });
    await writeFile(join(old, "ui-state.json"), '{"imports":[]}');
    await mkdir(destination);
    const before = await invoke(local, ["-Read"]);
    assert.equal(before.stdout.trim(), join(local, "Fieldwork"));
    await invoke(local, ["-Destination", destination]);
    assert.equal((await invoke(local, ["-Read"])).stdout.trim(), destination);
    assert.equal(await readFile(join(destination, "output", "_tracking", "ui-state.json"), "utf8"), '{"imports":[]}');
    assert.equal(await readFile(join(old, "ui-state.json"), "utf8"), '{"imports":[]}');
    const movedAgain = join(root, "Second Data");
    await mkdir(movedAgain);
    await invoke(local, ["-Destination", movedAgain]);
    assert.equal((await invoke(local, ["-Read"])).stdout.trim(), movedAgain);
    assert.equal(await readFile(join(movedAgain, "output", "_tracking", "ui-state.json"), "utf8"), '{"imports":[]}');
    assert.equal(await readFile(join(destination, "output", "_tracking", "ui-state.json"), "utf8"), '{"imports":[]}');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid or canceled location leaves the saved location unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-location-"));
  try {
    const local = join(root, "Local AppData");
    const old = join(local, "Fieldwork");
    await mkdir(old, { recursive: true });
    const occupied = join(root, "occupied");
    await mkdir(occupied);
    await writeFile(join(occupied, "existing.txt"), "keep");
    await assert.rejects(invoke(local, ["-Destination", occupied]));
    await assert.rejects(invoke(local, ["-Destination", join(old, "nested")]));
    await invoke(local, ["-Destination", ""]);
    assert.equal((await invoke(local, ["-Read"])).stdout.trim(), old);
  } finally { await rm(root, { recursive: true, force: true }); }
});
