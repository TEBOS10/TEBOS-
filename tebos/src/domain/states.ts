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

// Diagnostic interviews: a booked call (voice) or a written form.
export const interviewMachine = machine({
  initial: ["scheduled", "open"],
  transitions: {
    scheduled: ["dialling", "cancelled"],
    dialling: ["in_progress", "no_answer", "failed"],
    in_progress: ["completed", "failed"],
    open: ["completed", "cancelled"],
    completed: [],
    no_answer: [],
    failed: [],
    cancelled: [],
  },
});

// Objectives (the business's quantified targets). Achieved and missed are
// earned: see src/domain/board.ts and migration board_objectives.
export const objectiveMachine = machine({
  initial: ["draft", "active"],
  transitions: {
    draft: ["active", "cancelled"],
    active: ["achieved", "missed", "retired"],
    achieved: [],
    missed: [],
    retired: [],
    cancelled: [],
  },
});

// The client pipeline: from enquiry to onboarded client (migration client_pipeline).
// Staff decide approved / declined / cancelled; the server records the rest on proof.
export const opportunityMachine = machine({
  initial: ["new"],
  transitions: {
    new: ["screened", "cancelled"],
    screened: ["approved", "declined", "cancelled"],
    approved: ["awaiting_payment", "cancelled"],
    awaiting_payment: ["paid", "cancelled"],
    paid: ["contract_sent"],
    contract_sent: ["contracted", "cancelled"],
    contracted: ["onboarded"],
    onboarded: [],
    declined: [],
    cancelled: [],
  },
});

// Monthly billing (migration monthly_billing). A Company-plan account waits for
// its fee from the agreed proposal; a person pauses, resumes or ends billing.
export const billingMachine = machine({
  initial: ["awaiting_fee", "active"],
  transitions: {
    awaiting_fee: ["active", "ended"],
    active: ["paused", "ended"],
    paused: ["active", "ended"],
    ended: [],
  },
});

// An invoice is open until a confirmed payment of its amount marks it paid, or a person voids it with a reason.
export const invoiceMachine = machine({
  initial: ["open"],
  transitions: {
    open: ["paid", "void"],
    paid: [],
    void: [],
  },
});

// REEDS: a request is asked, planned, run, verified and only then completed.
export const workRequestMachine = machine({
  initial: ["received"],
  transitions: {
    received: ["planned", "failed", "cancelled"],
    planned: ["running", "cancelled"],
    running: ["verifying", "failed", "cancelled"],
    verifying: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
  },
});

// A task is run (retried within its attempts), then checked: verified or rejected.
export const workTaskMachine = machine({
  initial: ["queued"],
  transitions: {
    queued: ["running", "cancelled"],
    running: ["queued", "done", "failed"],
    done: ["verified", "rejected"],
    verified: [],
    rejected: [],
    failed: [],
    cancelled: [],
  },
});

// The client channel: a change a client asks for, carried out by TEBOS within the plan's allowance
// (migration client_channel). The client may cancel only before work starts.
export const changeRequestMachine = machine({
  initial: ["received"],
  transitions: {
    received: ["in_progress", "declined", "cancelled"],
    in_progress: ["done", "declined"],
    done: [],
    declined: [],
    cancelled: [],
  },
});

// The template catalogue (migration template_catalogue): approval, sale and retirement are a signed-in
// platform admin's; a blocked template names its blocker and goes back to draft.
export const catalogueTemplateMachine = machine({
  initial: ["draft"],
  transitions: {
    draft: ["ready_for_qa", "blocked"],
    ready_for_qa: ["approved_internal", "draft", "blocked"],
    blocked: ["draft"],
    approved_internal: ["available_for_sale", "deprecated"],
    available_for_sale: ["deprecated"],
    deprecated: [],
  },
});

// A task on the TEPOS week board (migration tepos_week): only the signed-in person marks it done.
export const weekTaskMachine = machine({
  initial: ["not_started"],
  transitions: {
    not_started: ["in_progress", "done", "blocked", "deferred", "skipped"],
    in_progress: ["not_started", "done", "blocked", "deferred", "skipped"],
    blocked: ["not_started", "in_progress", "deferred", "skipped"],
    deferred: ["not_started", "in_progress", "done", "skipped"],
    skipped: ["not_started"],
    done: ["in_progress"],
  },
});

