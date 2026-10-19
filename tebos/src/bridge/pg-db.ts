// The bridge's database calls. Connects as the tebos_bridge login, which can only
// execute these five functions; every check happens inside them.
import type pg from "pg";
import type { BridgeOutcome } from "../domain/bridge";
import type { BridgeDb } from "./server";

export class PgBridgeDb implements BridgeDb {
  constructor(private readonly pool: pg.Pool) {}

  private async call(sql: string, params: unknown[]): Promise<BridgeOutcome> {
    const { rows } = await this.pool.query(sql, params);
    return rows[0].out as BridgeOutcome;
  }

  whoami(h: string) {
    return this.call("select tebos_bridge.whoami($1) as out", [h]);
  }
  getContext(h: string) {
    return this.call("select tebos_bridge.get_context($1) as out", [h]);
  }
  listTasks(h: string, status: string | null) {
    return this.call("select tebos_bridge.list_tasks($1, $2) as out", [h, status]);
  }
  claimTask(h: string, taskId: string) {
    return this.call("select tebos_bridge.claim_task($1, $2::uuid) as out", [h, taskId]);
  }
  submitResult(h: string, taskId: string, result: Record<string, unknown>, key: string) {
    return this.call("select tebos_bridge.submit_result($1, $2::uuid, $3::jsonb, $4) as out", [h, taskId, JSON.stringify(result), key]);
  }
}
