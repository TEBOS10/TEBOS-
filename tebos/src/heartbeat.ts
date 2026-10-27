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
    /** Stages that are switched off by a fault (e.g. analysis paused because the provider refused it): each one
     *  counts as a failed step in the beat, so "running" never hides a stage that isn't working. */
    private readonly degraded: () => Array<string | null> = () => [],
  ) {}

  /** A step failed in this pass. Only the message is kept, and the database withholds anything credential-like. */
  failed(step: string, message: string) {
    this.errors++;
    this.lastError = `${step}: ${message}`.slice(0, 300);
  }

  /** Reports the pass when a beat is due (always when forced, e.g. at the end of a batch run). */
  async beat(force = false): Promise<boolean> {
    if (!force && Date.now() - this.lastBeat < this.everyMs) return false;
    const down = this.degraded().filter((d): d is string => Boolean(d));
    const errors = this.errors + down.length;
    const lastError = this.lastError ?? (down[0] ? down[0].slice(0, 300) : null);
    try {
      await this.pool.query(`select public.worker_beat($1, $2, $3, $4, $5, $6)`,
        [this.workerId, this.mode, this.startedAt, errors, lastError, JSON.stringify(this.stages)]);
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
