// Postgres implementation of the execution store.
//
// Connects as TEBOS's trusted server role. Every write runs in a transaction
// that declares the actor (tebos.actor_type = 'agent', actor_id =
// execution-worker:<id>) so the audit trail attributes it. The schema's
// guards still apply: one run per approval, approval of the exact input,
// legal transitions, and "connected" only with a fresh verification.

import pg from "pg";
import type { ConnectionInstance, ConnectorCapability, ConnectorDescriptor, RoutingRegistry } from "../domain/capabilities";
import type { ConnectionStatus } from "../domain/states";
import { transitionPath } from "../domain/states";
import type { DeliveryResult, VerifyResult } from "./provider";
import type { ConnectionRecord, DeliveryCheck, ExecutionStore, QueuedExecution, ResumableRun } from "./worker";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const connectionRecord = (r: Row): ConnectionRecord => ({
  instance: {
    id: r.id,
    connectorKey: r.connector_key,
    businessId: r.business_id,
    status: r.status,
    grantedScopes: r.granted_scopes ?? [],
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : null,
  } satisfies ConnectionInstance,
  orgId: r.org_id,
  credentialRefId: r.credential_ref_id,
  settings: r.settings ?? {},
});

export class PgExecutionStore implements ExecutionStore {
  private readonly actor: string;

