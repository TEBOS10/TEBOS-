// Postgres implementation of the intelligence store. Same conventions as
// the acquisition store: trusted server connection, one transaction per
// write, every write attributed to the agent run. The schema's rules still
// apply — in particular an active finding without obtained supporting
// evidence is refused at commit.

import pg from "pg";
import type { AcceptedFinding, EvidenceForReasoning, FindingsInput } from "./findings";
import { reviewChannels, reviewCoverage } from "./review";
import type { ClaimedAnalysis, IntelligenceStore, ReviewInput, RunFinish } from "./worker";

/** A finished scan is retried after a failed analysis at most this many times. */
export const MAX_ANALYSIS_ATTEMPTS = 3;
/** A "running" analysis older than this is considered abandoned. */
const ABANDONED_AFTER = "30 minutes";
/** A business is reviewed at most this often, however often its figures change. */
export const REVIEW_MIN_INTERVAL = "6 hours";

// Reviews are business_intelligence runs with no scan.
const REVIEW_RUN = "a.business_id = b.id and a.agent_role = 'business_intelligence' and a.scan_id is null";

const toEvidence = (e: Record<string, any>): EvidenceForReasoning => ({
  id: e.id,
  sourceId: e.source_id,
  sourceUri: e.source_uri,
  state: e.state,
  fact: e.fact,
  missingDescription: e.missing_description,
  excerpt: e.excerpt,
  contentLocation: e.content_location,
  confidence: e.confidence === null ? null : Number(e.confidence),
  ...(e.source_type !== undefined
    ? {
        sourceType: e.source_type,
        sourceReliability: Number(e.reliability),
        retrievedAt: e.retrieved_at ? new Date(e.retrieved_at).toISOString() : null,
        question: e.question ?? null,
      }
    : {}),
});

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
        evidence: evidence.map(toEvidence),
      };
    } finally {
      client.release();
    }
  }

  async claimNextReview(workerId: string): Promise<ClaimedAnalysis | null> {
    return this.as(`intelligence-worker:${workerId}`, async (c) => {
      // Due: the business has statements or connected-system figures, something
      // (those, or a finished scan) is newer than its last review, no review is
      // running, it hasn't failed too often since, and the last one isn't recent.
      const { rows } = await c.query(
        `with newest as (
           select b.id, greatest(
                    (select max(e.created_at) from public.evidence e join public.sources s on s.id = e.source_id
                      where e.business_id = b.id and s.source_type in ('user_statement', 'connected_system')
                        and e.state in ('acquired', 'partially_acquired', 'user_supplied')),
                    (select max(sc.finished_at) from public.scans sc where sc.business_id = b.id and sc.status in ('completed', 'partial'))
                  ) as at
             from public.businesses b
            where exists (select 1 from public.evidence e join public.sources s on s.id = e.source_id
                           where e.business_id = b.id and s.source_type in ('user_statement', 'connected_system')
                             and e.state in ('acquired', 'partially_acquired', 'user_supplied'))
         ), next as (
           select b.id, b.org_id
             from public.businesses b join newest n on n.id = b.id
            where not exists (select 1 from public.agent_runs a where ${REVIEW_RUN} and a.status = 'running')
              and not exists (select 1 from public.agent_runs a where ${REVIEW_RUN} and a.status = 'succeeded' and a.started_at >= n.at)
              and (select count(*) from public.agent_runs a where ${REVIEW_RUN} and a.status = 'failed' and a.started_at >= n.at) < $1
              and not exists (select 1 from public.agent_runs a where ${REVIEW_RUN} and a.status = 'succeeded'
                                 and coalesce((a.output_summary ->> 'unchanged')::boolean, false) = false
                                 and a.started_at > now() - interval '${REVIEW_MIN_INTERVAL}')
            order by n.at
            for update of b skip locked
            limit 1
         )
         insert into public.agent_runs (org_id, business_id, agent_role, purpose, input_context)
         select org_id, id, 'business_intelligence', 'Business review: propose findings from all evidence held',
                jsonb_build_object('kind', 'business_review')
           from next
         returning id, org_id, business_id`,
        [MAX_ANALYSIS_ATTEMPTS],
      );
      const r = rows[0];
      return r ? { kind: "review", runId: r.id, orgId: r.org_id, businessId: r.business_id, scanId: null } : null;
    });
  }

  async loadReviewInput(claim: ClaimedAnalysis): Promise<ReviewInput> {
    const client = await this.pool.connect();
    try {
      const business = (await client.query("select name, website, industry from public.businesses where id = $1", [claim.businessId])).rows[0];
      const scan = (
        await client.query(
          `select s.id, (select count(*) from public.scan_targets t
                           where t.scan_id = s.id and t.status in ('acquired', 'partially_acquired'))::int as pages_read
             from public.scans s where s.business_id = $1 and s.status in ('completed', 'partial')
            order by s.finished_at desc nulls last limit 1`,
          [claim.businessId],
        )
      ).rows[0];
      const context = (
        await client.query(
          "select kind, statement from public.business_contexts where business_id = $1 and retired_at is null order by created_at",
          [claim.businessId],
        )
      ).rows;
      // The latest website scan, every statement, and each connected system's latest snapshot.
      const evidence = (
        await client.query(
          `with latest_snapshot as (
             select e.source_id, max(e.retrieved_at) as at
               from public.evidence e join public.sources s on s.id = e.source_id
              where e.business_id = $1 and s.source_type = 'connected_system' and e.state = 'acquired'
              group by e.source_id
           )
           select e.id, e.source_id, src.uri as source_uri, e.state, e.fact, e.missing_description, e.excerpt,
                  e.content_location, e.confidence, src.source_type, src.reliability, e.retrieved_at,
                  e.structured_value ->> 'question' as question
             from public.evidence e join public.sources src on src.id = e.source_id
            where e.business_id = $1
              and (   (src.source_type = 'connected_system' and e.state = 'acquired'
                       and (e.source_id, e.retrieved_at) in (select source_id, at from latest_snapshot))
                   or (src.source_type <> 'connected_system' and e.scan_id is not null and e.scan_id = $2)
                   or (src.source_type <> 'connected_system' and e.scan_id is null and e.state = 'user_supplied'))
            order by e.created_at`,
          [claim.businessId, scan?.id ?? null],
        )
      ).rows.map(toEvidence);
      const last = (
        await client.query(
          `select a.output_summary ->> 'fingerprint' as fingerprint from public.agent_runs a
            where a.business_id = $1 and a.agent_role = 'business_intelligence' and a.scan_id is null
              and a.status = 'succeeded' and a.id <> $2
            order by a.started_at desc limit 1`,
          [claim.businessId, claim.runId],
        )
      ).rows[0];
      return {
        input: {
          business: { name: business.name, website: business.website, industry: business.industry },
          objective: null,
          userContext: context,
          evidence,
          scanCoverage: reviewCoverage(reviewChannels(evidence)),
          pagesRead: scan?.pages_read ?? 0,
          mode: "review",
        },
        lastFingerprint: last?.fingerprint ?? null,
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
                                        confidence, confidence_components, missing_information, status, analysis_run_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12) returning id`,
          [claim.orgId, claim.businessId, claim.scanId, f.title, f.statement, f.kind, f.category, f.impactHypothesis,
           f.confidence, f.confidenceComponents, f.missingInformation, claim.runId],
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
      if (claim.scanId === null) {
        // A review replaces the previous reviews' findings — except any an action
        // was proposed from, which stay so that work keeps its reason.
        await c.query(
          `update public.findings f set status = 'superseded', superseded_by_run = $3
            where f.business_id = $1 and f.status = 'active' and f.scan_id is null and not (f.id = any ($2::uuid[]))
              and f.analysis_run_id in (select a.id from public.agent_runs a
                                         where a.business_id = $1 and a.agent_role = 'business_intelligence' and a.scan_id is null)
              and not exists (select 1 from public.actions x where x.finding_id = f.id)`,
          [claim.businessId, ids, claim.runId],
        );
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
