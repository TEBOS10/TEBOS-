import { FileText, Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { addContext, CONTEXT_KINDS, getBusiness, requestScan, updateBusiness, type Business } from "../lib/data";
import { ago, pct, RISK_LABEL, statusLabel } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function BusinessPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getBusiness(org.db, id), [id]);
  const [rescanError, setRescanError] = useState<unknown>(null);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this business" />;
  if (!q.data) return <PageHeader title="Business not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const { business, contexts, scans, findings, actions } = q.data;
  const active = findings.filter((f) => f.status === "active");

  async function rescan() {
    if (!business.website) return;
    setRescanError(null);
    try {
      const { scan } = await requestScan(org.db, org.organisation.id, org.userId, { website: business.website, objective: "", context: "" });
      navigate(`/scans/${scan.id}`);
    } catch (e) {
      setRescanError(e);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Business"
        title={business.name}
        actions={
          <div className="row">
            <Link to={`/businesses/${business.id}/report`} className="btn">
              <FileText size={15} aria-hidden /> Report
            </Link>
            {org.can("scan.run") && business.website && (
              <button className="btn btn-primary" onClick={rescan}>
                Rescan website
              </button>
            )}
          </div>
        }
      >
        {business.website && (
          <a href={business.website} target="_blank" rel="noreferrer noopener">
            {business.website}
          </a>
        )}
        {business.industry && <span>· {business.industry}</span>}
        {business.geography && <span>· {business.geography}</span>}
      </PageHeader>
      <ErrorNote error={rescanError} title="The rescan wasn't queued" />

      <div className="grid grid-main">
        <div className="stack">
          <Card title="Active findings" subtitle="Evidence-backed interpretations" actions={<Link to="/findings">All findings</Link>}>
            {active.length === 0 ? (
              <Empty>None yet. Findings appear after a scan is read and analysed.</Empty>
            ) : (
              <ul className="list">
                {active.map((f) => (
                  <li key={f.id}>
                    <div className="list-main">
                      <Link to={`/findings/${f.id}`} className="list-title">
                        {f.title}
                      </Link>
                      <span className="list-meta">
                        {statusLabel(f.category)} · {pct(f.confidence)} confidence · {ago(f.created_at)}
                      </span>
                    </div>
                    <StatusBadge status={f.kind} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Actions">
            {actions.length === 0 ? (
              <Empty>No actions yet. Propose one from a finding.</Empty>
            ) : (
              <ul className="list">
                {actions.map((a) => (
                  <li key={a.id}>
                    <div className="list-main">
                      <Link to={`/actions/${a.id}`} className="list-title">
                        {a.title}
                      </Link>
                      <span className="list-meta">
                        {RISK_LABEL[a.risk_tier]} · priority {a.priority}
                      </span>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Scans">
            {scans.length === 0 ? (
              <Empty>Never scanned.</Empty>
            ) : (
              <ul className="list">
                {scans.map((s) => (
                  <li key={s.id}>
                    <div className="list-main">
                      <Link to={`/scans/${s.id}`} className="list-title">
                        {ago(s.created_at)}
                      </Link>
                      <span className="list-meta">
                        {s.objective ?? "General review"}
                        {s.confidence !== null ? ` · ${pct(s.confidence)} confidence` : ""}
                      </span>
                    </div>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          <Profile business={business} onSaved={q.reload} />
          <ContextCard businessId={business.id} contexts={contexts} onAdded={q.reload} />
        </div>
      </div>
    </div>
  );
}

function Profile({ business, onSaved }: { business: Business; onSaved: () => void }) {
  const org = useOrg();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: business.name, industry: business.industry ?? "", geography: business.geography ?? "", business_model: business.business_model ?? "" });
  const [error, setError] = useState<unknown>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateBusiness(org.db, business.id, {
        name: form.name.trim() || business.name,
        industry: form.industry.trim() || null,
        geography: form.geography.trim() || null,
        business_model: form.business_model.trim() || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  const rows: Array<[string, string | null]> = [
    ["Industry", business.industry],
    ["Geography", business.geography],
    ["Business model", business.business_model],
  ];
  return (
    <Card
      title="Profile"
      subtitle="What you've told TEBOS about this business"
      actions={
        org.can("business.write") && !editing ? (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Pencil size={13} aria-hidden /> Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form className="form" onSubmit={save}>
          <Field label="Name">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Industry">
            <input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </Field>
          <Field label="Geography">
            <input className="input" value={form.geography} onChange={(e) => setForm({ ...form, geography: e.target.value })} />
          </Field>
          <Field label="Business model">
            <input className="input" value={form.business_model} onChange={(e) => setForm({ ...form, business_model: e.target.value })} />
          </Field>
          <ErrorNote error={error} title="Not saved" />
          <div className="row">
            <button className="btn btn-primary">Save</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="confidence-parts">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd style={{ display: "block" }}>{v ?? <span className="faint">Not known</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function ContextCard({ businessId, contexts, onAdded }: { businessId: string; contexts: Array<{ id: string; kind: string; statement: string; created_at: string; supplied_by: string | null }>; onAdded: () => void }) {
  const org = useOrg();
  const { nameOf } = usePeople();
  const [kind, setKind] = useState<(typeof CONTEXT_KINDS)[number]>("problem");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<unknown>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addContext(org.db, org.organisation.id, businessId, org.userId, kind, statement.trim());
      setStatement("");
      onAdded();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card title="Context" subtitle="Your statements. TEBOS uses them but never treats them as verified fact.">
      {contexts.length === 0 ? (
        <Empty>Nothing added yet.</Empty>
      ) : (
        <ul className="list">
          {contexts.map((c) => (
            <li key={c.id}>
              <div className="list-main">
                <span>{c.statement}</span>
                <span className="list-meta">
                  {statusLabel(c.kind)} · {c.supplied_by ? `${nameOf(c.supplied_by)} · ` : ""}
                  {ago(c.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {org.can("business.write") && (
        <form className="form" onSubmit={add} style={{ marginTop: 12 }}>
          <div className="form-row">
            <Field label="Type">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {CONTEXT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {statusLabel(k)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Statement">
            <textarea className="input" required value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. Orders get lost between WhatsApp and the notebook." />
          </Field>
          <ErrorNote error={error} title="Not added" />
          <div>
            <button className="btn" disabled={!statement.trim()}>
              Add context
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
