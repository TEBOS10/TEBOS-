// The maintenance worker: once an hour per client, read their records, work
// out what their maintainer should look at (src/domain/maintenance.ts), and
// keep the queue in step: raise new signals, refresh the ones still true,
// resolve the ones that cleared. It never changes the client's records.

import { signalKey, signalsFor, type ClientState, type Signal } from "../domain/maintenance";

export interface OpenItem {
  id: string;
  kind: string;
  subjectId: string | null;
}

export interface MaintenanceStore {
  /** The next organisation to scan (an onboarded client, or TEBOS's own), not scanned in the last hour. */
  nextOrgToScan(): Promise<{ orgId: string; opportunityId: string | null } | null>;
  clientState(orgId: string): Promise<ClientState>;
  openItems(orgId: string): Promise<OpenItem[]>;
  /** Signals dismissed recently (not raised again yet), by key. */
  recentlyDismissed(orgId: string): Promise<string[]>;
  apply(orgId: string, opportunityId: string | null, change: { raise: Signal[]; refresh: Array<{ id: string; signal: Signal }>; resolve: string[] }): Promise<void>;
}

export type MaintenanceReport = { orgId: string; raised: number; resolved: number; open: number };

export class MaintenanceWorker {
  constructor(
    private readonly store: MaintenanceStore,
    private readonly log: (e: Record<string, unknown>) => void = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runOnce(): Promise<MaintenanceReport | null> {
    const next = await this.store.nextOrgToScan();
    if (!next) return null;
    const [state, open, dismissed] = await Promise.all([
      this.store.clientState(next.orgId), this.store.openItems(next.orgId), this.store.recentlyDismissed(next.orgId),
    ]);
    const signals = signalsFor(state, this.now());
    const openByKey = new Map(open.map((o) => [signalKey({ kind: o.kind as Signal["kind"], subjectId: o.subjectId }), o]));
    const current = new Set(signals.map(signalKey));
    const raise = signals.filter((s) => !openByKey.has(signalKey(s)) && !dismissed.includes(signalKey(s)));
    const refresh = signals.filter((s) => openByKey.has(signalKey(s))).map((s) => ({ id: openByKey.get(signalKey(s))!.id, signal: s }));
    const resolve = open.filter((o) => !current.has(signalKey({ kind: o.kind as Signal["kind"], subjectId: o.subjectId }))).map((o) => o.id);
    await this.store.apply(next.orgId, next.opportunityId, { raise, refresh, resolve });
    const report = { orgId: next.orgId, raised: raise.length, resolved: resolve.length, open: raise.length + refresh.length };
    if (raise.length || resolve.length) this.log({ event: "maintenance.scan", ...report });
    return report;
  }
}