  constructor(
    private readonly pool: pg.Pool,
    workerId: string,
  ) {
    this.actor = `execution-worker:${workerId}`;
  }

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [this.actor]);
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

  /** Move a connection to `target` through legal transitions, applying `fields` with the final step. */
  private async moveConnection(c: pg.PoolClient, id: string, from: ConnectionStatus, target: ConnectionStatus, fields: string, params: unknown[]) {
    const path = transitionPath("connection", from, target) ?? [];
    for (const step of path.slice(0, -1)) await c.query("update public.connection_instances set status = $2 where id = $1", [id, step]);
    const final = path.length ? path[path.length - 1]! : from;
    await c.query(`update public.connection_instances set status = $2${fields ? `, ${fields}` : ""} where id = $1`, [id, final, ...params]);
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  async nextConnectionToVerify(connectorKeys: string[]): Promise<ConnectionRecord | null> {
    const { rows } = await this.pool.query(
      `select * from public.connection_instances
        where status <> 'disabled' and connector_key = any ($1) and (
          (verification_requested_at is not null
             and verification_requested_at > coalesce(last_verified_at, '-infinity')
             and verification_requested_at > coalesce(last_failure_at, '-infinity'))
          or (status in ('connected', 'degraded') and last_verified_at < now() - interval '12 hours')
          or (status = 'unavailable' and last_failure_at < now() - interval '30 minutes'))
        order by coalesce(verification_requested_at, last_verified_at, created_at)
        limit 1`,
      [connectorKeys],
    );
    return rows[0] ? connectionRecord(rows[0]) : null;
  }

  async recordVerification(conn: ConnectionRecord, result: VerifyResult): Promise<void> {
    await this.tx(async (c) => {
      const cur = (await c.query("select status from public.connection_instances where id = $1 for update", [conn.instance.id])).rows[0];
      if (!cur) return;
      if (result.ok) {
        await this.moveConnection(c, conn.instance.id, cur.status, "connected",
          "granted_scopes = $3, last_verified_at = clock_timestamp(), last_success_at = clock_timestamp(), failure_detail = null",
          [result.scopes]);
      } else {
        await this.moveConnection(c, conn.instance.id, cur.status, result.status,
          "last_failure_at = clock_timestamp(), failure_detail = $3", [result.detail]);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async nextQueuedAction(): Promise<QueuedExecution | null> {
    const { rows } = await this.pool.query(
      `select a.id, a.org_id, a.business_id, a.capability_key, a.execution_input, a.updated_at,
              (select ap.id from public.approvals ap
                where ap.action_id = a.id and ap.status = 'approved' and (ap.expires_at is null or ap.expires_at > now())
                order by ap.decided_at desc limit 1) as approval_id
         from public.actions a
        where a.status = 'queued' and a.execution_method = 'api'
        order by a.updated_at
        limit 1`,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      actionId: r.id,
      orgId: r.org_id,
      businessId: r.business_id,
      capabilityKey: r.capability_key,
      executionInput: r.execution_input,
      approvalId: r.approval_id,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  async routingFor(orgId: string): Promise<{ registry: RoutingRegistry; connections: ConnectionRecord[] }> {
    const [connectors, mappings, connections] = await Promise.all([
      this.pool.query("select key, provider, auth_method, execution_method from public.connectors"),
      this.pool.query("select connector_key, capability_key, operation, risk_tier, required_scopes from public.connector_capabilities"),
      this.pool.query("select * from public.connection_instances where org_id = $1 and status <> 'disabled'", [orgId]),
    ]);
    return {
      registry: {
        connectors: connectors.rows.map((r): ConnectorDescriptor => ({ key: r.key, provider: r.provider, authMethod: r.auth_method, executionMethod: r.execution_method })),
        connectorCapabilities: mappings.rows.map((r): ConnectorCapability => ({
          connectorKey: r.connector_key, capabilityKey: r.capability_key, operation: r.operation, riskTier: r.risk_tier, requiredScopes: r.required_scopes ?? [],
        })),
      },
      connections: connections.rows.map(connectionRecord),
    };
  }

  async blockAction(actionId: string, reason: string): Promise<void> {
    await this.tx((c) =>
      c.query("update public.actions set status = 'blocked', blocked_reason = $2 where id = $1 and status = 'queued'", [actionId, reason.slice(0, 1000)]),
    );
  }

  async startRun(job: QueuedExecution, connection: ConnectionRecord, idempotencyKey: string, requestSummary: Record<string, unknown>): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('tebos.actor_type', 'agent', true), set_config('tebos.actor_id', $1, true)", [this.actor]);
      const inserted = await client.query(
        `insert into public.action_runs (org_id, action_id, approval_id, connection_instance_id, capability_key, execution_method,
                                         idempotency_key, request_summary, response_summary)
         values ($1, $2, $3, $4, $5, 'api', $6, $7, jsonb_build_object('last_attempt_at', now()))
         on conflict (org_id, idempotency_key) do nothing
         returning id`,
        [job.orgId, job.actionId, job.approvalId, connection.instance.id, job.capabilityKey, idempotencyKey, requestSummary],
      );
      const runId: string | undefined = inserted.rows[0]?.id;
      if (!runId) {
        await client.query("rollback");
        return null;
      }
      await client.query("update public.action_runs set status = 'running' where id = $1", [runId]);
      const moved = await client.query("update public.actions set status = 'running' where id = $1 and status = 'queued'", [job.actionId]);
      if (moved.rowCount !== 1) {
        await client.query("rollback");
        return null;
      }
      await client.query("commit");
      return runId;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async nextStaleRun(): Promise<ResumableRun | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `with next as (
           select r.id from public.action_runs r join public.actions a on a.id = r.action_id
            where r.status = 'running' and r.execution_method = 'api' and a.status = 'running'
              and coalesce((r.response_summary ->> 'last_attempt_at')::timestamptz, r.started_at) < now() - interval '5 minutes'
            order by r.started_at
            for update of r skip locked
            limit 1
         )
         update public.action_runs r
            set response_summary = coalesce(r.response_summary, '{}'::jsonb) || jsonb_build_object('last_attempt_at', now())
           from next where r.id = next.id
         returning r.id, r.action_id, r.started_at, r.connection_instance_id, r.idempotency_key`,
      );
      const r = rows[0];
      if (!r) return null;
      const detail = (
        await c.query(
          `select a.execution_input, ci.connector_key, ci.credential_ref_id, ci.settings
             from public.actions a left join public.connection_instances ci on ci.id = $2
            where a.id = $1`,
          [r.action_id, r.connection_instance_id],
        )
      ).rows[0];
      return {
        runId: r.id,
        actionId: r.action_id,
        startedAt: new Date(r.started_at).toISOString(),
        connectionId: r.connection_instance_id,
        connectorKey: detail?.connector_key ?? "",
        credentialRefId: detail?.credential_ref_id ?? null,
        idempotencyKey: r.idempotency_key,
        executionInput: detail?.execution_input ?? null,
        settings: detail?.settings ?? {},
      };
    });
  }

  async readCredential(credentialRefId: string): Promise<string | null> {
    const { rows } = await this.pool.query("select tebos_private.read_credential($1) as secret", [credentialRefId]);
    return rows[0]?.secret ?? null;
  }

  async recordAccepted(run: { runId: string; actionId: string; connectionId: string }, providerReference: string, provider: string): Promise<void> {
    await this.tx(async (c) => {
      await c.query(
        `update public.action_runs
            set status = 'succeeded', provider_reference = $2, provider_status = 'accepted', provider_status_at = now(),
                response_summary = coalesce(response_summary, '{}'::jsonb) || jsonb_build_object('provider_reference', $2::text)
          where id = $1`,
        [run.runId, providerReference],
      );
      await c.query("update public.actions set status = 'completed', result = $2 where id = $1 and status = 'running'", [
        run.actionId,
        `${provider} accepted the email (${providerReference}). Waiting for ${provider} to confirm delivery.`,
      ]);
      await c.query("update public.connection_instances set last_success_at = now() where id = $1", [run.connectionId]);
    });
  }

  async recordRejected(
    run: { runId: string; actionId: string; connectionId: string },
    failure: { errorClass: "validation" | "permission" | "integration"; detail: string; credentialProblem: boolean },
  ): Promise<void> {
    await this.tx(async (c) => {
      await c.query("update public.action_runs set status = 'failed', error_class = $2, error_detail = $3 where id = $1 and status = 'running'", [
        run.runId, failure.errorClass, failure.detail.slice(0, 2000),
      ]);
      await c.query("update public.actions set status = 'failed', result = $2 where id = $1 and status = 'running'", [run.actionId, failure.detail.slice(0, 2000)]);
      const conn = (await c.query("select status from public.connection_instances where id = $1 for update", [run.connectionId])).rows[0];
      if (!conn) return;
      if (failure.credentialProblem) {
        await this.moveConnection(c, run.connectionId, conn.status, "authentication_required", "last_failure_at = now(), failure_detail = $3", [failure.detail]);
      } else {
        await c.query("update public.connection_instances set last_failure_at = now() where id = $1", [run.connectionId]);
      }
    });
  }

  async recordUnknown(runId: string, detail: string): Promise<void> {
    await this.tx((c) =>
      c.query(
        `update public.action_runs
            set response_summary = coalesce(response_summary, '{}'::jsonb) || jsonb_build_object('last_attempt_at', now(), 'last_unknown', $2::text)
          where id = $1`,
        [runId, detail.slice(0, 500)],
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Delivery confirmation
  // -------------------------------------------------------------------------

  async nextDeliveryCheck(readScopes: Record<string, string>): Promise<DeliveryCheck | null> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `with next as (
           select r.id from public.action_runs r
             join public.actions a on a.id = r.action_id
             join public.connection_instances ci on ci.id = r.connection_instance_id
            where r.status = 'succeeded' and not r.verified and r.provider_reference is not null and a.status = 'completed'
              and ($1::jsonb ->> ci.connector_key) = any (ci.granted_scopes)
              and r.finished_at > now() - interval '72 hours'
              and coalesce(r.provider_status_at, r.finished_at) < now() - case when r.finished_at > now() - interval '10 minutes'
                                                                             then interval '1 minute' else interval '15 minutes' end
            order by coalesce(r.provider_status_at, r.finished_at)
            for update of r skip locked
            limit 1
         )
         update public.action_runs r set provider_status_at = now()
           from next where r.id = next.id
         returning r.id, r.action_id, r.provider_reference, r.connection_instance_id`,
        [JSON.stringify(readScopes)],
      );
      const r = rows[0];
      if (!r) return null;
      const ci = (await c.query("select connector_key, credential_ref_id from public.connection_instances where id = $1", [r.connection_instance_id])).rows[0];
      return { runId: r.id, actionId: r.action_id, connectorKey: ci.connector_key, credentialRefId: ci.credential_ref_id, providerReference: r.provider_reference };
    });
  }

  async recordDelivery(runId: string, connectorKey: string, provider: string, delivery: Exclude<DeliveryResult, { state: "unknown" }>): Promise<void> {
    await this.tx(async (c) => {
      const run = (await c.query("select action_id, verified from public.action_runs where id = $1 for update", [runId])).rows[0];
      if (!run || run.verified) return;
      if (delivery.state === "delivered") {
        await c.query(
          `update public.action_runs set verified = true, verification_method = $2, provider_status = $3, provider_status_at = now() where id = $1`,
          [runId, `provider:${connectorKey}:delivered`, delivery.providerStatus],
        );
        await c.query("update public.actions set status = 'verified', result = $2 where id = $1 and status = 'completed'", [
          run.action_id,
          `${provider} confirmed the email was delivered.`,
        ]);
      } else if (delivery.state === "failed") {
        await c.query("update public.action_runs set provider_status = $2, provider_status_at = now() where id = $1", [runId, delivery.providerStatus]);
        await c.query(
          "update public.actions set status = 'failed', verification_status = 'verification_failed', result = $2 where id = $1 and status = 'completed'",
          [run.action_id, `${provider} reports the email ${delivery.providerStatus}${delivery.detail ? `: ${delivery.detail}` : ""}.`],
        );
      } else {
        await c.query("update public.action_runs set provider_status = $2, provider_status_at = now() where id = $1", [runId, delivery.providerStatus]);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  async webhookTarget(connectionId: string): Promise<{ orgId: string; connectorKey: string; secret: string | null } | null> {
    const { rows } = await this.pool.query(
      `select org_id, connector_key, tebos_private.read_credential(webhook_credential_ref_id) as secret
         from public.connection_instances where id = $1 and status <> 'disabled'`,
      [connectionId],
    );
    return rows[0] ? { orgId: rows[0].org_id, connectorKey: rows[0].connector_key, secret: rows[0].secret } : null;
  }

  async runForProviderReference(connectionId: string, providerReference: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      "select id from public.action_runs where connection_instance_id = $1 and provider_reference = $2",
      [connectionId, providerReference],
    );
    return rows[0]?.id ?? null;
  }

  /** False when the event was already recorded (a replay). */
  async recordIntegrationEvent(orgId: string, connectionId: string, eventId: string, eventType: string, summary: Record<string, unknown>): Promise<boolean> {
    return this.tx(async (c) => {
      const { rowCount } = await c.query(
        `insert into public.integration_events (org_id, connection_instance_id, provider_event_id, event_type, payload_summary, processed_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (connection_instance_id, provider_event_id) do nothing`,
        [orgId, connectionId, eventId, eventType, summary],
      );
      return rowCount === 1;
    });
  }
}
