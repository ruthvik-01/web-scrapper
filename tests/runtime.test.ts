import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareDataRoot, resolveDataRoot } from "../server/runtime.js";
import { createDashboard } from "../server/app.js";
import { catalogFromRows } from "../server/catalog.js";
import { projectRoot } from "./dashboard-helpers.js";

test("data root defaults to the existing workspace and accepts a per-user folder", () => {
  const project = resolve("example", "web_scrapper_project");
  assert.equal(resolveDataRoot(project), resolve(project, ".."));
  assert.equal(resolveDataRoot(project, join(tmpdir(), "Fieldwork")), resolve(tmpdir(), "Fieldwork"));
});

test("dashboard changes stay in one data root and survive restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-isolation-"));
  const company = catalogFromRows([["company", "company_url", "career_url"], ["Example", "", "https://example.com/jobs"]])[0]!;
  const open = async (dataRoot: string) => {
    const app = await createDashboard({ root: projectRoot, dataRoot, companies: [{ ...company }] });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
    return { app, base, dashboard };
  };
  try {
    const a = await open(join(root, "a"));
    const b = await open(join(root, "b"));
    try {
      const response = await fetch(`${a.base}/api/companies/${company.id}/settings`, { method: "POST", headers: {
        "Content-Type": "application/json", "X-Workspace-Token": a.dashboard.token, Origin: a.base,
      }, body: JSON.stringify({ mode: "dom", apiUrl: "", sitemapUrl: "", selectors: {}, maxPages: 100, renderWaitMs: 100 }) });
      assert.equal(response.status, 200);
      const bNow = await (await fetch(`${b.base}/api/dashboard`)).json();
      assert.notEqual(bNow.companies[0].mode, "dom");
    } finally {
      await a.app.close();
      await b.app.close();
    }
    const reopened = await open(join(root, "a"));
    try { assert.equal(reopened.dashboard.companies[0].mode, "dom"); }
    finally { await reopened.app.close(); }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("data root preparation creates a folder and reports an unusable path", async () => {
  const root = await mkdtemp(join(tmpdir(), "fieldwork-root-"));
  try {
    const userRoot = join(root, "profile", "Fieldwork");
    await prepareDataRoot(userRoot);
    await writeFile(join(userRoot, "marker"), "saved");
    assert.equal(await readFile(join(userRoot, "marker"), "utf8"), "saved");
    const blocked = join(root, "occupied");
    await writeFile(blocked, "file");
    await assert.rejects(prepareDataRoot(blocked), /occupied/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
