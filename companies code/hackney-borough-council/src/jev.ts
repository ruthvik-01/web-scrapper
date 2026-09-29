/**
 * Jev decision client with provider fallback. Jev cannot fetch pages, emit free
 * text or do arithmetic; it answers typed questions about a caller-supplied
 * state. Provider adapters and wire details live in providers.ts.
 */
import {
  isHardJevFailure, normalizeResult, providers, wireQuestion,
  type Provider, type QuestionSpec, type SystemOneResult,
} from "./providers.js";
import type { JudgmentCache } from "./cache.js";

const MAX_CHARS = 24_000; // 32k-token budget shared with questions; ~4 chars/token.

/** Testing hook: replaces the network call for a single provider. */
export type DecideHook = (body: unknown, provider: Provider) => Promise<SystemOneResult>;

export interface JevOptions {
  timeoutMs?: number;
  maxChars?: number;
  /** Explicit provider order; defaults to the environment. */
  providers?: Provider[];
  decide?: DecideHook;
}

export type {
  Answer, ChoiceAnswer, BooleanAnswer, QuestionSpec, SystemOneResult, Provider,
} from "./providers.js";
export { choiceOf, boolOf, noulOf, isHardJevFailure } from "./providers.js";

export class Jev {
  private timeoutMs: number;
  private maxChars: number;
  private order: Provider[];
  private decide?: DecideHook;
  private cursor = 0;
  readonly providers: Provider[];
  /**
   * Optional input-keyed judgment cache. Judgments are only reused when the
   * question set, version and whole semantic state are identical (see
   * questions.ts); the scraper attaches one when a run should reuse results.
   */
  cache?: JudgmentCache;
  requests = 0;
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  totalMs = 0;

  constructor(options: JevOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxChars = options.maxChars ?? MAX_CHARS;
    this.decide = options.decide;
    this.order = options.providers ?? providers();
    // A test hook still needs at least one provider to drive the fallback loop.
    if (this.decide && !this.order.length) {
      this.order.push({ name: "vercel", endpoint: "injected", model: "injected", apiKey: "" });
    }
    this.providers = this.order;
  }

  get live(): boolean {
    return Boolean(this.decide || this.order.length);
  }

  /** The provider the next call will use. */
  get active(): string {
    return this.order[this.cursor]?.name ?? "none";
  }

  async ask(state: unknown, questions: Record<string, QuestionSpec>): Promise<SystemOneResult> {
    const started = Date.now();
    const result = await this.send(state, questions);
    this.requests++;
    this.totalMs += Date.now() - started;
    this.inputTokens += result.usage?.inputTokens ?? 0;
    this.outputTokens += result.usage?.outputTokens ?? 0;
    this.costUsd += result.usage?.costUsd ?? 0;
    return result;
  }

  /** Try the active provider, retry transient errors, fall forward on hard errors. */
  private async send(state: unknown, questions: Record<string, QuestionSpec>): Promise<SystemOneResult> {
    let lastError: unknown;
    while (this.cursor < this.order.length) {
      const provider = this.order[this.cursor]!;
      const wire = {
        model: provider.model, state,
        questions: Object.fromEntries(
          Object.entries(questions).map(([key, spec]) => [key, wireQuestion(spec, provider)]),
        ),
      };
      try {
        const result = this.decide
          ? await this.decide(wire, provider)
          : normalizeResult(await this.postWithRetry(provider, wire), provider);
        result.provider ||= provider.name;
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isHardJevFailure(message)) {
          this.cursor++; // this provider is done for the run; try the next one
          continue;
        }
        throw error; // transient, non-provider failure: let the caller retry
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No Jev provider available.");
  }

  private async postWithRetry(provider: Provider, body: unknown, attempts = 3): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(provider.endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = error;
        await this.sleep(this.backoffMs(attempt));
        continue;
      }
      if (response.ok) return (await response.json()) as Record<string, unknown>;
      const detail = await response.text().catch(() => "");
      lastError = new Error(`Jev HTTP ${response.status} via ${provider.name}: ${detail.slice(0, 300)}`);
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      if (response.status === 429 || response.status >= 500) {
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 20_000) : this.backoffMs(attempt));
        continue;
      }
      throw lastError; // other 4xx will not change on retry
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private backoffMs(attempt: number): number {
    return Math.min(400 * 2 ** attempt, 5000) + Math.floor(Math.random() * 150);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Truncate untrusted text to the shared token budget, preserving structure. */
  clip(value: string): string {
    const text = value.replace(/\s+/g, " ").trim();
    return text.length <= this.maxChars ? text : `${text.slice(0, this.maxChars - 14)} [truncated]`;
  }

  stats() {
    const cost = this.costUsd || (this.inputTokens * 0.042) / 1_000_000;
    return {
      requests: this.requests,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      avgMs: this.requests ? Math.round(this.totalMs / this.requests) : 0,
      costUsd: cost,
      estimatedCostUsd: cost,
      provider: this.active,
      providersAvailable: this.order.map(provider => provider.name),
    };
  }
}