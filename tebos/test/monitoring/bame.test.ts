import { describe, expect, it } from "vitest";
import { bameFacts, snapshotHash } from "../../src/monitoring/bame";

// Shape as returned by BAME's tebos_export.operational_snapshot() on 2026-09-25.
const snapshot = {
  schema_version: 1,
  taken_at: "2026-09-25T12:37:21.641Z",
  leads: { total: 4, by_status: { new: 3, contacted: 1 }, unassigned: 2, last_30_days: 4, oldest_unassigned_days: 6 },
  staff: { admins: 1, by_department: { pr: 1, tech: 1, admin: 1, sales: 1, finance: 1, production: 1 }, invites_pending: 1, oldest_pending_invite_days: 3 },
  capital: { entries: 0, last_30_days: 0, totals_by_type: {} },
  players: { by_status: {}, public_portfolios: 0 },
  diagnostics: { total: 1, by_status: { received: 1 }, unassigned: 0, last_30_days: 1, by_department: { tech: 1 }, oldest_unassigned_days: null },
  case_progress: { done: 2, cases: 1, items: 2 },
  notifications: { unread: 5, oldest_unread_days: 9, unread_by_department: { sales: 4, tech: 1 } },
  deliverable_catalogue: { pr: 21, tech: 33 },
};

describe("BAME operations snapshot", () => {
  it("turns counts into plain facts, every number copied from the snapshot", () => {
    const r = bameFacts(snapshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byKey = Object.fromEntries(r.facts.map((f) => [f.key, f.fact]));
    expect(byKey["leads.volume"]).toBe("BAME has 4 leads in total, 4 in the last 30 days.");
    expect(byKey["leads.unassigned"]).toBe("2 leads are not assigned to any department; the oldest has waited 6 days.");
    expect(byKey["diagnostics.unassigned"]).toBe("Every client diagnostic is assigned to a department.");
    expect(byKey["cases.progress"]).toBe("2 of 2 tracked case deliverables are done, across 1 case.");
    expect(byKey["notifications.unread"]).toBe("Staff have 5 unread notifications; the oldest is 9 days old (sales 4, tech 1).");
    expect(byKey["staff.coverage"]).toBe(
      "BAME has 6 staff accounts (admin 1, finance 1, pr 1, production 1, sales 1, tech 1), 1 admin; 1 invitation not yet accepted, the oldest 3 days old.",
    );
    expect(byKey["players.roster"]).toBe("No players are on BAME's roster yet.");
    expect(byKey["capital.ledger"]).toBe("The capital ledger has no entries.");
    expect(byKey["deliverables.catalogue"]).toBe("Deliverable checklists exist for pr 21, tech 33; none are defined for admin, finance, production, sales.");
    expect(r.takenAt).toBe(snapshot.taken_at);
  });

  it("contains no personal data: only numbers and department names", () => {
    const r = bameFacts(snapshot);
    if (!r.ok) throw new Error();
    expect(JSON.stringify(r.facts)).not.toMatch(/@|\+27|full_name|email|phone/);
  });

  it("fingerprints what the snapshot says, not when it was taken", () => {
    expect(snapshotHash({ ...snapshot, taken_at: "2026-09-26T00:00:00Z" })).toBe(snapshotHash(snapshot));
    expect(snapshotHash({ ...snapshot, leads: { ...snapshot.leads, unassigned: 3 } })).not.toBe(snapshotHash(snapshot));
  });

  it("refuses snapshots it doesn't understand", () => {
    expect(bameFacts({ ...snapshot, schema_version: 2 })).toEqual({ ok: false, reason: "Unsupported snapshot version 2" });
    expect(bameFacts("nope").ok).toBe(false);
    expect(bameFacts({ schema_version: 1 }).ok).toBe(false);
  });
});
