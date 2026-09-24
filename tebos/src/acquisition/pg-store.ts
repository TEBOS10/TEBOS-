// Postgres implementation of the acquisition store.
//
// Connects as a trusted server role (Supabase service role / postgres) —
// agent runs and tool calls are service-written tables. Every write runs in
// its own transaction that first declares who is acting:
//   tebos.actor_type = 'agent', tebos.actor_id = <agent run id>
// so the audit trail attributes each row to this acquisition run. All of the
// schema's guards (legal transitions, honest scan outcomes, evidence rules)
// still apply; this store cannot bypass them.

import pg from "pg";
import type {
  AcquisitionStore,
  ClaimedScan,
  EvidenceDraft,
  ScanCompletion,
  TargetResolution,
  ToolCallRecord,
} from "./worker";

export class PgAcquisitionStore implements AcquisitionStore {
  constructor(private readonly pool: pg.Pool) {}

  static fromUrl(connectionString: string): PgAcquisitionStore {
    return new PgAcquisitionStore(new pg.Pool({ connectionString, max: 4 }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async as<T>(actorId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [actorId]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async claimNextScan(workerId: string): Promise<ClaimedScan | null> {
    return this.as(`acquisition-worker:${workerId}`, async (c) => {
      const { rows } = await c.query(
        `with next as (
           select id from public.scans where status = 'queued'
           order by created_at for update skip locked limit 1
         )
         update public.scans s set status = 'running'
         from next where s.id = next.id
         returning s.id, s.org_id, s.business_id, s.objective, s.scope, s.target_limit,
                   (select b.website from public.businesses b where b.id = s.business_id) as website`,
      );
      const r = rows[0];
      if (!r) return null;
      const scopeUrl = typeof r.scope?.url === "string" && r.scope.url.trim() ? r.scope.url.trim() : null;
      return {
        scanId: r.id,
        orgId: r.org_id,
        businessId: r.business_id,
        objective: r.objective,
        startUrl: scopeUrl ?? r.website ?? null,
        targetLimit: r.target_limit,
      };
    });
  }

  async startRun(scan: ClaimedScan): Promise<string> {
    // The run does not exist yet, so the insert is attributed to the scan it serves.
    return this.as(`acquisition-scan:${scan.scanId}`, async (c) => {
      const { rows } = await c.query(
        `insert into public.agent_runs (org_id, business_id, agent_role, purpose, scan_id, input_context)
         values ($1, $2, 'acquisition', $3, $4, $5) returning id`,
        [
          scan.orgId,
          scan.businessId,
          `Read public website for scan${scan.objective ? `: ${scan.objective}` : ""}`,
          scan.scanId,
          { startUrl: scan.startUrl, targetLimit: scan.targetLimit },
        ],
      );
      return rows[0].id as string;
    });
  }

  async finishRun(_scan: ClaimedScan, runId: string, status: "succeeded" | "failed", output: Record<string, unknown>, errorDetail: string | null) {
    await this.as(runId, (c) =>
      c.query("update public.agent_runs set status = $2, output_summary = $3, error_detail = $4 where id = $1", [runId, status, output, errorDetail]),
    );
  }

  async recordToolCall(scan: ClaimedScan, runId: string, call: ToolCallRecord) {
    await this.as(runId, (c) =>
      c.query(
        `insert into public.tool_calls (org_id, agent_run_id, tool, capability_key, permissions_used, input_summary,
                                        output_summary, status, error_detail, latency_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [scan.orgId, runId, call.tool, call.capabilityKey, call.permissionsUsed, call.inputSummary, call.outputSummary, call.status,
         call.errorDetail, call.latencyMs],
      ),
    );
  }

  async ensureSource(scan: ClaimedScan, runId: string, uri: string): Promise<string> {
    return this.as(runId, async (c) => {
      const inserted = await c.query(
        `insert into public.sources (org_id, business_id, source_type, uri, label, reliability)
         values ($1, $2, 'public_web', $3, 'Public web page', 0.7)
         on conflict (business_id, source_type, (coalesce(uri, ''))) do nothing
         returning id`,
        [scan.orgId, scan.businessId, uri],
      );
      if (inserted.rows[0]) return inserted.rows[0].id as string;
      const existing = await c.query(
        "select id from public.sources where business_id = $1 and source_type = 'public_web' and uri = $2",
        [scan.businessId, uri],
      );
      return existing.rows[0].id as string;
    });
  }

  async addTarget(scan: ClaimedScan, runId: string, uri: string, sourceId: string): Promise<string> {
    return this.as(runId, async (c) => {
      const { rows } = await c.query(
        "insert into public.scan_targets (org_id, scan_id, source_id, uri) values ($1, $2, $3, $4) returning id",
        [scan.orgId, scan.scanId, sourceId, uri],
      );
      return rows[0].id as string;
    });
  }

  async resolveTarget(_scan: ClaimedScan, runId: string, targetId: string, r: TargetResolution) {
    await this.as(runId, (c) =>
      c.query(
        `update public.scan_targets
            set status = $2, http_status = $3, failure_class = $4, failure_detail = $5,
                content_hash = $6, bytes = $7, attempted_at = now()
          where id = $1`,
        [targetId, r.status, r.httpStatus ?? null, r.failureClass ?? null, r.failureDetail ?? null, r.contentHash ?? null, r.bytes ?? null],
      ),
    );
  }

  async recordEvidence(scan: ClaimedScan, runId: string, items: EvidenceDraft[]) {
    if (items.length === 0) return;
    await this.as(runId, async (c) => {
      for (const e of items) {
        await c.query(
          `insert into public.evidence (org_id, business_id, source_id, scan_id, scan_target_id, state, fact,
                                        missing_description, excerpt, structured_value, content_location,
                                        retrieved_at, extraction_status, confidence)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [scan.orgId, scan.businessId, e.sourceId, scan.scanId, e.scanTargetId, e.state, e.fact, e.missingDescription,
           e.excerpt, e.structuredValue, e.contentLocation, e.retrievedAt, e.extractionStatus, e.confidence],
        );
      }
    });
  }

  async finishScan(scan: ClaimedScan, runId: string, completion: ScanCompletion) {
    await this.as(runId, (c) =>
      c.query(
        `update public.scans set status = $2, confidence = $3, confidence_components = $4,
                                 failure_class = $5, failure_detail = $6
          where id = $1`,
        [scan.scanId, completion.status, completion.confidence, completion.confidenceComponents, completion.failureClass,
         completion.failureDetail],
      ),
    );
  }
}
