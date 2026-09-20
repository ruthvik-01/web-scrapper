import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load jev-scraper/.env without a dependency; existing env vars win. */
export function loadEnv(): void {
  try {
    const file = readFileSync(resolve(import.meta.dirname ?? process.cwd(), "..", ".env"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional; the key can also come from the shell.
  }
}
