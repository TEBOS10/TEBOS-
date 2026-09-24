// Explicit state machines (dossier §36). This is the application mirror of
// public.state_transitions in supabase/migrations/20260924054852_foundation.sql;
// test/states.test.ts asserts the two never drift apart. The database is the
// final authority — these exist so callers can explain and pre-check a
// transition instead of discovering the rule from a database error.

export const INITIAL = "(initial)" as const;

type Machine<S extends string> = {
  readonly initial: readonly S[];
  readonly transitions: { readonly [K in S]: readonly S[] };
};

function machine<S extends string>(m: Machine<S>): Machine<S> {
  return m;
}

export const scanMachine = machine({
  initial: ["queued"],
  transitions: {
    queued: ["running", "failed", "cancelled"],
    running: ["completed", "partial", "failed", "cancelled"],
    completed: [],
    partial: [],
    failed: [],
    cancelled: [],
  },
});

export const scanTargetMachine = machine({
  initial: ["pending"],
  transitions: {
    pending: ["acquired", "partially_acquired", "unavailable", "blocked", "skipped"],
    acquired: [],
    partially_acquired: [],
    unavailable: [],
    blocked: [],
    skipped: [],
  },
});

export const findingMachine = machine({
  initial: ["draft", "active"],
  transitions: {
    draft: ["active", "dismissed"],
    active: ["superseded", "dismissed"],
    superseded: [],
    dismissed: [],
  },
});

export const actionMachine = machine({
  initial: ["proposed"],
  transitions: {
    proposed: ["ready", "blocked", "cancelled"],
    ready: ["awaiting_approval", "queued", "blocked", "cancelled"],
    awaiting_approval: ["approved", "ready", "cancelled"],
    approved: ["queued", "cancelled"],
    queued: ["running", "blocked", "cancelled"],
    running: ["completed", "failed", "blocked"],
    blocked: ["ready", "cancelled"],
    completed: ["verified", "failed"],
    verified: [],
    failed: ["ready", "cancelled"],
    cancelled: [],
  },
});

export const actionRunMachine = machine({
  initial: ["queued"],
  transitions: {
    queued: ["running", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
});

export const approvalMachine = machine({
  initial: ["pending"],
  transitions: {
    pending: ["approved", "rejected", "expired", "cancelled"],
    approved: ["consumed", "expired", "revoked"],
    rejected: [],
    expired: [],
    cancelled: [],
    consumed: [],
    revoked: [],
  },
});

// "available" belongs to the connector registry (TEBOS knows how to use a
// provider); a tenant's connection instance starts at "configured".
export const connectionMachine = machine({
  initial: ["configured"],
  transitions: {
    configured: ["connected", "authentication_required", "unavailable", "disabled"],
    authentication_required: ["configured", "disabled"],
    connected: ["degraded", "expired", "authentication_required", "unavailable", "disabled"],
    degraded: ["connected", "expired", "authentication_required", "unavailable", "disabled"],
    expired: ["authentication_required", "disabled"],
    unavailable: ["configured", "disabled"],
    disabled: ["configured"],
  },
});

export const agentRunMachine = machine({
  initial: ["running"],
  transitions: {
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
});

// Team invitations: single use, revocable, expiring.
export const invitationMachine = machine({
  initial: ["pending"],
  transitions: {
    pending: ["accepted", "revoked", "expired"],
    accepted: [],
    revoked: [],
    expired: [],
  },
});

export const MACHINES = {
  scan: scanMachine,
  scan_target: scanTargetMachine,
  finding: findingMachine,
  action: actionMachine,
  action_run: actionRunMachine,
  approval: approvalMachine,
  connection: connectionMachine,
  agent_run: agentRunMachine,
  invitation: invitationMachine,
} as const;

export type MachineName = keyof typeof MACHINES;
type StatesOf<M> = M extends Machine<infer S> ? S : never;
export type ScanStatus = StatesOf<typeof scanMachine>;
export type ScanTargetStatus = StatesOf<typeof scanTargetMachine>;
export type FindingStatus = StatesOf<typeof findingMachine>;
export type ActionStatus = StatesOf<typeof actionMachine>;
export type ActionRunStatus = StatesOf<typeof actionRunMachine>;
export type ApprovalStatus = StatesOf<typeof approvalMachine>;
export type ConnectionStatus = StatesOf<typeof connectionMachine>;
export type AgentRunStatus = StatesOf<typeof agentRunMachine>;
export type InvitationStatus = StatesOf<typeof invitationMachine>;

export function canTransition<M extends MachineName>(
  name: M,
  from: StatesOf<(typeof MACHINES)[M]> | typeof INITIAL,
  to: StatesOf<(typeof MACHINES)[M]>,
): boolean {
  const m = MACHINES[name] as Machine<string>;
  if (from === INITIAL) return m.initial.includes(to);
  return (m.transitions[from] ?? []).includes(to);
}

export function isTerminal<M extends MachineName>(name: M, state: StatesOf<(typeof MACHINES)[M]>): boolean {
  const m = MACHINES[name] as Machine<string>;
  return (m.transitions[state] ?? []).length === 0;
}

/** Flattened [machine, from, to] triples in the same shape as public.state_transitions. */
export function transitionTable(): Array<[MachineName, string, string]> {
  const rows: Array<[MachineName, string, string]> = [];
  for (const [name, m] of Object.entries(MACHINES) as Array<[MachineName, Machine<string>]>) {
    for (const s of m.initial) rows.push([name, INITIAL, s]);
    for (const [from, tos] of Object.entries(m.transitions)) for (const to of tos) rows.push([name, from, to]);
  }
  return rows;
}
