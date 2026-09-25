// The execution worker: runs approved actions through verified providers and
// has the provider, not TEBOS, confirm the result (dossier §18–§20, §23).
//
//   verify      a connection an admin asked to check (or one due a recheck)
//               -> call the provider -> connected + scopes, or an honest failure
//   execute     a queued provider action -> route to a usable connection
//               -> one run per approval (its id is the provider idempotency key)
//               -> accepted / rejected / unknown
//   resume      a run whose outcome is unknown -> retry with the same key,
//               so the provider cannot act twice; give up honestly after 23 h
//   confirm     an accepted run -> ask the provider -> delivered verifies the
//               action; bounced / failed fails it
//
// The database enforces the rest: approvals of the exact input, one run per
// approval, and that only this worker records provider results.

import { routeCapability, type ConnectionInstance, type RoutingRegistry } from "../domain/capabilities";
import { parseEmailInput, parseFromAddress, type EmailInput } from "../domain/email";
import type { DeliveryResult, EmailConnector, SendResult, VerifyResult } from "./provider";

export const EMAIL_CAPABILITY = "email.send_transactional";

export interface QueuedExecution {
  actionId: string;
  orgId: string;
  businessId: string;
  capabilityKey: string | null;
  executionInput: unknown;
  approvalId: string | null;
  updatedAt: string;
}

export interface ConnectionRecord {
  instance: ConnectionInstance;
  orgId: string;
  credentialRefId: string | null;
  settings: Record<string, unknown>;
}

export interface StartedRun {
  runId: string;
  actionId: string;
  connectionId: string;
  connectorKey: string;
  credentialRefId: string | null;
  idempotencyKey: string;
  from: string;
  input: EmailInput;
}

export interface ResumableRun {
  runId: string;
  actionId: string;
  startedAt: string;
  connectionId: string;
  connectorKey: string;
  credentialRefId: string | null;
  idempotencyKey: string;
  executionInput: unknown;
  settings: Record<string, unknown>;
}

export interface DeliveryCheck {
  runId: string;
  actionId: string;
  connectorKey: string;
  credentialRefId: string | null;
  providerReference: string;
}

export interface ExecutionStore {
  /** A connection of one of `connectorKeys` that was asked to be checked, or is due a recheck. */
  nextConnectionToVerify(connectorKeys: string[]): Promise<ConnectionRecord | null>;
  recordVerification(connection: ConnectionRecord, result: VerifyResult): Promise<void>;

  nextQueuedAction(): Promise<QueuedExecution | null>;
  routingFor(orgId: string): Promise<{ registry: RoutingRegistry; connections: ConnectionRecord[] }>;
  blockAction(actionId: string, reason: string): Promise<void>;
  /** Creates the run and moves run and action to running; null when another worker already has it. */
  startRun(job: QueuedExecution, connection: ConnectionRecord, idempotencyKey: string, requestSummary: Record<string, unknown>): Promise<string | null>;
  nextStaleRun(): Promise<ResumableRun | null>;
  readCredential(credentialRefId: string): Promise<string | null>;
  recordAccepted(run: { runId: string; actionId: string; connectionId: string }, providerReference: string, provider: string): Promise<void>;
  recordRejected(
    run: { runId: string; actionId: string; connectionId: string },
    failure: { errorClass: "validation" | "permission" | "integration"; detail: string; credentialProblem: boolean },
  ): Promise<void>;
  recordUnknown(runId: string, detail: string): Promise<void>;

  /** A run to ask the provider about. `readScopes` names, per connector, the scope polling needs. */
  nextDeliveryCheck(readScopes: Record<string, string>): Promise<DeliveryCheck | null>;
  recordDelivery(runId: string, connectorKey: string, provider: string, delivery: Exclude<DeliveryResult, { state: "unknown" }>): Promise<void>;
}

export interface ExecutionOptions {
  workerId: string;
  log?: (e: Record<string, unknown>) => void;
  /** Attempts per claim for transient outcomes, all with the same idempotency key. */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** After this long without a definite outcome, a run is failed as "outcome unknown" (Resend keeps idempotency keys for 24 h). */
export const GIVE_UP_AFTER_MS = 23 * 60 * 60 * 1000;

export type ExecutionReport =
  | { kind: "verified_connection"; connectionId: string; ok: boolean; detail: string }
  | { kind: "blocked"; actionId: string; reason: string }
  | { kind: "skipped"; actionId: string }
  | { kind: "sent"; actionId: string; runId: string; outcome: SendResult["outcome"]; detail: string }
  | { kind: "delivery"; runId: string; state: DeliveryResult["state"]; detail: string };

export class ExecutionWorker {
  private readonly connectors: Map<string, EmailConnector>;

