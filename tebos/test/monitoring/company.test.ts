import { describe, expect, it } from "vitest";
import { companyFacts } from "../../src/monitoring/company";

// Shape as returned by tebos_private.company_snapshot() (migration company_board).
const snapshot = {
  schema_version: 1,
  taken_at: "2026-09-29T12:00:00Z",
  leads: { total: 12, last_7_days: 3, last_30_days: 9, from_sales_30_days: 5, from_website_30_days: 4 },
  pipeline: { by_status: { screened: 2, onboarded: 1 }, to_decide: 2, oldest_undecided_days: 3, awaiting_payment: 1, awaiting_contract: 0 },
  sales: { won_30_days: 1, decided_30_days: 4, declined_30_days: 2 },
  revenue: { cash_collected_this_month_zar: 2500, cash_collected_last_30_days_zar: 10000, cash_collected_total_zar: 17500, payments_this_month: 1 },
  clients: { active: 1, contracted_monthly_fees_zar: 7500, without_maintainer: 1 },
  team: { sales: 2, maintainers: 1 },
  attention: { self_checks_7_days: 12, self_checks_30_days: 40, average_score_30_days: 58 },
  delivery: { client_emails_failed: 0, client_emails_waiting: 1, steps_open: 6, steps_overdue: 2, oldest_overdue_days: 3, steps_done_30_days: 4, steps_done_on_time_30_days: 3 },
};

describe("TEBOS company snapshot", () => {
  it("turns TEBOS's own numbers into plain facts, every number copied from the snapshot", () => {
    const r = companyFacts(snapshot);
    if (!r.ok) throw new Error(r.reason);
    const byKey = Object.fromEntries(r.facts.map((f) => [f.key, f]));
    expect(byKey["leads.volume"]!.fact).toBe("TEBOS received 3 leads in the last 7 days and 9 in the last 30 (5 from sales, 4 from the website).");
    expect(byKey["pipeline.decisions"]!.fact).toBe("2 leads are waiting for a decision; the oldest has waited 3 days.");
    expect(byKey["sales.won"]!.fact).toBe("1 client paid for the first time in the last 30 days; 4 leads were decided and 2 declined.");
    expect(byKey["revenue.cash"]!.fact).toBe("TEBOS collected R2,500 this month (1 payment), R10,000 in the last 30 days and R17,500 in total, excluding VAT.");
    expect(byKey["clients.active"]!.fact).toBe("TEBOS has 1 active client, with contracted fees of R7,500 a month; 1 client has no maintainer.");
    expect(byKey["team.size"]!.fact).toBe("TEBOS's team has 2 salespeople and 1 maintainer.");
    expect(byKey["delivery.emails"]!.fact).toBe("Every client email has gone out or is still being retried (1 waiting).");
    expect(byKey["delivery.steps"]!.fact).toBe("2 client delivery steps are overdue; the oldest by 3 days. 4 completed in the last 30 days, 3 on time.");
    expect(byKey["delivery.steps"]!.value).toMatchObject({ overdue: 2, on_time_pct_30_days: 75 });
    expect(byKey["attention.self_checks"]!.fact).toBe("12 people took TEBOS's free self-check in the last 7 days, 40 in the last 30; their average score was 58%.");
    // numbers objectives can measure
    expect(byKey["revenue.cash"]!.value.this_month_zar).toBe(2500);
    expect(byKey["pipeline.decisions"]!.value.oldest_undecided_days).toBe(3);
  });

  it("says plainly when nothing is waiting, and refuses what it can't read", () => {
    const r = companyFacts({ ...snapshot, pipeline: { ...snapshot.pipeline, to_decide: 0 } });
    if (!r.ok) throw new Error();
    expect(r.facts.find((f) => f.key === "pipeline.decisions")!.fact).toBe("No lead is waiting for a decision.");
    expect(companyFacts({ schema_version: 2, taken_at: "x" })).toMatchObject({ ok: false });
    expect(companyFacts({ schema_version: 1 })).toMatchObject({ ok: false });
    expect(companyFacts({ schema_version: 1, taken_at: "x" })).toMatchObject({ ok: false, reason: "The snapshot held no figures" });
  });

  it("gives the same fingerprint for the same numbers, whenever they were read", () => {
    const a = companyFacts(snapshot), b = companyFacts({ ...snapshot, taken_at: "2026-09-30T00:00:00Z" });
    if (!a.ok || !b.ok) throw new Error();
    expect(a.hash).toBe(b.hash);
  });
});
