// The month at a glance. Every figure comes from ops_month_summary / ops_lease_positions in the database and says what
// it is: expected (leases), billed (charges), received (payments), owed, estimated (vacant units' market rent).
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui";
import { generateRent, monthSummary, positions } from "../lib/opsData";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { BASIS_LABEL, Money, monthLabel, nextMonth, prevMonth, thisMonth, usePortfolio, useRoles } from "./util";

export function DashboardPage() {
  const { db, organisation } = useOrg();
  const roles = useRoles();
  const p = usePortfolio();
  const [month, setMonth] = useState(thisMonth());
  const s = useQuery(() => monthSummary(db, organisation.id, month), [organisation.id, month]);
  const pos = useQuery(() => positions(db, organisation.id), [organisation.id]);
  const [charging, setCharging] = useState(false);
  const [charged, setCharged] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);

  async function charge() {
    setCharging(true); setErr(null); setCharged(null);
    try {
      const n = await generateRent(db, organisation.id, month);
      setCharged(n === 0 ? `Rent for ${monthLabel(month)} was already charged on every lease.` : `Charged ${monthLabel(month)}'s rent on ${n} lease${n === 1 ? "" : "s"}.`);
      s.reload(); pos.reload();
    } catch (e) { setErr(e); } finally { setCharging(false); }
  }

  if (p.data && p.data.properties.length === 0) return <FirstSteps />;
  const d = s.data;
  const topArrears = (pos.data ?? []).filter((x) => x.overdue_cents > 0).sort((a, b) => b.overdue_cents - a.overdue_cents).slice(0, 5);
  const ageing = (pos.data ?? []).reduce((t, x) => ({ a: t.a + x.d1_30, b: t.b + x.d31_60, c: t.c + x.d61_90, d: t.d + x.d90_plus }), { a: 0, b: 0, c: 0, d: 0 });
  const ageMax = Math.max(ageing.a, ageing.b, ageing.c, ageing.d, 1);
  const leaseRef = (id: string) => p.data?.leases.find((l) => l.id === id);
  const tenantOf = (id: string) => p.data?.tenants.find((t) => t.id === leaseRef(id)?.tenant_id)?.full_name ?? "Tenant";

  return (
    <div className="stack">
      <PageHeader eyebrow={organisation.name} title="Overview"
        actions={
          <div className="ops-month" role="group" aria-label="Month">
            <button className="btn btn-sm" aria-label="Previous month" onClick={() => setMonth(prevMonth(month))}><ChevronLeft size={16} aria-hidden /></button>
            <span data-testid="month">{monthLabel(month)}</span>
            <button className="btn btn-sm" aria-label="Next month" onClick={() => setMonth(nextMonth(month))}><ChevronRight size={16} aria-hidden /></button>
          </div>
        }>
        What the portfolio was expected to earn, what was billed, what arrived, and what is still owed.
      </PageHeader>

      {s.error ? <ErrorNote error={s.error} title="Couldn't load the month" /> : !d ? <Loading /> : (
        <>
          <section className="ops-kpis" aria-label="This month" data-testid="kpis">
            <Kpi label="Expected rent" basis="expected" cents={d.expected_cents} />
            <Kpi label="Billed" basis="billed" cents={d.billed_cents} />
            <Kpi label="Received" basis="received" cents={d.received_cents} />
            <Kpi label="Outstanding" basis="owed" cents={d.outstanding_cents} sub={`of which overdue ${fmt(d.overdue_cents)}`} tone={d.overdue_cents > 0 ? "warn" : undefined} />
          </section>

          <div className="ops-grid">
            <Card title="Collection" subtitle={`${monthLabel(month)} · rent account only; deposits are held, never income`}>
              <Bars rows={[
                { label: "Expected", cents: d.expected_cents, kind: "expected" },
                { label: "Billed", cents: d.billed_cents, kind: "billed" },
                { label: "Received", cents: d.received_cents, kind: "received" },
              ]} />
              {d.expected_cents > 0 && (
                <p className="muted ops-small" data-testid="collection-rate">
                  Received is {Math.round((d.received_cents * 100) / d.expected_cents)}% of expected.
                </p>
              )}
              {roles.manage && (
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" disabled={charging} onClick={() => void charge()} data-testid="charge-rent">
                    Charge rent for {monthLabel(month)}
                  </button>
                  <span className="muted ops-small">Charges every lease once; a part month is pro-rated.</span>
                </div>
              )}
              {charged && <p className="note note-good" role="status">{charged}</p>}
              <ErrorNote error={err} title="Rent not charged" />
            </Card>

            <Card title="Occupancy" subtitle={`As at ${d.as_of}: from leases, never typed`}>
              <div className="ops-occupancy" data-testid="occupancy">
                <div className="ops-occ-bar" aria-hidden>
                  <span className="occ" style={{ flex: d.occupied }} />
                  <span className="vac" style={{ flex: d.vacant }} />
                  <span className="held" style={{ flex: d.held_back }} />
                </div>
                <dl className="ops-dl">
                  <div><dt>Units</dt><dd>{d.units}</dd></div>
                  <div><dt>Let</dt><dd>{d.occupied}</dd></div>
                  <div><dt>Vacant</dt><dd>{d.vacant}</dd></div>
                  <div><dt>Held back</dt><dd>{d.held_back}</dd></div>
                  <div><dt>Occupancy</dt><dd>{d.units ? `${Math.round((d.occupied * 100) / d.units)}%` : "–"}</dd></div>
                </dl>
                {d.vacant > 0 && (
                  <p className="muted ops-small" data-basis="estimated">
                    Vacancy costs about <Money cents={d.vacancy_estimate_cents} basis="estimated" /> a month (estimated from market rents)
                    {d.vacant_without_market_rent > 0 ? `; ${d.vacant_without_market_rent} vacant unit${d.vacant_without_market_rent === 1 ? " has" : "s have"} no market rent recorded` : ""}.
                  </p>
                )}
              </div>
            </Card>

            <Card title="Arrears by age" subtitle="Overdue rent, oldest charge settled first">
              {pos.error ? <ErrorNote error={pos.error} /> : !pos.data ? <Loading /> : (
                <>
                  <div className="ops-ageing" data-testid="ageing">
                    {([["1–30 days", ageing.a], ["31–60 days", ageing.b], ["61–90 days", ageing.c], ["90+ days", ageing.d]] as const).map(([l, c]) => (
                      <div key={l} className="ops-age-row">
                        <span>{l}</span>
                        <span className="ops-age-bar"><span style={{ width: `${(c * 100) / ageMax}%` }} /></span>
                        <Money cents={c} basis="owed" />
                      </div>
                    ))}
                  </div>
                  {topArrears.length > 0 ? (
                    <ul className="ops-list" aria-label="Most overdue">
                      {topArrears.map((x) => (
                        <li key={x.lease_id}>
                          <Link to={`/leases/${x.lease_id}`}>{tenantOf(x.lease_id)} <span className="muted">{leaseRef(x.lease_id)?.ref}</span></Link>
                          <Money cents={x.overdue_cents} basis="owed" />
                        </li>
                      ))}
                    </ul>
                  ) : <Empty>Nobody is behind.</Empty>}
                </>
              )}
            </Card>

            <Card title="Costs and deposits">
              <dl className="ops-dl ops-dl-wide">
                <div><dt>Maintenance spend, {monthLabel(month)}</dt><dd><Money cents={d.maintenance_spend_cents} basis="actual" /></dd></div>
                <div><dt>Maintenance open</dt><dd><Link to="/maintenance">{d.maintenance_open}</Link></dd></div>
                <div><dt>Deposits held</dt><dd><Money cents={d.deposits_held_cents} basis="held" /></dd></div>
                <div><dt>Properties</dt><dd><Link to="/properties">{d.properties}</Link></dd></div>
              </dl>
            </Card>
          </div>
          <p className="muted ops-small">{Object.values(BASIS_LABEL).join(" · ")}</p>
        </>
      )}
    </div>
  );
}

