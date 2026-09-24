// Acquisition worker process.
//
//   TEBOS_DATABASE_URL=postgres://... npm run worker
//
// TEBOS_DATABASE_URL must be a server-side connection string for the TEBOS
// database (Supabase: the direct or session-pooler connection string).
// Never ship it to a browser. The worker polls for queued scans, processes
// one at a time, and stops cleanly on SIGINT / SIGTERM after the current scan.

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { PgAcquisitionStore } from "./pg-store";
import { AcquisitionWorker } from "./worker";

const url = process.env.TEBOS_DATABASE_URL;
if (!url) {
  console.error("TEBOS_DATABASE_URL is not set");
  process.exit(1);
}

const pollMs = Number(process.env.TEBOS_POLL_MS ?? 5000);
const workerId = process.env.TEBOS_WORKER_ID ?? `${hostname()}:${randomUUID().slice(0, 8)}`;
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), workerId, ...event }));

const store = PgAcquisitionStore.fromUrl(url);
const worker = new AcquisitionWorker(store, {
  workerId,
  politenessDelayMs: Number(process.env.TEBOS_POLITENESS_MS ?? 500),
  log,
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log({ event: "worker.stopping", signal });
    stopping = true;
  });
}

log({ event: "worker.started", pollMs });
while (!stopping) {
  try {
    const report = await worker.runOnce();
    if (!report) await new Promise((r) => setTimeout(r, pollMs));
  } catch (err) {
    log({ event: "worker.error", detail: (err as Error).message });
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
await store.close();
log({ event: "worker.stopped" });
