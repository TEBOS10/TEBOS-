// Source adapters for REEDS intake (executive-team specification §4A; first implementation order, "integration
// rules"). Each connected source (an email mailbox, a WhatsApp Business webhook or export, a calendar) implements one
// small interface; the runner captures every item through the database's reeds_capture (which recognises duplicates
// and keeps conflicts) and reports the sync's real result through reeds_report_sync.
//
// No adapter is configured yet: the mailbox, WhatsApp and calendar credentials don't exist on the worker. Until one
// is, each source shows "not connected" and nothing here runs. There is no demo adapter in production code, and a
// sync that fails says so: it never leaves a success behind.

import type { SourceType } from "../domain/reeds-intake";

/** One item from a source, as the adapter read it: its own ID and link, and what it asks for. */
export interface SourceItem {
  sourceRef: string;
  sourceLink: string | null;
  receivedAt: string;
  sender: string | null;
  /** A short summary, never the whole conversation. */
  summary: string;
  triage: string;
  workspace: string;
  items: Array<Record<string, unknown>>;
}

export interface SourceAdapter {
  type: SourceType;
  /** Items received since the cursor (an opaque position the adapter understands), and the next cursor. */
  fetchSince(cursor: string | null): Promise<{ items: SourceItem[]; cursor: string | null }>;
}

export interface CaptureResult { duplicate: boolean; created: number; conflicts: number }

/** The two database calls the runner needs; the Postgres store implements them with the server's connection. */
export interface IntakeStore {
  capture(org: string, type: SourceType, item: SourceItem): Promise<CaptureResult>;
  reportSync(org: string, type: SourceType, ok: boolean, error?: string): Promise<void>;
}

export interface SyncSummary { fetched: number; captured: number; duplicates: number; conflicts: number; failed: boolean; error?: string; cursor: string | null }

/**
 * Runs one sync: fetch, capture each item once, then report. Any error stops the run, is reported as a failure with
 * its message, and returns the cursor unchanged so the next run retries from the same place (capture is idempotent).
 */
export async function runSync(store: IntakeStore, org: string, adapter: SourceAdapter, cursor: string | null): Promise<SyncSummary> {
  const summary: SyncSummary = { fetched: 0, captured: 0, duplicates: 0, conflicts: 0, failed: false, cursor };
  try {
    const { items, cursor: next } = await adapter.fetchSince(cursor);
    summary.fetched = items.length;
    for (const item of items) {
      const r = await store.capture(org, adapter.type, item);
      if (r.duplicate) summary.duplicates++;
      else summary.captured++;
      summary.conflicts += r.conflicts;
    }
    await store.reportSync(org, adapter.type, true);
    summary.cursor = next;
  } catch (e) {
    summary.failed = true;
    summary.error = e instanceof Error ? e.message : String(e);
    await store.reportSync(org, adapter.type, false, summary.error.slice(0, 1000));
  }
  return summary;
}
