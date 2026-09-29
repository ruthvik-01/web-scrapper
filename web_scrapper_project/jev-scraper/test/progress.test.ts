import { test } from "node:test";
import assert from "node:assert/strict";
import { Progress, type ProgressSnapshot } from "../src/progress.js";

test("progress snapshots expose stage, counters and elapsed time", () => {
  const events: ProgressSnapshot[] = [];
  const progress = new Progress({ company: "Fixture", onEvent: snapshot => events.push(snapshot), heartbeatMs: 60_000 });
  progress.ats = "Zoho Recruit";
  progress.pagesDiscovered = 179;
  progress.pagesTotal = 179;
  progress.jobsDiscovered = 179;
  progress.setStage("JEV DECISION", "Evaluating job 87/179 · Jev decision in progress…", "https://example.com/jobs/87");
  progress.jobsProcessed = 86;
  progress.jobsFound = 10;
  progress.jobsSkipped = 76;
  progress.jevCalls = 87;
  progress.jevCacheHits = 3;
  progress.update("Jev decision received for \"Support Worker\"");
  const snapshot = progress.snapshot();
  assert.equal(snapshot.stage, "JEV DECISION");
  assert.equal(snapshot.ats, "Zoho Recruit");
  assert.equal(snapshot.jobsDiscovered, 179);
  assert.equal(snapshot.jobsProcessed, 86);
  assert.equal(snapshot.jevCalls, 87);
  assert.equal(snapshot.jevCacheHits, 3);
  assert.equal(snapshot.currentUrl, "https://example.com/jobs/87");
  assert.match(snapshot.operation, /Jev decision received/);
  assert.ok(snapshot.elapsedMs >= 0);
  assert.ok(events.length >= 1, "stage changes must emit structured events");
  const emitted = events.length;
  progress.emit();
  assert.equal(events.length, emitted + 1, "an explicit emit publishes the current counters");
  progress.complete();
  assert.equal(progress.snapshot().stage, "COMPLETED");
  progress.close();
});

test("heartbeat keeps emitting while a slow operation runs", async () => {
  const lines: string[] = [];
  const events: ProgressSnapshot[] = [];
  const progress = new Progress({
    company: "Slow Co", heartbeatMs: 40,
    onLog: line => lines.push(line), onEvent: snapshot => events.push(snapshot),
  });
  progress.setStage("PAGE FETCH", "Waiting for network idle…");
  const before = events.length;
  await new Promise(resolveWait => setTimeout(resolveWait, 130));
  assert.ok(events.length > before, "a slow operation must keep emitting status updates");
  assert.ok(lines.some(line => /Still working… stage page fetch/.test(line)), lines.join("\n"));
  progress.close();
});

test("a finished or failed run stops emitting heartbeats", async () => {
  const events: ProgressSnapshot[] = [];
  const progress = new Progress({ company: "Done Co", heartbeatMs: 30, onEvent: snapshot => events.push(snapshot) });
  progress.setStage("PAGE FETCH", "Processing");
  progress.fail("Timeout while loading careers page");
  const failed = events.at(-1)!;
  assert.equal(failed.stage, "FAILED");
  assert.equal(failed.error, "Timeout while loading careers page");
  const count = events.length;
  await new Promise(resolveWait => setTimeout(resolveWait, 90));
  assert.equal(events.length, count, "no heartbeat may fire after the run settled");
});
