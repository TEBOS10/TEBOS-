// TEBOS worker process: runs the evidence pipeline.
//
//   TEBOS_DATABASE_URL=postgres://… ANTHROPIC_API_KEY=… npm run worker
//
// Each loop iteration does one unit of work per stage:
//   acquisition   — queued scan  -> evidence            (always on)
//   intelligence  — finished scan -> validated findings (on when ANTHROPIC_API_KEY is set)
// It sleeps only when neither stage had work, and stops cleanly on
// SIGINT / SIGTERM after the current unit of work.
//
// TEBOS_DATABASE_URL is a server-side secret (Supabase direct or
// session-pooler connection string). Never ship it to a browser.
// TEBOS_DATABASE_CA (optional, recommended) verifies the database's TLS certificate.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import pg from "pg";
import { poolConfig } from "./db";
import { PgAcquisitionStore } from "./acquisition/pg-store";
import { AcquisitionWorker } from "./acquisition/worker";
import { AnthropicProvider } from "./intelligence/anthropic-provider";
import { PgIntelligenceStore } from "./intelligence/pg-store";
import { IntelligenceWorker } from "./intelligence/worker";

const url = process.env.TEBOS_DATABASE_URL;
if (!url) {
  console.error("TEBOS_DATABASE_URL is not set");
  process.exit(1);
}

const pollMs = Number(process.env.TEBOS_POLL_MS ?? 5000);
const workerId = process.env.TEBOS_WORKER_ID ?? `${hostname()}:${randomUUID().slice(0, 8)}`;
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), workerId, ...event }));

const pool = new pg.Pool(poolConfig(url));
const acquisition = new AcquisitionWorker(new PgAcquisitionStore(pool), {
  workerId,
  politenessDelayMs: Number(process.env.TEBOS_POLITENESS_MS ?? 500),
  log,
});

const intelligenceEnabled = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.TEBOS_INTELLIGENCE !== "off";
const provider = intelligenceEnabled ? new AnthropicProvider() : null;
const intelligence = provider ? new IntelligenceWorker(new PgIntelligenceStore(pool), provider, { workerId, log }) : null;

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log({ event: "worker.stopping", signal });
    stopping = true;
  });
}

log({
  event: "worker.started",
  pollMs,
  stages: { acquisition: true, intelligence: intelligenceEnabled },
  ...(intelligenceEnabled ? {} : { note: "Findings are not generated: set ANTHROPIC_API_KEY to enable the intelligence stage" }),
});

async function step(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    return (await fn()) !== null;
  } catch (err) {
    log({ event: `${name}.error`, detail: (err as Error).message });
    return false;
  }
}

while (!stopping) {
  const acquired = await step("acquisition", () => acquisition.runOnce());
  const analysed = intelligence && !stopping ? await step("intelligence", () => intelligence.runOnce()) : false;
  if (!acquired && !analysed && !stopping) await new Promise((r) => setTimeout(r, pollMs));
}
await pool.end();
log({ event: "worker.stopped" });
