// The platform monitor: reads each connected platform's operational
// snapshot on a schedule and records what it says as evidence from a
// connected system.
//
// Read-only by construction: the login TEBOS holds can only call the
// platform's snapshot function. A snapshot is recorded when it changed, or
// at least daily, so the evidence shows both the current state and when it
// was last confirmed. A failed read marks the connection unavailable, with
// the reason, and never leaves stale numbers looking fresh.

import { bameFacts, type ParsedSnapshot } from "./bame";
import { companyFacts } from "./company";

export interface DueMonitor {
  connectionId: string;
  orgId: string;
  businessId: string;
  connectorKey: string;
  /** Null for internal connectors that need no credential (TEBOS reading its own numbers). */
  credentialRefId: string | null;
  status: string;
  lastHash: string | null;
  lastRecordedAt: string | null;
}

export type ReadResult = { ok: true; snapshot: unknown } | { ok: false; kind: "auth" | "unavailable" | "invalid"; detail: string };

export interface MonitorStore {
  nextDue(connectorKeys: string[]): Promise<DueMonitor | null>;
  readCredential(ref: string): Promise<string | null>;
  /** Records the reading; when recorded, returns how many objectives were measured from it. */
  recordSnapshot(m: DueMonitor, parsed: Extract<ParsedSnapshot, { ok: true }>, record: boolean): Promise<number | void>;
  recordFailure(m: DueMonitor, kind: "auth" | "unavailable" | "invalid", detail: string): Promise<void>;
}

export interface SnapshotReader {
  read(connectionString: string): Promise<ReadResult>;
}

const PARSERS: Record<string, (raw: unknown) => ParsedSnapshot> = { "bame-ops": bameFacts, "tebos-company": companyFacts };
export const MONITOR_CONNECTORS = Object.keys(PARSERS);
export const RECORD_AT_LEAST_EVERY_MS = 24 * 60 * 60 * 1000;

export type MonitorReport = { connectionId: string; ok: boolean; recorded: boolean; detail: string };

export class MonitorWorker {
  constructor(
    private readonly store: MonitorStore,
    private readonly reader: SnapshotReader,
    private readonly options: {
      log?: (e: Record<string, unknown>) => void;
      now?: () => Date;
      /** Readers for particular connectors (e.g. TEBOS's own numbers); the default reader serves the rest. */
      readers?: Record<string, SnapshotReader>;
    } = {},
  ) {}

  async runOnce(): Promise<MonitorReport | null> {
    const m = await this.store.nextDue(MONITOR_CONNECTORS);
    if (!m) return null;
    const log = (e: Record<string, unknown>) => this.options.log?.({ connectionId: m.connectionId, connector: m.connectorKey, ...e });
    const fail = async (kind: "auth" | "unavailable" | "invalid", detail: string): Promise<MonitorReport> => {
      await this.store.recordFailure(m, kind, detail);
      log({ event: "monitor.failed", kind, detail });
      return { connectionId: m.connectionId, ok: false, recorded: false, detail };
    };

    const reader = this.options.readers?.[m.connectorKey] ?? this.reader;
    let secret = "";
    if (m.credentialRefId) {
      secret = (await this.store.readCredential(m.credentialRefId)) ?? "";
      if (!secret) return fail("auth", "The connection's credential could not be read; set it again");
    } else if (!this.options.readers?.[m.connectorKey]) {
      return fail("auth", "The connection has no credential; set one");
    }
    const read = await reader.read(secret);
    if (!read.ok) return fail(read.kind, read.detail);
    const parsed = PARSERS[m.connectorKey]!(read.snapshot);
    if (!parsed.ok) return fail("invalid", parsed.reason);

    const now = this.options.now?.() ?? new Date();
    const stale = !m.lastRecordedAt || now.getTime() - new Date(m.lastRecordedAt).getTime() >= RECORD_AT_LEAST_EVERY_MS;
    const record = parsed.hash !== m.lastHash || stale;
    const measured = (await this.store.recordSnapshot(m, parsed, record)) ?? 0;
    log({ event: "monitor.read", recorded: record, facts: parsed.facts.length, measured });
    const detail = record ? `${parsed.facts.length} facts recorded${measured ? `, ${measured} objective${measured === 1 ? "" : "s"} measured` : ""}` : "unchanged";
    return { connectionId: m.connectionId, ok: true, recorded: record, detail };
  }
}
