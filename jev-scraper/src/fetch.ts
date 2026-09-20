import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
import { canonicalUrl } from "./normalize.js";
import { Timings } from "./metrics.js";

const USER_AGENT = "JevJobScraper/0.1";
interface Rules {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
}
// robots-parser is CommonJS; its bundled declaration is not NodeNext-compatible.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, body: string) => Rules;

/**
 * Token-bucket pacing for one origin. Capacity equals the page concurrency and
 * the bucket refills one token per `refillMs`, so `delayMs` is the period of a
 * full-concurrency wave — bounded in-flight requests at a bounded rate — rather
 * than the old behaviour where a stamp overwrite let a whole wave fire at once
 * and redirects were paced twice. A 429/5xx doubles the refill period for the
 * rest of the run ( honouring Retry-After); a robots crawl-delay raises it.
 */
class OriginPacer {
  private readonly capacity: number;
  private readonly baseRefillMs: number;
  private refillMs: number;
  private tokens: number;
  private last = Date.now();

  constructor(capacity: number, delayMs: number, robotsDelayMs = 0) {
    this.capacity = Math.max(1, capacity);
    // One full wave every delayMs, never faster than robots.txt allows.
    this.baseRefillMs = Math.max(1, delayMs / this.capacity, robotsDelayMs);
    this.refillMs = this.baseRefillMs;
    this.tokens = this.capacity;
  }

  /** A rate-limited or failing origin earns a longer refill period. */
  backoff(retryAfterMs?: number): void {
    const proposed = retryAfterMs && retryAfterMs > this.refillMs ? retryAfterMs : this.refillMs * 2;
    this.refillMs = Math.min(20_000, Math.max(this.baseRefillMs, proposed));
  }

  /** Wait until a token is available; concurrent callers queue fairly. */
  async reserve(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) / this.refillMs);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.ceil((1 - this.tokens) * this.refillMs));
    }
  }
}

/** robots.txt-aware, per-origin paced HTML/JSON fetching. Never bypasses access controls. */
export class Http {
  private rules = new Map<string, Promise<Rules>>();
  private pacers = new Map<string, Promise<OriginPacer>>();
  readonly fetchMs = new Timings();
  requests = 0;
  failures = 0;
  backoffs = 0;

  constructor(private delayMs = 800, private timeoutMs = 30_000, private capacity = 6) {}

  private getRules(url: string): Promise<Rules> {
    const origin = new URL(url).origin;
    if (!this.rules.has(origin)) {
      this.rules.set(origin, (async () => {
        const robotsUrl = `${origin}/robots.txt`;
        try {
          const response = await fetch(robotsUrl, {
            headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(this.timeoutMs),
          });
          if (response.status === 404 || response.status === 410) return robotsParser(robotsUrl, "");
          if (!response.ok) return robotsParser(robotsUrl, "");
          const content = await response.text();
          return robotsParser(robotsUrl, content.length > 500_000 ? "" : content);
        } catch {
          return robotsParser(robotsUrl, ""); // unreachable robots: allow, but stay paced
        }
      })());
    }
    return this.rules.get(origin)!;
  }

  private getPacer(url: string): Promise<OriginPacer> {
    const origin = new URL(url).origin;
    if (!this.pacers.has(origin)) {
      this.pacers.set(origin, this.getRules(url).then(rules =>
        new OriginPacer(this.capacity, this.delayMs, (rules.getCrawlDelay(USER_AGENT) || 0) * 1000)));
    }
    return this.pacers.get(origin)!;
  }

  private async permitted(url: string): Promise<void> {
    const rules = await this.getRules(url);
    if (rules.isAllowed(url, USER_AGENT) === false) throw new Error("Disallowed by robots.txt.");
  }

  /** Returns the final URL and body, following redirects manually with robots checks. */
  async html(url: string, redirects = 0): Promise<{ url: string; body: string }> {
    await this.permitted(url);
    // Pace the original request only; redirect hops are robots-checked but not
    // re-paced, so a redirect chain no longer pays the wave delay per hop.
    if (redirects === 0) await (await this.getPacer(url)).reserve();
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(this.timeoutMs), redirect: "manual",
      });
    } catch (error) {
      this.failures++;
      throw error;
    }
    this.requests++;
    this.fetchMs.add(Date.now() - started);
    if (response.status >= 300 && response.status < 400) {
      const next = canonicalUrl(response.headers.get("location") || "", url);
      if (!next || redirects >= 5) {
        this.failures++;
        throw new Error(`Redirect limit at ${url}.`);
      }
      return this.html(next, redirects + 1);
    }
    if (!response.ok) {
      this.failures++;
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "");
        (await this.getPacer(url)).backoff(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 20_000) : undefined);
        this.backoffs++;
      }
      throw new Error(`HTTP ${response.status} for ${url}.`);
    }
    return { url, body: await response.text() };
  }
}
