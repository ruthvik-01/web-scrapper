/**
 * Jev judgment cache.
 *
 * A hit requires the exact same question set, question-set version and
 * semantic state (title, employer, location, date, salary, clipped advert
 * body) — mirroring the rule that a prior result may only be reused when the
 * entire input is unchanged. Never keyed on URL alone: two URLs carrying the
 * same semantic content legitimately share a judgment.
 *
 * Two layers: an in-memory map (dedupes identical pages within one run) and an
 * optional on-disk store (carries judgments across reruns, debug runs and
 * comparison runs). Set JEV_CACHE=0 to disable the disk layer.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface DiskEntry { answers: Record<string, unknown>; savedAt: string }
interface DiskShape { version: string; entries: Record<string, DiskEntry> }

export class JudgmentCache {
  private memory = new Map<string, Record<string, unknown>>();
  private disk = new Map<string, Record<string, unknown>>();
  private dirty = false;
  hits = 0;
  misses = 0;

  constructor(
    private readonly filePath?: string,
    private readonly capacity = 4000,
  ) {}

  /** Load the disk layer, ignoring entries from other question versions. */
  static async open(filePath?: string): Promise<JudgmentCache> {
    const cache = new JudgmentCache(filePath);
    if (!filePath) return cache;
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as DiskShape;
      if (parsed?.version && parsed.entries) {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (entry?.answers) cache.disk.set(key, entry.answers);
        }
      }
    } catch {
      // missing or unreadable cache file: start empty
    }
    return cache;
  }

  makeKey(version: string, questions: string[], state: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify([version, questions, state]))
      .digest("hex");
  }

  get(key: string): Record<string, unknown> | undefined {
    const hit = this.memory.get(key) ?? this.disk.get(key);
    if (hit) {
      this.hits++;
      return hit;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, answers: Record<string, unknown>): void {
    this.memory.set(key, answers);
    if (this.filePath && this.disk.size < this.capacity) {
      this.disk.set(key, answers);
      this.dirty = true;
    }
  }

  async flush(): Promise<void> {
    if (!this.filePath || !this.dirty) return;
    const entries: Record<string, DiskEntry> = {};
    for (const [key, answers] of this.disk) {
      entries[key] = { answers, savedAt: new Date().toISOString() };
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ version: "jev-judgments/1", entries }));
    this.dirty = false;
  }
}
