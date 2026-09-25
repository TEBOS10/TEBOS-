// BAME operations snapshot -> plain facts TEBOS can cite.
//
// The snapshot comes from tebos_export.operational_snapshot() on BAME's own
// database (connectors/bame/bame_os_tebos_export.sql): counts and ages only,
// never personal data. Each fact is deterministic: the same snapshot always
// gives the same sentences, and every number is copied from the snapshot.

import { createHash } from "node:crypto";

export interface OperationalFact {
  /** Stable key, e.g. "leads.unassigned". */
  key: string;
  fact: string;
  value: Record<string, unknown>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (m: Json) =>
  Object.entries(m)
    .filter(([, n]) => num(n) !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k} ${num(n)}`)
    .join(", ");

export type ParsedSnapshot = { ok: true; takenAt: string; hash: string; facts: OperationalFact[] } | { ok: false; reason: string };

/** A stable fingerprint of what the snapshot says (ignoring when it was taken). */
export function snapshotHash(snapshot: Json): string {
  const { taken_at: _ignored, ...rest } = snapshot;
  const canonical = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as Json).sort().map((k) => [k, canonical((v as Json)[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex");
}

export function bameFacts(raw: unknown): ParsedSnapshot {
  const s = obj(raw);
  if (s.schema_version !== 1) return { ok: false, reason: `Unsupported snapshot version ${String(s.schema_version)}` };
  if (typeof s.taken_at !== "string") return { ok: false, reason: "Snapshot has no timestamp" };
  const facts: OperationalFact[] = [];
  const add = (key: string, fact: string, value: Json) => facts.push({ key, fact, value });

  for (const [section, noun] of [["leads", "lead"], ["diagnostics", "client diagnostic"]] as const) {
    const x = obj(s[section]);
    const total = num(x.total);
    if (total === null) continue;
    add(`${section}.volume`, `BAME has ${plural(total, noun)} in total, ${num(x.last_30_days) ?? 0} in the last 30 days.`, {
      total, last_30_days: num(x.last_30_days), by_status: obj(x.by_status), ...(section === "diagnostics" ? { by_department: obj(x.by_department) } : {}),
    });
    const unassigned = num(x.unassigned) ?? 0;
    const oldest = num(x.oldest_unassigned_days);
    add(
      `${section}.unassigned`,
      unassigned === 0
        ? `Every ${noun} is assigned to a department.`
        : `${plural(unassigned, noun)} ${unassigned === 1 ? "is" : "are"} not assigned to any department; the oldest has waited ${plural(oldest ?? 0, "day")}.`,
      { unassigned, oldest_unassigned_days: oldest },
    );
  }

  const cp = obj(s.case_progress);
  const items = num(cp.items);
  if (items !== null) {
    const done = num(cp.done) ?? 0;
    add("cases.progress", items === 0 ? "No case deliverables are being tracked yet." : `${done} of ${items} tracked case deliverables are done, across ${plural(num(cp.cases) ?? 0, "case")}.`, {
      cases: num(cp.cases), items, done,
    });
  }

  const n = obj(s.notifications);
  const unread = num(n.unread);
  if (unread !== null) {
    add(
      "notifications.unread",
      unread === 0
        ? "Staff have no unread notifications."
        : `Staff have ${plural(unread, "unread notification")}; the oldest is ${plural(num(n.oldest_unread_days) ?? 0, "day")} old (${list(obj(n.unread_by_department))}).`,
      { unread, oldest_unread_days: num(n.oldest_unread_days), by_department: obj(n.unread_by_department) },
    );
  }

  const st = obj(s.staff);
  const byDept = obj(st.by_department);
  const staffTotal = Object.values(byDept).reduce<number>((a, v) => a + (num(v) ?? 0), 0);
  const pending = num(st.invites_pending) ?? 0;
  add(
    "staff.coverage",
    `BAME has ${plural(staffTotal, "staff account")} (${list(byDept)}), ${plural(num(st.admins) ?? 0, "admin")}; ${pending === 0 ? "no invitations are pending" : `${plural(pending, "invitation")} not yet accepted, the oldest ${plural(num(st.oldest_pending_invite_days) ?? 0, "day")} old`}.`,
    { by_department: byDept, admins: num(st.admins), invites_pending: pending, oldest_pending_invite_days: num(st.oldest_pending_invite_days) },
  );

  const cat = obj(s.deliverable_catalogue);
  add("deliverables.catalogue", Object.keys(cat).length ? `Deliverable checklists exist for ${list(cat)}.` : "No deliverable checklists are defined.", { by_department: cat });

  const pl = obj(s.players);
  const players = Object.values(obj(pl.by_status)).reduce<number>((a, v) => a + (num(v) ?? 0), 0);
  add("players.roster", players === 0 ? "No players are on BAME's roster yet." : `BAME's roster has ${plural(players, "player")} (${list(obj(pl.by_status))}); ${num(pl.public_portfolios) ?? 0} with a public portfolio.`, {
    by_status: obj(pl.by_status), public_portfolios: num(pl.public_portfolios),
  });

  const cap = obj(s.capital);
  const entries = num(cap.entries);
  if (entries !== null) {
    add("capital.ledger", entries === 0 ? "The capital ledger has no entries." : `The capital ledger has ${plural(entries, "entry", "entries")}, ${num(cap.last_30_days) ?? 0} in the last 30 days (totals: ${list(obj(cap.totals_by_type))}).`, {
      entries, last_30_days: num(cap.last_30_days), totals_by_type: obj(cap.totals_by_type),
    });
  }

  return { ok: true, takenAt: s.taken_at, hash: snapshotHash(s), facts };
}
