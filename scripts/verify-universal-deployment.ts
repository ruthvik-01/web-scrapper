import { cp, mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { loadCompanies } from "../src/companies.js";
const app = resolve(import.meta.dirname, "..");
const parent = await realpath(tmpdir());
const staging = await mkdtemp(join(parent, "universal-deployment-"));
const commands: { command: string; exit: number; output: string }[] = [];
async function run(args: string[]) {
  return await new Promise<{ command: string; exit: number; output: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, args, { cwd: staging, windowsHide: true });
    let output = "";
    child.stdout.on("data", value => { output += value.toString(); });
    child.stderr.on("data", value => { output += value.toString(); });
    child.on("error", reject);
    child.on("exit", code => resolveResult({ command: ["node", ...args].join(" "), exit: code ?? 1, output }));
  });
}
try {
  for (const file of ["universal.ts", "src", "config", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.build.json", "scripts/build-universal-config.ts"]) {
    await cp(resolve(app, file), resolve(staging, file), { recursive: true });
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run with npm run verify:deployment.");
  for (const args of [[npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], [npm, "run", "build"],
    [npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], ["dist-universal/universal.js", "--list"]]) {
    const result = await run(args); commands.push(result);
    if (result.exit !== 0) throw new Error(`Deployment check failed: ${result.command}`);
  }
  const listed = commands.at(-1)!.output.trim().split(/\r?\n/);
  const expected = (await loadCompanies()).map(company => `${company.slug}\t${company.platform}\t${company.name}`);
  assert.deepEqual(listed, expected, "Clean deployment must list the current source catalog exactly.");
  await readFile(join(staging, "dist-universal/config/companies-held.json"));
  await readFile(join(staging, "dist-universal/universal.d.ts"));
  console.log(`Clean build + production-only install/compiled CLI: ${expected.length} configurations; held catalog/types present.`);
} finally {
  await writeFile(resolve(app, "docs/universal-implementation/deployment-check.json"), JSON.stringify({ checkedAt: new Date().toISOString(), commands }, null, 2) + "\n");
  const actual = await realpath(staging);
  if (!actual.startsWith(parent + sep) || !actual.includes("universal-deployment-")) throw new Error("Unsafe deployment cleanup.");
  await rm(actual, { recursive: true, force: true });
}
