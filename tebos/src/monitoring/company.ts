// TEBOS's own company snapshot -> plain facts on TEBOS's own board.
//
// The snapshot comes from tebos_private.company_snapshot() (migration
// company_board): counts and Rand totals from TEBOS's pipeline and payments,
// never names or client details. As with a client's platform, every number
// is copied from the snapshot and the same snapshot gives the same facts.

import { snapshotHash, type OperationalFact, type ParsedSnapshot } from "./bame";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const n0 = (v: unknown) => num(v) ?? 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA").replace(/\s/g, ",")}`;

export function companyFacts(raw: unknown): ParsedSnapshot {
  const s = obj(raw);
  if (s.schema_version !== 1) return { ok: false, reason: `Unsupported snapshot version ${String(s.schema_version)}` };
  if (typeof s.taken_at !== "string") return { ok: false, reason: "Snapshot has no timestamp" };
  const facts: OperationalFact[] = [];
  const add = (key: string, fact: string, value: Json) => facts.push({ key, fact, value });

  const leads = obj(s.leads);
  if (num(leads.total) !== null) {
    add("leads.volume", `TEBOS received ${plural(n0(leads.last_7_days), "lead")} in the last 7 days and ${n0(leads.last_30_days)} in the last 30 (${n0(leads.from_sales_30_days)} from sales, ${n0(leads.from_website_30_days)} from the website).`, {
      total: n0(leads.total), last_7_days: n0(leads.last_7_days), last_30_days: n0(leads.last_30_days),
      from_sales_30_days: n0(leads.from_sales_30_days), from_website_30_days: n0(leads.from_website_30_days),
    });
  }

  const p = obj(s.pipeline);
  if (num(p.to_decide) !== null) {
    const toDecide = n0(p.to_decide);
    add("pipeline.decisions", toDecide === 0
      ? "No lead is waiting for a decision."
      : `${plural(toDecide, "lead")} ${toDecide === 1 ? "is" : "are"} waiting for a decision; the oldest has waited ${plural(n0(p.oldest_undecided_days), "day")}.`, {
      to_decide: toDecide, oldest_undecided_days: n0(p.oldest_undecided_days),
      awaiting_payment: n0(p.awaiting_payment), awaiting_contract: n0(p.awaiting_contract), by_status: obj(p.by_status),
    });
  }

  const sales = obj(s.sales);
  if (num(sales.won_30_days) !== null) {
    add("sales.won", `${plural(n0(sales.won_30_days), "client")} paid for the first time in the last 30 days; ${n0(sales.decided_30_days)} leads were decided and ${n0(sales.declined_30_days)} declined.`, {
      won_30_days: n0(sales.won_30_days), decided_30_days: n0(sales.decided_30_days), declined_30_days: n0(sales.declined_30_days),
    });
  }

  const r = obj(s.revenue);
  if (num(r.cash_collected_total_zar) !== null) {
    add("revenue.cash", `TEBOS collected ${rand(n0(r.cash_collected_this_month_zar))} this month (${plural(n0(r.payments_this_month), "payment")}), ${rand(n0(r.cash_collected_last_30_days_zar))} in the last 30 days and ${rand(n0(r.cash_collected_total_zar))} in total, excluding VAT.`, {
      this_month_zar: n0(r.cash_collected_this_month_zar), last_30_days_zar: n0(r.cash_collected_last_30_days_zar),
      total_zar: n0(r.cash_collected_total_zar), payments_this_month: n0(r.payments_this_month),
    });
  }

  const c = obj(s.clients);
  if (num(c.active) !== null) {
    const without = n0(c.without_maintainer);
    add("clients.active", `TEBOS has ${plural(n0(c.active), "active client")}, with contracted fees of ${rand(n0(c.contracted_monthly_fees_zar))} a month${without ? `; ${plural(without, "client")} ${without === 1 ? "has" : "have"} no maintainer` : ""}.`, {
      active: n0(c.active), contracted_monthly_fees_zar: n0(c.contracted_monthly_fees_zar), without_maintainer: without,
    });
  }

  const t = obj(s.team);
  if (num(t.sales) !== null) {
    add("team.size", `TEBOS's team has ${plural(n0(t.sales), "salesperson", "salespeople")} and ${plural(n0(t.maintainers), "maintainer")}.`, {
      sales: n0(t.sales), maintainers: n0(t.maintainers),
    });
  }

  const d = obj(s.delivery);
  if (num(d.client_emails_failed) !== null) {
    const failed = n0(d.client_emails_failed);
    add("delivery.emails", failed === 0
      ? `Every client email has gone out or is still being retried (${n0(d.client_emails_waiting)} waiting).`
      : `${plural(failed, "client email")} failed after five attempts and need attention.`, {
      failed, waiting: n0(d.client_emails_waiting),
    });
  }

  if (facts.length === 0) return { ok: false, reason: "The snapshot held no figures" };
  return { ok: true, takenAt: s.taken_at, hash: snapshotHash(s), facts };
}
