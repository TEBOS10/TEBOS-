// Postgres implementation of the intelligence store. Same conventions as
// the acquisition store: trusted server connection, one transaction per
// write, every write attributed to the agent run. The schema's rules still
// apply — in particular an active finding without obtained supporting
// evidence is refused at commit.

import pg from "pg";
import type { AcceptedFinding, FindingsInput } from "./findings";
import type { ClaimedAnalysis, IntelligenceStore, RunFinish } from "./worker";

/** A finished scan is retried after a failed analysis at most this many times. */
export const MAX_ANALYSIS_ATTEMPTS = 3;
/** A "running" analysis older than this is considered abandoned. */
const ABANDONED_AFTER = "30 minutes";

export class PgIntelligenceStore implements IntelligenceStore {
  constructor(private readonly pool: pg.Pool) {}

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

  async claimNextScan(workerId: string): Promise<ClaimedAnalysis | null> {
    return this.as(`intelligence-worker:${workerId}`, async (c) => {
      await c.query(
        `update public.agent_runs set status = 'failed', error_detail = 'Abandoned: no progress for ${ABANDONED_AFTER}'
          where agent_role = 'business_intelligence' and status = 'running' and started_at < now() - interval '${ABANDONED_AFTER}'`,
      );
      const { rows } = await c.query(
        `with next as (
           select s.id, s.org_id, s.business_id
             from public.scans s
            where s.status in ('completed', 'partial')
              and not exists (select 1 from public.agent_runs a
                               where a.scan_id = s.id and a.agent_role = 'business_intelligence'
                                 and a.status in ('succeeded', 'running'))
              and (select count(*) from public.agent_runs a
                    where a.scan_id = s.id and a.agent_role = 'business_intelligence' and a.status = 'failed') < $1
            order by s.finished_at
            for update of s skip locked
            limit 1
         )
         insert into public.agent_runs (org_id, business_id, agent_role, purpose, scan_id, input_context)
         select org_id, business_id, 'business_intelligence', 'Propose findings from scan evidence', id, jsonb_build_object('scanId', id)
           from next
         returning id, org_id, business_id, scan_id`,
        [MAX_ANALYSIS_ATTEMPTS],
      );
      const r = rows[0];
      return r ? { runId: r.id, orgId: r.org_id, businessId: r.business_id, scanId: r.scan_id } : null;
    });
  }

  async loadInput(claim: ClaimedAnalysis): Promise<FindingsInput> {
    const client = await this.pool.connect();
    try {
      const scan = (
        await client.query(
          `select s.objective, coalesce((s.confidence_components ->> 'coverage')::numeric, 0) as coverage,
                  b.name, b.website, b.industry,
                  (select count(*) from public.scan_targets t
                    where t.scan_id = s.id and t.status in ('acquired', 'partially_acquired'))::int as pages_read
             from public.scans s join public.businesses b on b.id = s.business_id
            where s.id = $1`,
          [claim.scanId],
        )
      ).rows[0];
      const context = (
        await client.query(
          "select kind, statement from public.business_contexts where business_id = $1 and retired_at is null order by created_at",
          [claim.businessId],
        )
      ).rows;
      const evidence = (
        await client.query(
          `select e.id, e.source_id, src.uri as source_uri, e.state, e.fact, e.missing_description, e.excerpt,
                  e.content_location, e.confidence
             from public.evidence e join public.sources src on src.id = e.source_id
            where e.business_id = $1 and (e.scan_id = $2 or (e.scan_id is null and e.state = 'user_supplied'))
            order by e.created_at`,
          [claim.businessId, claim.scanId],
        )
      ).rows;
      return {
        business: { name: scan.name, website: scan.website, industry: scan.industry },
        objective: scan.objective,
        userContext: context,
        scanCoverage: Number(scan.coverage),
        pagesRead: scan.pages_read,
        evidence: evidence.map((e) => ({
          id: e.id,
          sourceId: e.source_id,
          sourceUri: e.source_uri,
          state: e.state,
          fact: e.fact,
          missingDescription: e.missing_description,
          excerpt: e.excerpt,
          contentLocation: e.content_location,
          confidence: e.confidence === null ? null : Number(e.confidence),
        })),
      };
    } finally {
      client.release();
    }
  }

  async saveFindings(claim: ClaimedAnalysis, findings: AcceptedFinding[]): Promise<string[]> {
    if (findings.length === 0) return [];
    return this.as(claim.runId, async (c) => {
      const ids: string[] = [];
      for (const f of findings) {
        const { rows } = await c.query(
          `insert into public.findings (org_id, business_id, scan_id, title, statement, kind, category, impact_hypothesis,
                                        confidence, confidence_components, missing_information, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active') returning id`,
          [claim.orgId, claim.businessId, claim.scanId, f.title, f.statement, f.kind, f.category, f.impactHypothesis,
           f.confidence, f.confidenceComponents, f.missingInformation],
        );
        const id = rows[0].id as string;
        ids.push(id);
        for (const [relation, list] of [["supports", f.supporting], ["contradicts", f.contradicting]] as const) {
          for (const e of list) {
            await c.query(
              "insert into public.finding_evidence (org_id, business_id, finding_id, evidence_id, relation) values ($1, $2, $3, $4, $5)",
              [claim.orgId, claim.businessId, id, e.id, relation],
            );
          }
        }
      }
      return ids;
    });
  }

  async recordToolCall(
    claim: ClaimedAnalysis,
    call: { status: "succeeded" | "failed"; inputSummary: Record<string, unknown>; outputSummary: Record<string, unknown> | null; errorDetail: string | null; latencyMs: number },
  ) {
    await this.as(claim.runId, (c) =>
      c.query(
        `insert into public.tool_calls (org_id, agent_run_id, tool, capability_key, permissions_used, input_summary,
                                        output_summary, status, error_detail, latency_ms)
         values ($1, $2, 'reasoning.generate_findings', 'analysis.generate_findings', '{analysis.generate_findings}', $3, $4, $5, $6, $7)`,
        [claim.orgId, claim.runId, call.inputSummary, call.outputSummary, call.status, call.errorDetail, call.latencyMs],
      ),
    );
  }

  async finishRun(claim: ClaimedAnalysis, f: RunFinish) {
    await this.as(claim.runId, (c) =>
      c.query(
        `update public.agent_runs set status = $2, model_provider = $3, model = $4, tokens_in = $5, tokens_out = $6,
                                      output_summary = $7, error_detail = $8
          where id = $1`,
        [claim.runId, f.status, f.provider, f.model, f.tokensIn, f.tokensOut, f.output, f.errorDetail],
      ),
    );
  }
}