// REEDS executive intake (migration reeds_intake): a commitment is done only with evidence; a decision is the founder's.
export const reedsCommitmentMachine = machine({
  initial: ["captured", "ready"],
  transitions: {
    captured: ["ready", "cancelled"],
    ready: ["in_progress", "blocked", "awaiting_approval", "done", "cancelled"],
    in_progress: ["blocked", "awaiting_approval", "review", "done", "cancelled"],
    blocked: ["ready", "in_progress", "cancelled"],
    awaiting_approval: ["ready", "in_progress", "cancelled"],
    review: ["in_progress", "done"],
    done: ["in_progress"],
    cancelled: [],
  },
});

export const salesProspectMachine = machine({
  initial: ["new"],
  transitions: {
    new: ["no_answer", "interested", "not_interested", "meeting_booked", "do_not_contact"],
    no_answer: ["interested", "not_interested", "meeting_booked", "do_not_contact"],
    interested: ["meeting_booked", "not_interested", "became_enquiry", "do_not_contact"],
    meeting_booked: ["interested", "not_interested", "became_enquiry", "do_not_contact"],
    not_interested: ["interested", "do_not_contact"],
    became_enquiry: [],
    do_not_contact: [],
  },
});

export const propertyProblemMachine = machine({
  initial: ["open"],
  transitions: {
    open: ["investigating", "planned", "parked"],
    investigating: ["planned", "parked"],
    planned: ["investigating", "resolved", "not_resolved", "parked"],
    not_resolved: ["investigating", "planned"],
    parked: ["open"],
    resolved: ["open"],
  },
});

export const reedsDecisionMachine = machine({
  initial: ["open"],
  transitions: {
    open: ["decided", "deferred", "withdrawn"],
    deferred: ["open", "decided", "withdrawn"],
    decided: [],
    withdrawn: [],
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
  interview: interviewMachine,
  objective: objectiveMachine,
  opportunity: opportunityMachine,
  billing: billingMachine,
  invoice: invoiceMachine,
  work_request: workRequestMachine,
  work_task: workTaskMachine,
  change_request: changeRequestMachine,
  catalogue_template: catalogueTemplateMachine,
  week_task: weekTaskMachine,
  reeds_commitment: reedsCommitmentMachine,
  reeds_decision: reedsDecisionMachine,
  sales_prospect: salesProspectMachine,
  property_problem: propertyProblemMachine,
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
export type InterviewStatus = StatesOf<typeof interviewMachine>;
export type ObjectiveStatus = StatesOf<typeof objectiveMachine>;
export type SalesProspectStatus = StatesOf<typeof salesProspectMachine>;
export type PropertyProblemStatus = StatesOf<typeof propertyProblemMachine>;
export type OpportunityStatus = StatesOf<typeof opportunityMachine>;
export type WorkRequestStatus = StatesOf<typeof workRequestMachine>;
export type WorkTaskStatus = StatesOf<typeof workTaskMachine>;
export type ChangeRequestStatus = StatesOf<typeof changeRequestMachine>;
export type CatalogueTemplateStatus = StatesOf<typeof catalogueTemplateMachine>;
export type WeekTaskStatus = StatesOf<typeof weekTaskMachine>;
export type ReedsCommitmentStatus = StatesOf<typeof reedsCommitmentMachine>;
export type ReedsDecisionStatus = StatesOf<typeof reedsDecisionMachine>;

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

/**
 * The shortest legal route from one state to another (excluding `from`), or
 * null when there is none. Used by server code that must reach a state
 * through the machine rather than around it.
 */
export function transitionPath<M extends MachineName>(
  name: M,
  from: StatesOf<(typeof MACHINES)[M]>,
  to: StatesOf<(typeof MACHINES)[M]>,
): Array<StatesOf<(typeof MACHINES)[M]>> | null {
  if (from === to) return [];
  const m = MACHINES[name] as Machine<string>;
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from as string];
  while (queue.length) {
    const s = queue.shift()!;
    for (const next of m.transitions[s] ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, s);
      if (next === to) {
        const path = [next];
        for (let p = s; p !== from; p = prev.get(p)!) path.unshift(p);
        return path as Array<StatesOf<(typeof MACHINES)[M]>>;
      }
      queue.push(next);
    }
  }
  return null;
}
