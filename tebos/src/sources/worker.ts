// Runs each configured REEDS source on the worker, no more than once per interval. The cursor is the newest
// message already on record, read back from the database each time, so a restart or a failed run simply resumes.
import type pg from "pg";
import type { SourceAdapter } from "./sync";
import { runSync } from "./sync";
import { PgIntakeStore } from "./pg-store";

export class SourceSyncWorker {
  private lastRun = 0;

  constructor(
    private readonly pool: pg.Pool,
    private readonly orgId: string,
    private readonly adapters: SourceAdapter[],
    private readonly log: (e: Record<string, unknown>) => void,
    private readonly everyMs = 10 * 60_000,
  ) {}

  /** True when it captured something new. */
  async runOnce(): Promise<boolean> {
    if (this.adapters.length === 0 || Date.now() - this.lastRun < this.everyMs) return false;
    this.lastRun = Date.now();
    const store = new PgIntakeStore(this.pool);
    let captured = 0;
    for (const a of this.adapters) {
      const { rows } = await this.pool.query<{ c: string | null }>(
        `select max(received_at)::text as c from public.reeds_source_events where org_id = $1 and source_type = $2`, [this.orgId, a.type]);
      const cursor = rows[0]?.c ? new Date(rows[0].c).toISOString() : null;
      const s = await runSync(store, this.orgId, a, cursor);
      captured += s.captured;
      this.log({ event: "sources.sync", source: a.type, fetched: s.fetched, captured: s.captured, duplicates: s.duplicates, failed: s.failed, error: s.error });
    }
    return captured > 0;
  }
}
