// Tidy Property Operations: "Needs attention". A short, ranked list of things a manager should act on, computed only
// from the account's own records (directive v2, part 7). Every rule is deterministic and explains itself; nothing here
// decides anything, sends anything or touches money. The rules and thresholds are listed in
// docs/property-operations/PRODUCT-REQUIREMENTS.md (R7) and tested in test/opsAttention.test.ts.
import { daysBetween, rand } from "./opsLedger";

export type Severity = "bad" | "warn" | "info";
export interface AttentionItem {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  link: string;
  /** what the item is computed from, so the reader can check it */
  basis: string;
  /** within a severity, larger first */
  weight: number;
}

export interface AttentionInput {
  today: string;
  properties: Array<{ id: string; name: string }>;
  units: Array<{ id: string; property_id: string; label: string; market_rent_cents: number | null; held_back: boolean }>;
  tenants: Array<{ id: string; full_name: string; email: string | null; phone: string | null }>;
  leases: Array<{ id: string; unit_id: string; tenant_id: string; ref: string; starts_on: string; ends_on: string | null; ended_on: string | null; status: string; deposit_cents: number; deposit_held_at: string | null }>;
  positions: Array<{ lease_id: string; overdue_cents: number; d31_60: number; d61_90: number; d90_plus: number; deposit_held_cents: number }>;
  maintenance: Array<{ id: string; ref: string; title: string; status: string; priority: string; reported_on: string; property_id: string }>;
  /** this month's figures, when the month shown is the current one */
  month?: { label: string; expected_cents: number; billed_cents: number };
}

/** thresholds, in days */
export const ATTENTION_RULES = { leaseEndingSoon: 60, leaseEndingUrgent: 30, maintenanceStale: 14 } as const;

const OPEN = new Set(["reported", "quoted", "approved", "in_progress", "declined"]);
const SEVERITY_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };

export function covers(l: AttentionInput["leases"][number], day: string): boolean {
  const last = l.ended_on ?? null;
  return l.starts_on <= day && (last === null || day <= last);
}

