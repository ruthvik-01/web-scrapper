import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { assertAllowedJobSource } from "./uk-scope.js";

export type ProductionLog = Record<string, string | number | boolean>;
export interface RequestMetrics { requests: number; retries: number }
interface Runtime {
  signal: AbortSignal; origins: Map<string, { next: number; tail: Promise<void> }>; cache: Map<string, unknown>; metrics: RequestMetrics;
  logger?: (event: ProductionLog) => void; company?: string; platform?: string;
}
const scopes = new AsyncLocalStorage<Runtime>();
export const currentSignal = () => scopes.getStore()?.signal;
export const currentMetrics = () => scopes.getStore()?.metrics || { requests: 0, retries: 0 };
export function checkCancelled(): void { currentSignal()?.throwIfAborted(); }
export async function pause(ms: number): Promise<void> {
  checkCancelled(); await sleep(ms, undefined, { signal: currentSignal() }); checkCancelled();
}
export async function runContext<T>(timeoutMs: number, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Run deadline exceeded.")), timeoutMs);
  try {
    return await scopes.run({ signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      origins: new Map(), cache: new Map(), metrics: { requests: 0, retries: 0 } }, task);
  } finally { clearTimeout(timer); }
}
export async function companyContext<T>(timeoutMs: number, task: () => Promise<T>, metadata: Pick<Runtime, "logger" | "company" | "platform"> = {}): Promise<T> {
  const parent = scopes.getStore();
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error("Company timeout deadline exceeded.")), timeoutMs);
  let onAbort: () => void = () => {};
  try {
    return await scopes.run({ ...parent, signal, origins: parent?.origins || new Map(), cache: parent?.cache || new Map(),
      metrics: { requests: 0, retries: 0 }, ...metadata }, async () => {
      signal.throwIfAborted();
      const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true }); });
      return await Promise.race([task(), cancelled]);
    });
  } finally { clearTimeout(timer); signal.removeEventListener("abort", onAbort); }
}
export async function paceOrigin(url: string, delayMs: number): Promise<void> {
  checkCancelled();
  const runtime = scopes.getStore(); if (!runtime) return;
  const origin = new URL(url).origin;
  let state = runtime.origins.get(origin);
  if (!state) { state = { next: 0, tail: Promise.resolve() }; runtime.origins.set(origin, state); }
  const previous = state.tail;
  let release: () => void = () => {};
  state.tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    checkCancelled();
    if (state.next > Date.now()) await pause(state.next - Date.now());
    state.next = Date.now() + delayMs;
  } finally { release(); }
}
export function sharedCache<T>(key: string, create: () => T): T {
  const runtime = scopes.getStore(), cache = runtime?.cache;
  if (!cache) return create();
  // In-flight work must never inherit another company's shorter deadline.
  key = `${runtime?.company || ""}:${key}`;
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key) as T;
}
export function collectorLog(message: string): void {
  const runtime = scopes.getStore();
  if (!runtime) { console.log(message); return; }
  runtime.logger?.({ event: "progress", company: runtime.company || "", platform: runtime.platform || "", message });
}
export async function fetchWithRetries(url: string, init: RequestInit, timeoutMs: number, beforeAttempt?: () => Promise<void>): Promise<Response> {
  assertAllowedJobSource(url);
  for (let attempt = 0; attempt < 3; attempt++) {
    checkCancelled(); await beforeAttempt?.(); checkCancelled();
    const runtime = scopes.getStore(); if (runtime) runtime.metrics.requests++;
    try {
      const signals = [AbortSignal.timeout(timeoutMs), init.signal, currentSignal()].filter((signal): signal is AbortSignal => !!signal);
      const response = await fetch(url, { ...init, signal: AbortSignal.any(signals), redirect: "manual" });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : NaN;
      const dateDelay = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
      const wait = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(dateDelay) ? Math.max(0, dateDelay) : 1000 * 2 ** attempt;
      await response.body?.cancel();
      if (runtime) runtime.metrics.retries++;
      await pause(Math.min(wait, 30_000));
    } catch (error) {
      checkCancelled();
      if (attempt === 2 || !/timeout|abort|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(error))) throw error;
      if (runtime) runtime.metrics.retries++;
      await pause(1000 * 2 ** attempt);
    }
  }
  throw new Error("Request retries were exhausted.");
}
