// The audit trail's integrity check, in words people can act on. The database
// does the checking (tebos_private.audit_verify, public.audit_chain_status); this
// mirrors its statuses (test/audit.test.ts keeps them in sync) and says what each
// one means and what it does not prove.

export const AUDIT_CHAIN_STATUSES = ["intact", "broken_link", "content_mismatch", "unverifiable_start"] as const;
export type AuditChainStatus = (typeof AUDIT_CHAIN_STATUSES)[number];

/** One chain's result, as public.audit_chain_status returns it. org null is the platform chain. */
export interface AuditChainReport {
  orgId: string | null;
  status: AuditChainStatus;
  events: number;
  firstId: number;
  lastId: number;
  lastHash: string;
  firstBadId: number | null;
  reason: string | null;
  timezoneHint: string | null;
}

export function isAuditChainStatus(s: string): s is AuditChainStatus {
  return (AUDIT_CHAIN_STATUSES as readonly string[]).includes(s);
}

/** Plain words for a chain's status. Never says more than the check shows. */
export function describeChain(r: Pick<AuditChainReport, "status" | "events" | "firstBadId" | "timezoneHint">): string {
  switch (r.status) {
    case "intact":
      return `All ${r.events} events check out: each one matches its record and points to the one before it.`;
    case "broken_link":
      return `The chain breaks at event ${r.firstBadId}: an event before it was removed, reordered or changed.`;
    case "content_mismatch":
      return r.timezoneHint
        ? `Event ${r.firstBadId} doesn't match its record in UTC, but does at UTC${r.timezoneHint}: it was most likely written by a session in another time zone. It still needs looking into.`
        : `Event ${r.firstBadId} was changed after it was written.`;
    case "unverifiable_start":
      return `The chain starts part-way: its first event points to history that isn't here. The ${r.events} events that are here check out.`;
  }
}

/** What the check cannot show, said alongside every result. */
export const AUDIT_CHECK_LIMITS =
  "A chain can't show that its newest events were removed, or that someone with owner access to the database rewrote it whole. Record each chain's last event and hash outside the database to catch those.";