export function attention(input: AttentionInput): AttentionItem[] {
  const { today } = input;
  const items: AttentionItem[] = [];
  const tenant = (id: string) => input.tenants.find((t) => t.id === id);
  const unit = (id: string) => input.units.find((u) => u.id === id);
  const property = (id: string) => input.properties.find((p) => p.id === id);
  const where = (unitId: string) => { const u = unit(unitId); const p = u && property(u.property_id); return [p?.name, u && `unit ${u.label}`].filter(Boolean).join(", "); };

  // 1. overdue rent: worst first. Over 60 days is serious; anything over 30 is a warning
  for (const pos of input.positions) {
    if (pos.overdue_cents <= 0) continue;
    const l = input.leases.find((x) => x.id === pos.lease_id);
    if (!l) continue;
    const old = pos.d61_90 + pos.d90_plus > 0 ? "some over 60 days" : pos.d31_60 > 0 ? "some over 30 days" : "within 30 days";
    items.push({
      key: `overdue:${l.id}`, severity: pos.d61_90 + pos.d90_plus > 0 || pos.d31_60 > 0 ? "bad" : "warn",
      title: `${tenant(l.tenant_id)?.full_name ?? "A tenant"} owes ${rand(pos.overdue_cents)} overdue`,
      detail: `${l.ref} · ${where(l.unit_id)} · ${old}`, link: `/leases/${l.id}`,
      basis: "Charges past their due date, less payments (oldest settled first)", weight: pos.overdue_cents,
    });
  }

  // 2. this month's rent not charged yet
  if (input.month && input.month.expected_cents > input.month.billed_cents) {
    const gap = input.month.expected_cents - input.month.billed_cents;
    items.push({
      key: "uncharged", severity: "warn", title: `${rand(gap)} of ${input.month.label}'s rent isn't charged yet`,
      detail: "Charge rent from the overview; each lease is charged once", link: "/",
      basis: "Expected from leases, less rent charged", weight: gap,
    });
  }

  // 3. leases whose fixed term ends soon
  for (const l of input.leases) {
    if (l.status !== "active" || l.ended_on || !l.ends_on) continue;
    const days = daysBetween(today, l.ends_on);
    if (days < 0 || days > ATTENTION_RULES.leaseEndingSoon) continue;
    items.push({
      key: `ending:${l.id}`, severity: days <= ATTENTION_RULES.leaseEndingUrgent ? "warn" : "info",
      title: `${tenant(l.tenant_id)?.full_name ?? "A lease"}'s fixed term ends ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      detail: `${l.ref} · ${where(l.unit_id)} · renew, or end the lease on the record`, link: `/leases/${l.id}`,
      basis: `Fixed-term end date within ${ATTENTION_RULES.leaseEndingSoon} days`, weight: ATTENTION_RULES.leaseEndingSoon - days,
    });
  }

  // 4. vacant units (not held back)
  for (const u of input.units) {
    if (u.held_back || input.leases.some((l) => l.unit_id === u.id && covers(l, today))) continue;
    items.push({
      key: `vacant:${u.id}`, severity: "warn",
      title: `${where(u.id)} is vacant`,
      detail: u.market_rent_cents != null ? `About ${rand(u.market_rent_cents)} a month at market rent (estimated)` : "No market rent recorded",
      link: `/properties/${u.property_id}`, basis: "No lease covers today; not held back", weight: u.market_rent_cents ?? 0,
    });
  }

  // 5. maintenance: quotes waiting for a decision, and open requests going stale
  for (const m of input.maintenance) {
    if (!OPEN.has(m.status)) continue;
    const age = daysBetween(m.reported_on, today);
    const name = `${m.ref} ${m.title}`;
    if (m.status === "quoted") {
      items.push({ key: `quote:${m.id}`, severity: "warn", title: `Quote waiting for approval: ${name}`, detail: property(m.property_id)?.name ?? "",
        link: `/maintenance/${m.id}`, basis: "Status: quoted", weight: age });
    } else if (age > ATTENTION_RULES.maintenanceStale || m.priority === "urgent") {
      items.push({
        key: `stale:${m.id}`, severity: m.priority === "urgent" ? "bad" : "warn",
        title: `${name} open for ${age} day${age === 1 ? "" : "s"}`, detail: `${m.priority} priority · ${m.status.replace("_", " ")}`,
        link: `/maintenance/${m.id}`, basis: m.priority === "urgent" ? "Urgent and not finished" : `Open more than ${ATTENTION_RULES.maintenanceStale} days`, weight: age,
      });
    }
  }

  // 6. incomplete records that matter for compliance or collection
  for (const l of input.leases) {
    if (l.status !== "active" || l.ended_on) continue;
    if (l.deposit_cents > 0 && !l.deposit_held_at) {
      items.push({ key: `deposit-where:${l.id}`, severity: "info", title: `Where ${l.ref}'s deposit is held isn't recorded`,
        detail: "The Rental Housing Act expects an interest-bearing account; note the bank and account name", link: `/leases/${l.id}`,
        basis: "Deposit agreed; no 'held at' recorded", weight: l.deposit_cents });
    }
    const pos = input.positions.find((p) => p.lease_id === l.id);
    if (pos && l.deposit_cents > 0 && pos.deposit_held_cents < l.deposit_cents && daysBetween(l.starts_on, today) > 7) {
      items.push({ key: `deposit-short:${l.id}`, severity: "info", title: `${l.ref}: ${rand(l.deposit_cents - pos.deposit_held_cents)} of the deposit not received`,
        detail: `${rand(pos.deposit_held_cents)} of ${rand(l.deposit_cents)} recorded`, link: `/leases/${l.id}`,
        basis: "Deposit agreed, less deposit payments recorded", weight: l.deposit_cents - pos.deposit_held_cents });
    }
    const t = tenant(l.tenant_id);
    if (t && !t.email && !t.phone) {
      items.push({ key: `contact:${t.id}`, severity: "info", title: `No contact details for ${t.full_name}`, detail: `${l.ref} · ${where(l.unit_id)}`,
        link: `/tenants/${t.id}`, basis: "No email or phone recorded", weight: 0 });
    }
  }

  // one item per key; most severe first, then the largest
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight || a.title.localeCompare(b.title));
}

