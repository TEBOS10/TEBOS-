// Tells the database the worker is alive (migration worker_heartbeat), so the founder can see when it stops.
// The database stamps the time; a failed beat is logged and never stops the work.
import type pg from "pg";

export class Heartbeat {
  private readonly startedAt = new Date().toISOString();
  private lastBeat = 0;
  private errors = 0;
  private lastError: string | null = null;

  constructor(
    private readonly pool: Pick<pg.Pool, "query">,
    private readonly workerId: string,
    private readonly mode: "continuous" | "batch",
    private readonly stages: Record<string, unknown>,
    private readonly log: (e: Record<string, unknown>) => void,
    private readonly everyMs = 60_000,
  ) {}

  /** A step failed in this pass. Only the message is kept, and the database withholds anything credential-like. */
  failed(step: string, message: string) {
    this.errors++;
    this.lastError = `${step}: ${message}`.slice(0, 300);
  }

  /** Reports the pass when a beat is due (always when forced, e.g. at the end of a batch run). */
  async beat(force = false): Promise<boolean> {
    if (!force && Date.now() - this.lastBeat < this.everyMs) return false;
    try {
      await this.pool.query(`select public.worker_beat($1, $2, $3, $4, $5, $6)`,
        [this.workerId, this.mode, this.startedAt, this.errors, this.lastError, JSON.stringify(this.stages)]);
      this.lastBeat = Date.now();
      this.errors = 0;
      this.lastError = null;
      return true;
    } catch (err) {
      this.log({ event: "heartbeat.error", detail: (err as Error).message });
      return false;
    }
  }
}
