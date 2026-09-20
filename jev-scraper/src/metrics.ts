/** Lightweight performance instrumentation for scraper stages. */

/** Samples of one stage's duration, with avg/p95 summaries for the report. */
export class Timings {
  private samples: number[] = [];

  add(ms: number): void {
    if (Number.isFinite(ms)) this.samples.push(ms);
  }

  stats(): { count: number; totalMs: number; avgMs: number; p95Ms: number } {
    const n = this.samples.length;
    if (!n) return { count: 0, totalMs: 0, avgMs: 0, p95Ms: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const totalMs = Math.round(sorted.reduce((sum, ms) => sum + ms, 0));
    return {
      count: n,
      totalMs,
      avgMs: Math.round(totalMs / n),
      p95Ms: Math.round(sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)]!),
    };
  }
}

/** Count occurrences of each value (used for skip reasons and link funnels). */
export function histogram(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}