  constructor(
    private readonly store: ExecutionStore,
    connectors: EmailConnector[],
    private readonly options: ExecutionOptions,
  ) {
    this.connectors = new Map(connectors.map((c) => [c.key, c]));
  }

  private log(e: Record<string, unknown>) {
    this.options.log?.(e);
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  private sleep(ms: number) {
    return this.options.sleep ? this.options.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  /** One unit of work, most urgent first. Null when there was nothing to do. */
  async runOnce(): Promise<ExecutionReport | null> {
    return (await this.verifyOnce()) ?? (await this.executeOnce()) ?? (await this.resumeOnce()) ?? (await this.confirmOnce());
  }

  async verifyOnce(): Promise<ExecutionReport | null> {
    const conn = await this.store.nextConnectionToVerify([...this.connectors.keys()]);
    if (!conn) return null;
    const connector = this.connectors.get(conn.instance.connectorKey);
    let result: VerifyResult;
    if (!connector) result = { ok: false, status: "unavailable", detail: `This worker cannot use ${conn.instance.connectorKey} yet` };
    else if (!conn.credentialRefId) result = { ok: false, status: "authentication_required", detail: "No API key has been set" };
    else {
      const apiKey = await this.store.readCredential(conn.credentialRefId);
      result = apiKey ? await connector.verify(apiKey) : { ok: false, status: "authentication_required", detail: "The API key could not be read; set it again" };
    }
    await this.store.recordVerification(conn, result);
    this.log({ event: "connection.verified", connectionId: conn.instance.id, ok: result.ok, detail: result.detail });
    return { kind: "verified_connection", connectionId: conn.instance.id, ok: result.ok, detail: result.detail };
  }

  async executeOnce(): Promise<ExecutionReport | null> {
    const job = await this.store.nextQueuedAction();
    if (!job) return null;
    const block = async (reason: string): Promise<ExecutionReport> => {
      await this.store.blockAction(job.actionId, reason);
      this.log({ event: "execution.blocked", actionId: job.actionId, reason });
      return { kind: "blocked", actionId: job.actionId, reason };
    };

    if (job.capabilityKey !== EMAIL_CAPABILITY) {
      return block(`TEBOS cannot yet run ${job.capabilityKey ?? "an action without a capability"} through a provider`);
    }
    const parsed = parseEmailInput(job.executionInput);
    if (!parsed.ok) return block(`The email can't be sent: ${parsed.problems.join("; ")}`);

    const { registry, connections } = await this.store.routingFor(job.orgId);
    const candidates = routeCapability(job.capabilityKey, "write", registry, connections.map((c) => c.instance), job.businessId, this.now());
    const chosen = candidates.find((c) => c.availability.usable && this.connectors.has(c.connector.key));
    if (!chosen) {
      const reasons = candidates.map((c) => (c.availability.usable ? `${c.connector.provider}: not supported by this worker` : c.availability.detail));
      return block(reasons.length ? `No usable email provider: ${reasons.join("; ")}` : "No email provider is set up for this organisation");
    }
    const connection = connections.find((c) => c.instance.id === chosen.connection!.id)!;
    const from = parseFromAddress(connection.settings.from);
    if (!from.ok) return block(`The ${chosen.connector.provider} connection has no valid sender address. ${from.problems[0]}`);

    // One run per approval: the key is unique in the database and is the provider's idempotency key.
    const idempotencyKey = `tebos:${job.actionId}:${job.approvalId ?? job.updatedAt}`;
    const runId = await this.store.startRun(job, connection, idempotencyKey, {
      provider: chosen.connector.provider,
      from: from.value.header,
      to: parsed.value.to,
      subject: parsed.value.subject,
      textLength: parsed.value.text.length,
    });
    if (!runId) return { kind: "skipped", actionId: job.actionId };
    this.log({ event: "execution.started", actionId: job.actionId, runId, provider: chosen.connector.key });
    return this.send({
      runId,
      actionId: job.actionId,
      connectionId: connection.instance.id,
      connectorKey: chosen.connector.key,
      credentialRefId: connection.credentialRefId,
      idempotencyKey,
      from: from.value.header,
      input: parsed.value,
    });
  }

  async resumeOnce(): Promise<ExecutionReport | null> {
    const stale = await this.store.nextStaleRun();
    if (!stale) return null;
    const ref = { runId: stale.runId, actionId: stale.actionId, connectionId: stale.connectionId };
    const fail = async (detail: string): Promise<ExecutionReport> => {
      await this.store.recordRejected(ref, { errorClass: "integration", detail, credentialProblem: false });
      return { kind: "sent", actionId: stale.actionId, runId: stale.runId, outcome: "rejected", detail };
    };
    if (this.now().getTime() - new Date(stale.startedAt).getTime() > GIVE_UP_AFTER_MS) {
      return fail("Outcome unknown: the provider never confirmed whether it sent this. Check with the provider before trying again.");
    }
    const parsed = parseEmailInput(stale.executionInput);
    const from = parseFromAddress(stale.settings.from);
    if (!parsed.ok || !from.ok) return fail("The run could not be resumed because its input or sender address is no longer valid");
    this.log({ event: "execution.resumed", actionId: stale.actionId, runId: stale.runId });
    return this.send({ ...ref, connectorKey: stale.connectorKey, credentialRefId: stale.credentialRefId, idempotencyKey: stale.idempotencyKey, from: from.value.header, input: parsed.value });
  }

  private async send(run: StartedRun): Promise<ExecutionReport> {
    const ref = { runId: run.runId, actionId: run.actionId, connectionId: run.connectionId };
    const connector = this.connectors.get(run.connectorKey);
    const apiKey = run.credentialRefId ? await this.store.readCredential(run.credentialRefId) : null;
    if (!connector || !apiKey) {
      const detail = connector ? "The connection has no usable API key" : `This worker cannot use ${run.connectorKey}`;
      await this.store.recordRejected(ref, { errorClass: "permission", detail, credentialProblem: !!connector });
      return { kind: "sent", actionId: run.actionId, runId: run.runId, outcome: "rejected", detail };
    }

    const attempts = Math.max(1, this.options.attempts ?? 3);
    let result: SendResult = { outcome: "unknown", detail: "Not attempted" };
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await this.sleep(1000 * 2 ** (i - 1));
      result = await connector.sendEmail(apiKey, { from: run.from, input: run.input, idempotencyKey: run.idempotencyKey });
      if (result.outcome !== "unknown") break;
    }

    if (result.outcome === "accepted") {
      await this.store.recordAccepted(ref, result.providerReference, connector.provider);
      this.log({ event: "execution.accepted", actionId: run.actionId, runId: run.runId, providerReference: result.providerReference });
      return { kind: "sent", actionId: run.actionId, runId: run.runId, outcome: "accepted", detail: result.providerReference };
    }
    if (result.outcome === "rejected") {
      await this.store.recordRejected(ref, result);
      this.log({ event: "execution.rejected", actionId: run.actionId, runId: run.runId, detail: result.detail });
      return { kind: "sent", actionId: run.actionId, runId: run.runId, outcome: "rejected", detail: result.detail };
    }
    // Neither success nor failure: leave the run running, to be retried with the same key.
    await this.store.recordUnknown(run.runId, result.detail);
    this.log({ event: "execution.unknown", actionId: run.actionId, runId: run.runId, detail: result.detail });
    return { kind: "sent", actionId: run.actionId, runId: run.runId, outcome: "unknown", detail: result.detail };
  }

  async confirmOnce(): Promise<ExecutionReport | null> {
    const check = await this.store.nextDeliveryCheck(Object.fromEntries([...this.connectors.values()].map((c) => [c.key, c.deliveryReadScope])));
    if (!check) return null;
    const connector = this.connectors.get(check.connectorKey);
    const apiKey = check.credentialRefId ? await this.store.readCredential(check.credentialRefId) : null;
    const delivery: DeliveryResult =
      connector && apiKey ? await connector.getDelivery(apiKey, check.providerReference) : { state: "unknown", detail: "The connection's API key is not available" };
    if (delivery.state !== "unknown" && connector) await this.store.recordDelivery(check.runId, check.connectorKey, connector.provider, delivery);
    const detail = delivery.state === "unknown" ? delivery.detail : delivery.providerStatus;
    this.log({ event: "execution.delivery", runId: check.runId, state: delivery.state, detail });
    return { kind: "delivery", runId: check.runId, state: delivery.state, detail };
  }
}
