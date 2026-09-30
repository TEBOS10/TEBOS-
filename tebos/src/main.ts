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
//   alerts        — email each new pricing-page enquiry to the team once (when
//                   RESEND_API_KEY and ENQUIRY_ALERT_TO are set)
//   pipeline      — each enquiry becomes a screened opportunity; approved ones get a
//                   Paystack payment page (when PAYSTACK_SECRET_KEY is set), paid ones
//                   their contract (from a lawyer-approved template), contracted ones
//                   their organisation and invitation; the client's emails go out
//                   through Resend (when RESEND_API_KEY is set)
//   billing       — each active client's monthly invoice on its date, its Paystack
//                   payment link, and reminders when it's late (never charges a card)
// When PORT is set (Railway sets it), an HTTP server also receives provider
// webhooks at /webhooks/resend/<connection id> and /webhooks/paystack, and
// answers /health.
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
import { isEmailAddress } from "./domain/email";
import { EnquiryAlertWorker } from "./notify/enquiries";
import { PgEnquiryStore } from "./notify/pg-store";
import { PgIntelligenceStore } from "./intelligence/pg-store";
import { IntelligenceWorker } from "./intelligence/worker";
import { PgExecutionStore } from "./execution/pg-store";
import { ResendConnector } from "./execution/resend";
import { createWebhookServer } from "./execution/webhooks";
import { ExecutionWorker } from "./execution/worker";
import { PgInterviewStore } from "./interviews/pg-store";
import { ElevenLabsVoice } from "./interviews/voice";
import { InterviewWorker } from "./interviews/worker";
import { CompanySnapshotReader, PgMonitorStore, PgSnapshotReader } from "./monitoring/pg-store";
import { MonitorWorker } from "./monitoring/worker";
import { PaystackGateway } from "./pipeline/paystack";
import { PgPipelineStore } from "./pipeline/pg-store";
import { PipelineWorker } from "./pipeline/worker";
import { PgBillingStore } from "./billing/pg-store";
import { BillingWorker } from "./billing/worker";

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

const monitor = new MonitorWorker(new PgMonitorStore(pool, workerId), new PgSnapshotReader(), {
  log,
  readers: { "tebos-company": new CompanySnapshotReader(pool) },
});

// Enquiry alerts: on when a Resend key and at least one valid recipient are set.
const alertTo = (process.env.ENQUIRY_ALERT_TO ?? "").split(",").map((a) => a.trim()).filter(isEmailAddress);
const alertsEnabled = Boolean(process.env.RESEND_API_KEY) && alertTo.length > 0;
const alerts = alertsEnabled
  ? new EnquiryAlertWorker(new PgEnquiryStore(pool), new ResendConnector(), {
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.ENQUIRY_ALERT_FROM || "TEBOS <onboarding@resend.dev>",
      to: alertTo,
    }, log)
  : null;

// The client pipeline. Payment pages need Paystack; client emails need Resend.
const paystackKey = process.env.PAYSTACK_SECRET_KEY || null;
const pipelineStore = new PgPipelineStore(pool, `pipeline-worker:${workerId}`);
const pipeline = new PipelineWorker(pipelineStore, paystackKey ? new PaystackGateway(paystackKey) : null, {
  siteUrl: (process.env.TEBOS_SITE_URL || "https://tebos-demo.vercel.app").replace(/\/+$/, ""),
  email: process.env.RESEND_API_KEY
    ? {
        connector: new ResendConnector(),
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.PIPELINE_EMAIL_FROM || process.env.ENQUIRY_ALERT_FROM || "TEBOS <onboarding@resend.dev>",
        replyTo: alertTo[0] ?? null,
      }
    : null,
}, log);
const billing = new BillingWorker(new PgBillingStore(pool, `billing-worker:${workerId}`), paystackKey ? new PaystackGateway(paystackKey) : null, {
  siteUrl: (process.env.TEBOS_SITE_URL || "https://tebos-demo.vercel.app").replace(/\/+$/, ""),
}, log);

const port = process.env.PORT ? Number(process.env.PORT) : null;
const server = port ? createWebhookServer(executionStore, log, paystackKey ? { paystack: { secretKey: paystackKey, store: pipelineStore } } : {}) : null;
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
  stages: { acquisition: true, intelligence: intelligenceEnabled, execution: executionEnabled, webhooks: Boolean(server), voiceInterviews: voiceEnabled, enquiryAlerts: alertsEnabled,
    pipeline: { payments: Boolean(paystackKey), clientEmails: Boolean(process.env.RESEND_API_KEY) } },
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
  const alerted = alerts && !stopping ? await step("alerts", () => alerts.runOnce()) : false;
  const piped = !stopping ? await step("pipeline", () => pipeline.runOnce()) : false;
  const billed = !stopping ? await step("billing", () => billing.runOnce()) : false;
  if (!acquired && !analysed && !executed && !interviewed && !monitored && !alerted && !piped && !billed && !stopping) await new Promise((r) => setTimeout(r, pollMs));
}
await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
await pool.end();
log({ event: "worker.stopped" });
