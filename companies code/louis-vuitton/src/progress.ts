/**
 * Structured execution state for one company scrape.
 *
 * The terminal log is a human view; this tracker is the machine view. Every
 * stage transition, counter change and heartbeat is emitted as a structured
 * event so embedding hosts (the dashboard worker) can render live progress
 * without parsing log lines. A heartbeat keeps emitting while a slow
 * operation (JS-rendered probe, paced fetch, Jev call) is in flight, so the
 * UI can always tell working/waiting from dead.
 */

export type Stage =
  | "DISCOVERY"
  | "PAGE FETCH"
  | "JOB EXTRACTION"
  | "JOB NORMALIZATION"
  | "JEV DECISION"
  | "RESULT STORAGE"
  | "COMPLETED"
  | "FAILED";

export interface ProgressSnapshot {
  stage: Stage;
  /** Human-readable current operation, e.g. "Evaluating job 87/179". */
  operation: string;
  currentUrl: string;
  ats: string;
  pagesDiscovered: number;
  pagesProcessed: number;
  pagesTotal: number;
  jobsDiscovered: number;
  jobsProcessed: number;
  jobsFound: number;
  jobsSkipped: number;
  jevCalls: number;
  jevCacheHits: number;
  startedAt: string;
  elapsedMs: number;
  /** Set when stage is FAILED. */
  error?: string;
}

export type ProgressSink = (snapshot: ProgressSnapshot) => void;

export interface ProgressOptions {
  company: string;
  onLog?: (line: string) => void;
  onEvent?: ProgressSink;
  /** Heartbeat period while no other event fired; defaults to 5000 ms. */
  heartbeatMs?: number;
  now?: () => number;
}

export class Progress {
  stage: Stage = "DISCOVERY";
  operation = "Starting";
  currentUrl = "";
  ats = "";
  pagesDiscovered = 0;
  pagesProcessed = 0;
  pagesTotal = 0;
  jobsDiscovered = 0;
  jobsProcessed = 0;
  jobsFound = 0;
  jobsSkipped = 0;
  jevCalls = 0;
  jevCacheHits = 0;
  error = "";

  private readonly started = Date.now();
  private readonly startedAt = new Date().toISOString();
  private readonly heartbeatMs: number;
  private readonly company: string;
  private readonly onLog?: (line: string) => void;
  private readonly onEvent?: ProgressSink;
  private readonly now: () => number;
  private lastEventAt = Date.now();
  private lastHeartbeatAt = 0;
  private lastEmitAt = 0;
  private timer?: NodeJS.Timeout;

  constructor(options: ProgressOptions) {
    this.company = options.company;
    this.onLog = options.onLog;
    this.onEvent = options.onEvent;
    this.now = options.now ?? (() => Date.now());
    this.heartbeatMs = Math.max(25, options.heartbeatMs ?? 5000);
    this.timer = setInterval(() => this.heartbeat(), this.heartbeatMs);
    this.timer.unref?.();
  }

  get elapsedMs(): number {
    return Date.now() - this.started;
  }

  private heartbeat(): void {
    if (this.stage === "COMPLETED" || this.stage === "FAILED") return;
    const idleMs = Date.now() - Math.max(this.lastEventAt, this.lastHeartbeatAt);
    if (idleMs < this.heartbeatMs) return;
    this.lastHeartbeatAt = Date.now();
    const seconds = Math.round(this.elapsedMs / 1000);
    this.log(`Still working… stage ${this.stage.toLowerCase()}, ${this.operation.toLowerCase()} (${seconds}s elapsed)`);
    this.emit();
  }

  /** Stop the heartbeat. Always call when the run settles. */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  log(line: string): void {
    this.lastEventAt = Date.now();
    this.onLog?.(line);
  }

  emit(): void {
    this.lastEventAt = Date.now();
    this.lastEmitAt = Date.now();
    this.onEvent?.(this.snapshot());
  }

  snapshot(): ProgressSnapshot {
    return {
      stage: this.stage,
      operation: this.operation,
      currentUrl: this.currentUrl,
      ats: this.ats,
      pagesDiscovered: this.pagesDiscovered,
      pagesProcessed: this.pagesProcessed,
      pagesTotal: this.pagesTotal,
      jobsDiscovered: this.jobsDiscovered,
      jobsProcessed: this.jobsProcessed,
      jobsFound: this.jobsFound,
      jobsSkipped: this.jobsSkipped,
      jevCalls: this.jevCalls,
      jevCacheHits: this.jevCacheHits,
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs,
      ...(this.stage === "FAILED" && this.error ? { error: this.error } : {}),
    };
  }

  /** Move to a stage, announce it, and emit a structured event. */
  setStage(stage: Stage, operation: string, url = ""): void {
    this.stage = stage;
    this.operation = operation;
    if (url) this.currentUrl = url;
    this.emit();
  }

  /** Update the current operation inside the same stage without a log line.
   *  Emissions are throttled; activity still resets the heartbeat. */
  update(operation: string, url?: string): void {
    this.operation = operation;
    if (url !== undefined) this.currentUrl = url;
    this.lastEventAt = Date.now();
    if (Date.now() - this.lastEmitAt >= 250) this.emit();
  }

  fail(reason: string): void {
    this.stage = "FAILED";
    this.error = reason;
    this.operation = reason;
    this.emit();
    this.close();
  }

  complete(): void {
    this.stage = "COMPLETED";
    this.operation = "Finished";
    this.emit();
    this.close();
  }
}