const fmt = (c: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(c / 100);

function Kpi({ label, cents, basis, sub, tone }: { label: string; cents: number; basis: keyof typeof BASIS_LABEL; sub?: string; tone?: "warn" }) {
  return (
    <div className={`ops-kpi ${tone ?? ""}`} title={BASIS_LABEL[basis]}>
      <span className="ops-kpi-label">{label}</span>
      <span className="ops-kpi-value"><Money cents={cents} basis={basis} /></span>
      <span className="ops-kpi-basis">{sub ?? BASIS_LABEL[basis]}</span>
    </div>
  );
}

function Bars({ rows }: { rows: Array<{ label: string; cents: number; kind: string }> }) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <div className="ops-bars">
      {rows.map((r) => (
        <div key={r.label} className="ops-bar-row">
          <span className="ops-bar-label">{r.label}</span>
          <span className={`ops-bar ${r.kind}`}><span style={{ width: `${(r.cents * 100) / max}%` }} /></span>
          <Money cents={r.cents} />
        </div>
      ))}
    </div>
  );
}

function FirstSteps() {
  const roles = useRoles();
  return (
    <div className="stack">
      <PageHeader title="Set up your portfolio">Three steps, then rent runs itself each month.</PageHeader>
      <ol className="ops-steps">
        <li><strong>Add a property</strong> and its units, with their market rents.</li>
        <li><strong>Add tenants and leases</strong>: rent, due day and deposit. Each lease gets a payment reference for EFTs.</li>
        <li><strong>Charge the month's rent</strong>, then record payments as they arrive (or import your bank statement).</li>
      </ol>
      {roles.manage ? <Link className="btn btn-primary" to="/properties">Add your first property</Link> : <Empty>Nothing to show yet: your account's owner adds the properties.</Empty>}
    </div>
  );
}
