// The owner's monthly update, the heart of the monthly subscription: what was
// finished this month (with its evidence), what is next, anything that needs
// attention, and the measured result against the frozen baseline. Computed by
// @core/property's monthlyUpdate from the case's recorded work and reviews;
// nothing on this page is estimated. Print or save as PDF from the browser.
import { FOUNDING_OFFER, money, monthlyUpdate, scorecard } from "@core/property";
import { ErrorNote, Loading } from "../components/ui";
import { getPropertyCase } from "../lib/data";
import { toBaseline, toReviews, toWorkstream } from "../lib/property";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export function PropertyMonthPage({ id, month }: { id: string; month?: string }) {
  const org = useOrg();
  const q = useQuery(() => getPropertyCase(org.db, id), [id]);
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : thisMonth();
  if (q.loading && !q.data) return <div className="pra"><Loading /></div>;
  if (q.error) return <div className="pra"><ErrorNote error={q.error} title="Couldn't load the case" /></div>;
  if (!q.data) return <div className="pra"><h1>Case not found</h1></div>;
  const data = q.data;
  const today = new Date().toISOString();
  const units = data.figures.find((f) => f.key === "units");
  const score = scorecard(data.baseline ? toBaseline(data.baseline) : null, toReviews(data.reviews, data.actuals), today, data.case.next_review_on);
  const u = monthlyUpdate({ month: m, workstreams: data.workstreams.map(toWorkstream), score, units: units ? Number(units.value) : null, today });
  const cf = u.outcome?.cashFlowChange;

  return (
    <div className="pra pra-report" data-testid="property-month">
      <div className="pra-actions no-print">
        <Link to={`/property/${data.case.id}`} className="pra-btn ghost">Back to the case</Link>
        <label className="pra-month">Month{" "}
          <input type="month" value={m} max={thisMonth()} onChange={(e) => e.target.value && navigate(`/property/${data.case.id}/month/${e.target.value}`)} />
        </label>
        <button type="button" className="pra-btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <header className="pra-report-head">
        <div className="pra-eyebrow">Tidy Enterprise · Property Revenue Architecture · Monthly update</div>
        <h1>{data.case.label}</h1>
        <p className="pra-sub">{data.case.ref} · {u.from} to {u.to}</p>
        <p className="pra-note">
          {u.plan ? `Plan: ${u.plan.label}${u.plan.monthly === null ? " (quoted)" : `, ${money(u.plan.monthly)} a month excluding VAT`}.` : "Plan: not set until the number of rentable units is recorded."}
          {" "}Founding clients: {FOUNDING_OFFER.percentOff}% off for {FOUNDING_OFFER.months} months.
        </p>
      </header>

      <section className="pra-report-section"><h2>This month in brief</h2><ul>{u.summary.map((l) => <li key={l}>{l}</li>)}</ul></section>

      <section className="pra-report-section">
        <h2>What was done</h2>
        {u.done.length === 0 ? <p className="pra-empty">No work was finished this month.</p> : (
          <table className="pra-table">
            <thead><tr><th>Work</th><th>Who</th><th>Finished</th><th>Evidence</th></tr></thead>
            <tbody>{u.done.map((d) => <tr key={d.title + d.completedOn}><td>{d.title}</td><td>{d.owner}</td><td>{d.completedOn}</td><td>{d.evidence}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="pra-report-section">
        <h2>What is next</h2>
        {u.next.length === 0 ? <p className="pra-empty">Nothing open.</p> : (
          <table className="pra-table">
            <thead><tr><th>Work</th><th>Who</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{u.next.map((n) => <tr key={n.title + n.dueOn}><td>{n.title}</td><td>{n.owner}</td><td>{n.dueOn}</td><td>{n.status.replace("_", " ")}</td></tr>)}</tbody>
          </table>
        )}
        {u.exceptions.length > 0 && <><h3>Needs attention</h3><ul>{u.exceptions.map((x) => <li key={x.title + x.reason}>{x.title}: {x.reason}</li>)}</ul></>}
      </section>

      <section className="pra-report-section">
        <h2>Figures then and now</h2>
        {!score.baseline ? <p className="pra-empty">No baseline has been captured, so results can't be measured yet.</p>
          : !u.outcome ? <p className="pra-empty">No review of actual results by the end of this month.</p> : (
            <table className="pra-table"><tbody>
              <tr><td>Baseline cash flow (captured {score.baseline.capturedOn})</td><td className="num">{score.baseline.economics.cashFlow.value === null ? "Not established" : money(score.baseline.economics.cashFlow.value)}</td></tr>
              <tr><td>Change in monthly cash flow (review of {u.outcome.reviewOn})</td><td className="num">{cf?.value === null || cf === undefined ? "Not established" : money(cf.value)}</td></tr>
              <tr><td>Against the target</td><td className="num">{u.outcome.vsTarget === null ? "No target set" : money(u.outcome.vsTarget)}</td></tr>
            </tbody></table>
          )}
      </section>
    </div>
  );
}
