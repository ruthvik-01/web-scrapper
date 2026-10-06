import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const app = await realpath(resolve(import.meta.dirname, ".."));
const build = resolve(app, "dist-universal");
if (process.argv.includes("--clean")) {
  if (dirname(build) !== app) throw new Error("Unsafe build directory.");
  try { if (await realpath(build) !== build) throw new Error("Build directory must not be a link."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await rm(build, { recursive: true, force: true });
} else {
  const target = resolve(build, "config");
  await mkdir(target, { recursive: true });
  await cp(resolve(app, "config"), target, { recursive: true });
}
