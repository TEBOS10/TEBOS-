// TEBOS worker process: runs the evidence pipeline and executes approved actions.
//
//   TEBOS_DATABASE_URL=postgres://… ANTHROPIC_API_KEY=… npm run worker
//
// Each loop iteration does one unit of work per stage:
//   acquisition   — queued scan  -> evidence            (always on)
//   intelligence  — finished scan -> validated findings; else a business review across scans,
//                   interviews and connected systems (on when ANTHROPIC_API_KEY is set)
//   execution     — verify connections, send approved actions through them, confirm
//                   delivery with the provider (on unless TEBOS_EXECUTION=off)
//   interviews    — place booked diagnostic calls (when ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID
//                   and ELEVENLABS_PHONE_NUMBER_ID are set), follow them, and turn transcripts
//                   into evidence (extraction needs ANTHROPIC_API_KEY)
//   monitoring    — read connected platforms' operational snapshots (read-only logins,
//                   aggregates only) and record them as connected-system evidence
// When PORT is set (Railway sets it), an HTTP server also receives provider
// webhooks at /webhooks/resend/<connection id> and answers /health.
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
import { PgExecutionStore } from "./execution/pg-store";
import { ResendConnector } from "./execution/resend";
import { createWebhookServer } from "./execution/webhooks";
import { ExecutionWorker } from "./execution/worker";
import { PgInterviewStore } from "./interviews/pg-store";
import { ElevenLabsVoice } from "./interviews/voice";
import { InterviewWorker } from "./interviews/worker";
import { PgMonitorStore, PgSnapshotReader } from "./monitoring/pg-store";
import { MonitorWorker } from "./monitoring/worker";

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

const executionEnabled = process.env.TEBOS_EXECUTION !== "off";
const executionStore = new PgExecutionStore(pool, workerId);
const execution = executionEnabled ? new ExecutionWorker(executionStore, [new ResendConnector()], { workerId, log }) : null;

const voiceEnabled = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_PHONE_NUMBER_ID);
const voice = voiceEnabled
  ? new ElevenLabsVoice({
      apiKey: process.env.ELEVENLABS_API_KEY!,
      agentId: process.env.ELEVENLABS_AGENT_ID!,
      phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID!,
      telephony: process.env.ELEVENLABS_TELEPHONY === "sip_trunk" ? "sip_trunk" : "twilio",
    })
  : null;
const interviews = new InterviewWorker(new PgInterviewStore(pool, workerId), voice, provider, { log });

const monitor = new MonitorWorker(new PgMonitorStore(pool, workerId), new PgSnapshotReader(), { log });

const port = process.env.PORT ? Number(process.env.PORT) : null;
const server = port ? createWebhookServer(executionStore, log) : null;
server?.listen(port!, () => log({ event: "webhooks.listening", port }));

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
  stages: { acquisition: true, intelligence: intelligenceEnabled, execution: executionEnabled, webhooks: Boolean(server), voiceInterviews: voiceEnabled },
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
  const executed = execution && !stopping ? await step("execution", () => execution.runOnce()) : false;
  const interviewed = !stopping ? await step("interviews", () => interviews.runOnce()) : false;
  const monitored = !stopping ? await step("monitoring", () => monitor.runOnce()) : false;
  if (!acquired && !analysed && !executed && !interviewed && !monitored && !stopping) await new Promise((r) => setTimeout(r, pollMs));
}
await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
await pool.end();
log({ event: "worker.stopped" });
