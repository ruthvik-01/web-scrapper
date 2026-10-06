import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export function resolveDataRoot(projectRoot: string, configured?: string): string {
  return resolve(configured || resolve(projectRoot, ".."));
}

export async function prepareDataRoot(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
    await access(path, constants.R_OK | constants.W_OK);
  } catch (error) {
    throw new Error(`Cannot use Fieldwork data folder ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
