// The intake store on Postgres, with the worker's server connection: every write goes through the database's own
// functions, so de-duplication, conflicts and the health record follow the same rules as the founder's own capture.
import type pg from "pg";
import type { SourceType } from "../domain/reeds-intake";
import type { CaptureResult, IntakeStore, SourceItem } from "./sync";

export class PgIntakeStore implements IntakeStore {
  constructor(private readonly pool: pg.Pool) {}

  async capture(org: string, type: SourceType, item: SourceItem): Promise<CaptureResult> {
    const { rows } = await this.pool.query<{ r: { duplicate: boolean; created: number; conflicts: number } }>(
      `select public.reeds_capture($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) as r`,
      [org, type, item.sourceRef, item.sourceLink, item.receivedAt, item.sender, item.summary, item.triage, item.workspace, JSON.stringify(item.items)],
    );
    const r = rows[0]!.r;
    return { duplicate: r.duplicate, created: Number(r.created), conflicts: Number(r.conflicts) };
  }

  async reportSync(org: string, type: SourceType, ok: boolean, error?: string): Promise<void> {
    await this.pool.query(`select public.reeds_report_sync($1, $2, $3, $4)`, [org, type, ok, error ?? null]);
  }
}
