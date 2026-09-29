// TEBOS's own client pipeline: every enquiry from the pricing page or from a
// salesperson's outreach, screened, decided by staff, then paid, contracted
// and onboarded by TEBOS on proof. Visible only to TEBOS's staff (row-level
// security); people decide, the server records the rest. Staff need no
// organisation of their own, so these pages use the signed-in session.
import { useState, type FormEvent } from "react";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { formatRand, PLAN_TERMS, type PlanKey } from "@core/plans";
import { CONTRACT_PLACEHOLDERS, DRAFT_AGREEMENT } from "../lib/contract-drafts";
import {
  addLead,
  assignMaintainer,
  decideOpportunity,
  getOpportunity,
  listContractTemplates,
  listOpportunities,
  recordEft,
  saveTemplateDraft,
  setLeadOwner,
  setTemplateStatus,
  updateTemplateDraft,
  type NewLead,
  type ContractTemplate,
  type OpportunityRow,
  type StaffAccess,
} from "../lib/data";
import { ago, statusLabel, when } from "../lib/format";
import { Link } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useStaff } from "../lib/staff";
import { useQuery } from "../lib/useQuery";

export const STAGES: Array<{ status: string; label: string; hint: string }> = [
  { status: "screened", label: "To decide", hint: "Screened; waiting for sales to approve or decline" },
  { status: "approved", label: "Approved", hint: "Waiting for TEBOS to create the payment page" },
  { status: "awaiting_payment", label: "Awaiting payment", hint: "Payment page sent to the client" },
  { status: "paid", label: "Paid", hint: "Contract goes out once a lawyer-approved template exists" },
  { status: "contract_sent", label: "Contract sent", hint: "Waiting for the client to accept" },
  { status: "contracted", label: "Contracted", hint: "TEBOS is setting up their organisation" },
  { status: "onboarded", label: "Onboarded", hint: "Live client" },
];

interface Flag {
  code: string;
  detail: string;
}
const flagsOf = (o: OpportunityRow): Flag[] => ((o.screening as { flags?: Flag[] } | null)?.flags ?? []);
const planName = (p: string) => PLAN_TERMS[p as PlanKey]?.name ?? p;

export function StaffOnly({ title = "Pipeline", children }: { title?: string; children: (a: StaffAccess) => React.ReactNode }) {
  const { access, loading } = useStaff();
  if (loading) return <Loading />;
  if (!access?.sales && !access?.maintainer) {
    return <PageHeader title={title}>This page is for TEBOS's own staff.</PageHeader>;
  }
  return <>{children(access)}</>;
}

export function PipelinePage() {
  const org = useSignedIn();
  const { nameOf } = useStaff();
  const q = useQuery(() => listOpportunities(org.db), []);
  const [mine, setMine] = useState(false);
  const [adding, setAdding] = useState(false);
  const all = (q.data ?? []).filter((o) => !mine || o.owner_id === org.userId);
  return (
    <StaffOnly>
      {(a) => (
        <div className="stack">
          <PageHeader
            eyebrow="TEBOS"
            title="Client pipeline"
            actions={
              <div className="row" style={{ gap: 8 }}>
                {a.sales && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a lead</button>}
                <Link to="/sales" className="btn">Sales playbook</Link>
                {a.admin && <Link to="/pipeline/team" className="btn">Staff</Link>}
                {a.admin && <Link to="/pipeline/contracts" className="btn">Contract templates</Link>}
              </div>
            }
          >
            Every enquiry from the pricing page and every lead your team adds. Your team decides who to take on; TEBOS takes the
            payment, sends the contract and sets the client up, each only on proof.
          </PageHeader>
          {adding && <AddLead onDone={() => { setAdding(false); q.reload(); }} />}
          {q.error ? <ErrorNote error={q.error} title="Couldn't load the pipeline" /> : !q.data ? <Loading /> : (
            <>
              {a.sales && (
                <div className="row" role="group" aria-label="Show">
                  <button className={`btn btn-sm ${mine ? "" : "btn-primary"}`} aria-pressed={!mine} onClick={() => setMine(false)}>Everyone's</button>
                  <button className={`btn btn-sm ${mine ? "btn-primary" : ""}`} aria-pressed={mine} onClick={() => setMine(true)}>Mine</button>
                </div>
              )}
              <div className="grid grid-4" data-testid="pipeline-counts">
                {STAGES.slice(0, 4).map((s) => (
                  <section key={s.status} className="card stat" title={s.hint}>
                    <span className="stat-value">{all.filter((o) => o.status === s.status).length}</span>
                    <span className="stat-label">{s.label}</span>
                    <span className="stat-sub">{s.hint}</span>
                  </section>
                ))}
              </div>
              {STAGES.map((s) => {
                const rows = all.filter((o) => o.status === s.status);
                if (!rows.length) return null;
                return (
                  <Card key={s.status} title={`${s.label} · ${rows.length}`} subtitle={s.hint}>
                    <ul className="list">
                      {rows.map((o) => (
                        <li key={o.id} data-testid="opportunity">
                          <div className="list-main">
                            <Link to={`/pipeline/${o.id}`} className="list-title">{o.business}</Link>
                            <span className="list-meta">
                              {planName(o.plan)} · {o.contact_name} · {o.email} · {ago(o.created_at)} · {o.owner_id ? nameOf(o.owner_id) : "No owner"}
                            </span>
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <Badge tone={o.source === "sales" ? "info" : "neutral"}>{o.source === "sales" ? "sales lead" : "website"}</Badge>
                            {flagsOf(o).length > 0 ? <Badge tone="warn">{flagsOf(o).length} flag{flagsOf(o).length === 1 ? "" : "s"}</Badge> : <Badge tone="good">clear</Badge>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
              {q.data.length === 0 && <Card><Empty>No enquiries yet. They appear here within a few seconds of arriving.</Empty></Card>}
              {q.data.length > 0 && all.length === 0 && <Card><Empty>You don't own any leads yet. Add one, or take an unowned lead from its page.</Empty></Card>}
              {all.some((o) => o.status === "declined" || o.status === "cancelled") && (
                <Card title="Closed" subtitle="Declined or cancelled, with the reason">
                  <ul className="list">
                    {all.filter((o) => o.status === "declined" || o.status === "cancelled").map((o) => (
                      <li key={o.id}>
                        <div className="list-main">
                          <Link to={`/pipeline/${o.id}`} className="list-title">{o.business}</Link>
                          <span className="list-meta">{o.decision_note}</span>
                        </div>
                        <StatusBadge status={o.status} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </StaffOnly>
  );
}

/** A lead from the salesperson's own outreach. It is theirs, and TEBOS screens it like any enquiry. */
function AddLead({ onDone }: { onDone: () => void }) {
  const org = useSignedIn();
  const empty: NewLead = { plan: "starter", name: "", business: "", email: "", phone: "", website: "", message: "" };
  const [form, setForm] = useState<NewLead>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof NewLead) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addLead(org.db, form);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }
  return (
    <Card title="Add a lead" subtitle="From your own outreach. It's yours: nobody else can take it. TEBOS screens it within seconds, like any enquiry.">
      <form className="form" onSubmit={save} aria-label="Add a lead">
        <div className="form-row">
          <Field label="Business"><input className="input" required maxLength={160} value={form.business} onChange={set("business")} /></Field>
          <Field label="Contact name"><input className="input" required maxLength={120} value={form.name} onChange={set("name")} /></Field>
        </div>
        <div className="form-row">
          <Field label="Email"><input className="input" type="email" required maxLength={254} value={form.email} onChange={set("email")} /></Field>
          <Field label="Phone"><input className="input" maxLength={40} value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Website"><input className="input" maxLength={300} value={form.website} onChange={set("website")} placeholder="e.g. northwind.co.za" /></Field>
        </div>
        <Field label="Plan they're considering">
          <select className="input" value={form.plan} onChange={set("plan")}>
            {(["starter", "growth", "equity"] as const).map((k) => <option key={k} value={k}>{PLAN_TERMS[k].name}</option>)}
          </select>
        </Field>
        <Field label="Notes" hint="Where you met, what they need, who decides. Don't paste anything confidential they told you.">
          <textarea className="input" rows={3} maxLength={2000} value={form.message} onChange={set("message")} />
        </Field>
        <ErrorNote error={error} title="Lead not added" />
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? "Adding…" : "Add lead"}</button>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

export function OpportunityPage({ id }: { id: string }) {
  const org = useSignedIn();
  const q = useQuery(() => getOpportunity(org.db, id), [id]);
  return (
    <StaffOnly>
      {(a) => {
        if (q.loading && !q.data) return <Loading />;
        if (q.error) return <ErrorNote error={q.error} title="Couldn't load this opportunity" />;
        if (!q.data) return <PageHeader title="Not found">It doesn't exist, or you can't see it.</PageHeader>;
        const { opportunity: o, payments, contract, emails } = q.data;
        const flags = flagsOf(o);
        const stage = STAGES.find((s) => s.status === o.status);
        return (
          <div className="stack">
            <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title={o.business} actions={<StatusBadge status={o.status} />}>
              {planName(o.plan)}{o.amount_cents ? ` · ${formatRand(o.amount_cents)} a month` : ""} · {stage?.hint ?? statusLabel(o.status)}
            </PageHeader>
            <div className="grid grid-main">
              <div className="stack">
                <Card title={o.source === "sales" ? "Lead" : "Enquiry"} subtitle={`${o.source === "sales" ? "Added by sales" : "From the website"} · ${when(o.created_at)}`}>
                  <dl className="confidence-parts">
                    {([["Name", o.contact_name], ["Email", o.email], ["Phone", o.phone], ["Website", o.website], ["Message", o.message]] as const).map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd style={{ display: "block", whiteSpace: "pre-wrap" }}>{v ?? <span className="faint">Not given</span>}</dd></div>
                    ))}
                  </dl>
                </Card>
                <Card title="Screening" subtitle="Checked automatically on arrival. A flag is a reason to look closer, not a verdict.">
                  {flags.length === 0 ? <p className="muted">Nothing flagged.</p> : (
                    <ul className="list" data-testid="flags">
                      {flags.map((f) => <li key={f.code}><div className="list-main"><span className="list-title">{statusLabel(f.code)}</span><span className="list-meta">{f.detail}</span></div></li>)}
                    </ul>
                  )}
                </Card>
                {(o.status === "screened" || o.status === "approved" || o.status === "awaiting_payment" || o.status === "contract_sent") && a.sales && (
                  <Decide opportunity={o} flagged={flags.length > 0} onDone={q.reload} />
                )}
                {o.decision_note && (
                  <Card title="Decision"><p style={{ margin: 0 }}>{o.decision_note}</p></Card>
                )}
              </div>
              <div className="stack">
                <Card title="Payment">
                  {o.plan === "equity" ? <p className="muted">Equity applications don't pay online: they need a valuation and a shareholder agreement.</p> : (
                    <>
                      {o.payment_url ? (
                        <p className="list-meta">Payment page: <a href={o.payment_url} target="_blank" rel="noreferrer noopener">{o.payment_url}</a></p>
                      ) : <p className="muted">{o.status === "approved" ? "TEBOS creates the payment page next (needs the Paystack key on the worker)." : "Created once approved."}</p>}
                      {payments.length > 0 && (
                        <ul className="list" style={{ marginTop: 8 }}>
                          {payments.map((p) => (
                            <li key={p.id}>
                              <div className="list-main">
                                <span className="list-title">{formatRand(p.amount_cents)} · {p.provider === "manual" ? "EFT" : "Paystack"}</span>
                                <span className="list-meta">{p.reference} · {when(p.paid_at)}{p.note ? ` · ${p.note}` : ""}</span>
                              </div>
                              <StatusBadge status={p.status === "success" ? "completed" : "failed"} />
                            </li>
                          ))}
                        </ul>
                      )}
                      {a.admin && o.status === "awaiting_payment" && <RecordEft opportunity={o} onDone={q.reload} />}
                    </>
                  )}
                </Card>
                <Card title="Contract">
                  {!contract ? <p className="muted">{o.status === "paid" ? "Waiting for a lawyer-approved contract template for this plan." : "Sent once paid."}</p> : (
                    <dl className="confidence-parts" data-testid="contract-status">
                      <div><dt>Template</dt><dd>{contract.template_key} v{contract.template_version}</dd></div>
                      <div><dt>Sent</dt><dd>{when(contract.sent_at)}</dd></div>
                      <div><dt>Status</dt><dd>{contract.status === "accepted" ? `Accepted by ${contract.accepted_name}, ${when(contract.accepted_at)}` : `Waiting for acceptance (link valid until ${when(contract.expires_at)})`}</dd></div>
                      {contract.accepted_ip && <div><dt>From</dt><dd>{contract.accepted_ip}</dd></div>}
                    </dl>
                  )}
                </Card>
                <Card title="Emails to the client" subtitle="Sent by TEBOS with retries. The links in them stay private.">
                  {emails.length === 0 ? <p className="muted">None yet.</p> : (
                    <ul className="list" data-testid="emails">
                      {emails.map((m) => (
                        <li key={m.id}>
                          <div className="list-main">
                            <span className="list-title">{m.subject}</span>
                            <span className="list-meta">{m.sent_at ? `Sent ${ago(m.sent_at)}` : m.error ? `Not sent yet: ${m.error} (attempt ${m.attempts} of 5)` : "Waiting to send (needs the email key on the worker)"}</span>
                          </div>
                          <StatusBadge status={m.sent_at ? "completed" : m.attempts >= 5 ? "failed" : "pending"} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Owner opportunity={o} admin={a.admin} sales={a.sales} onDone={q.reload} />
                <Maintainer opportunity={o} admin={a.admin} onDone={q.reload} />
                {o.org_id && <Card title="Client organisation"><p className="list-meta">Set up and invited. Their maintainer is a member of it.</p></Card>}
              </div>
            </div>
          </div>
        );
      }}
    </StaffOnly>
  );
}

function Decide({ opportunity: o, flagged, onDone }: { opportunity: OpportunityRow; flagged: boolean; onDone: () => void }) {
  const org = useSignedIn();
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function go(status: "approved" | "declined" | "cancelled") {
    setError(null);
    try {
      await decideOpportunity(org.db, o.id, status, note);
      setNote("");
      onDone();
    } catch (e) {
      setError(e);
    }
  }
  const open = o.status === "screened";
  return (
    <Card title={open ? "Decide" : "Stop this opportunity"} subtitle={open && flagged ? "Screening flagged this enquiry: approving it needs a reason." : undefined}>
      <Field label={open ? "Reason or note" : "Reason for cancelling"}>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={open ? "e.g. Spoke to them: a genuine buyer for their own business" : "e.g. The client changed their mind"} />
      </Field>
      <ErrorNote error={error} title="Not saved" />
      <div className="row">
        {open && <button className="btn btn-primary" onClick={() => go("approved")}>Approve</button>}
        {open && <button className="btn" disabled={!note.trim()} onClick={() => go("declined")}>Decline</button>}
        <button className="btn" disabled={!note.trim()} onClick={() => go("cancelled")}>Cancel</button>
      </div>
    </Card>
  );
}

function RecordEft({ opportunity: o, onDone }: { opportunity: OpportunityRow; onDone: () => void }) {
  const org = useSignedIn();
  const [form, setForm] = useState({ reference: "", amount: o.amount_cents ? String(o.amount_cents / 100) : "", paidOn: new Date().toISOString().slice(0, 10), note: "" });
  const [error, setError] = useState<unknown>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await recordEft(org.db, o.id, form.reference, Math.round(Number(form.amount) * 100), new Date(form.paidOn).toISOString(), form.note);
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form className="form" style={{ marginTop: 12 }} onSubmit={save} aria-label="Record an EFT">
      <p className="list-meta">Paid by EFT instead? Record it once you've seen it on the bank statement. It's recorded in your name.</p>
      <div className="form-row">
        <Field label="Bank reference"><input className="input" required value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Amount (R)"><input className="input" type="number" min={1} step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Paid on"><input className="input" type="date" required value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></Field>
        <Field label="Note"><input className="input" required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Seen on the FNB statement" /></Field>
      </div>
      <ErrorNote error={error} title="Not recorded" />
      <div><button className="btn btn-sm" disabled={!form.reference.trim() || !form.note.trim() || !form.amount}>Record EFT</button></div>
    </form>
  );
}

function Owner({ opportunity: o, admin, sales, onDone }: { opportunity: OpportunityRow; admin: boolean; sales: boolean; onDone: () => void }) {
  const org = useSignedIn();
  const { members, nameOf } = useStaff();
  const [error, setError] = useState<unknown>(null);
  const set = async (id: string | null) => {
    setError(null);
    try { await setLeadOwner(org.db, o.id, id); onDone(); } catch (err) { setError(err); }
  };
  const reps = members.filter((m) => m.roles.includes("sales"));
  return (
    <Card title="Owner" subtitle="The salesperson this lead belongs to. Only an admin reassigns a lead that has an owner.">
      <p className="list-meta" data-testid="owner">{o.owner_id ? nameOf(o.owner_id) : "No owner yet."}</p>
      {admin ? (
        <select className="input" style={{ marginTop: 8 }} aria-label="Owner" value={o.owner_id ?? ""} onChange={(e) => set(e.target.value || null)}>
          <option value="">No owner</option>
          {reps.map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
        </select>
      ) : sales && !o.owner_id ? (
        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => set(org.userId)}>Take this lead</button>
      ) : null}
      <ErrorNote error={error} title="Owner not changed" />
    </Card>
  );
}

function Maintainer({ opportunity: o, admin, onDone }: { opportunity: OpportunityRow; admin: boolean; onDone: () => void }) {
  const org = useSignedIn();
  const { members, nameOf } = useStaff();
  const [error, setError] = useState<unknown>(null);
  const maintainers = members.filter((m) => m.roles.includes("maintainer") || m.roles.includes("admin"));
  return (
    <Card title="Maintainer" subtitle="The TEBOS person who looks after this client's operating system once they're onboarded.">
      <p className="list-meta">{o.maintainer_id ? nameOf(o.maintainer_id) : "Not assigned yet."}</p>
      {admin && (
        <>
          <select className="input" style={{ marginTop: 8 }} aria-label="Maintainer" value={o.maintainer_id ?? ""}
            onChange={async (e) => { setError(null); try { await assignMaintainer(org.db, o.id, e.target.value || null); onDone(); } catch (err) { setError(err); } }}>
            <option value="">Unassigned</option>
            {!maintainers.some((m) => m.user_id === org.userId) && <option value={org.userId}>You</option>}
            {maintainers.map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
          </select>
          <ErrorNote error={error} title="Not assigned" />
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Contract templates (platform admins)
// ---------------------------------------------------------------------------

export function ContractTemplatesPage() {
  const org = useSignedIn();
  const q = useQuery(() => listContractTemplates(org.db), []);
  const [editing, setEditing] = useState<ContractTemplate | "new" | null>(null);
  return (
    <StaffOnly>
      {(a) => !a.admin ? <PageHeader title="Contract templates">Only TEBOS's admins manage contract templates.</PageHeader> : (
        <div className="stack">
          <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title="Contract templates"
            actions={<button className="btn btn-primary" onClick={() => setEditing("new")}>New draft</button>}>
            Each plan's agreement. TEBOS only sends a contract from a template marked approved by a lawyer. Once approved, a template is
            fixed: write a new version to change it.
          </PageHeader>
          {editing && <TemplateEditor template={editing === "new" ? null : editing} existing={q.data ?? []} onDone={() => { setEditing(null); q.reload(); }} />}
          {q.error ? <ErrorNote error={q.error} title="Couldn't load templates" /> : !q.data ? <Loading /> : q.data.length === 0 ? (
            <Card><Empty>No templates yet. Start a draft from TEBOS's starting agreement and have your lawyer review it.</Empty></Card>
          ) : (
            <Card>
              <ul className="list" data-testid="templates">
                {q.data.map((t) => (
                  <li key={`${t.key}@${t.version}`}>
                    <div className="list-main">
                      <span className="list-title">{t.title} · v{t.version}</span>
                      <span className="list-meta">{planName(t.plan)} · {t.key}{t.approval_note ? ` · ${t.approval_note}` : ""}</span>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <StatusBadge status={t.status === "approved" ? "active" : t.status} />
                      {t.status === "draft" && <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit or approve</button>}
                      {t.status === "approved" && <button className="btn btn-sm" onClick={async () => { await setTemplateStatus(org.db, t.key, t.version, "retired", null); q.reload(); }}>Retire</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </StaffOnly>
  );
}

function TemplateEditor({ template, existing, onDone }: { template: ContractTemplate | null; existing: ContractTemplate[]; onDone: () => void }) {
  const org = useSignedIn();
  const [form, setForm] = useState({
    plan: template?.plan ?? "starter",
    key: template?.key ?? "agreement",
    title: template?.title ?? "TEBOS client agreement",
    body: template?.body ?? DRAFT_AGREEMENT,
  });
  const [approval, setApproval] = useState("");
  const [error, setError] = useState<unknown>(null);
  const key = template?.key ?? `${form.key}-${form.plan}`;
  const version = template?.version ?? 1 + Math.max(0, ...existing.filter((t) => t.key === key).map((t) => t.version));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (template) await updateTemplateDraft(org.db, template.key, template.version, { title: form.title, body: form.body });
      else await saveTemplateDraft(org.db, { key, version, plan: form.plan, title: form.title, body: form.body });
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  async function approve() {
    if (!template) return;
    setError(null);
    try {
      await updateTemplateDraft(org.db, template.key, template.version, { title: form.title, body: form.body });
      await setTemplateStatus(org.db, template.key, template.version, "approved", approval.trim());
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <Card title={template ? `${template.title} · v${template.version}` : "New draft"} subtitle="The starting text is a draft for your lawyer: it isn't legal advice.">
      <form className="form" onSubmit={save} aria-label="Contract template">
        <div className="form-row">
          <Field label="Plan">
            <select className="input" value={form.plan} disabled={!!template} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="starter">{PLAN_TERMS.starter.name}</option>
              <option value="growth">{PLAN_TERMS.growth.name}</option>
            </select>
          </Field>
          <Field label="Title"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        </div>
        <Field label="Agreement" hint={<>Placeholders filled per client: {CONTRACT_PLACEHOLDERS.map(([k, d]) => <span key={k} title={d}><code>{`{{${k}}}`}</code> </span>)}</>}>
          <textarea className="input mono" rows={18} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <ErrorNote error={error} title="Not saved" />
        <div className="row">
          <button className="btn">{template ? "Save draft" : `Save as ${key} v${version}`}</button>
          <button type="button" className="btn" onClick={onDone}>Close</button>
        </div>
      </form>
      {template && (
        <div className="form" style={{ marginTop: 16 }}>
          <Field label="Approval" hint="Approve only once a lawyer has reviewed this exact text. Say who approved it and when.">
            <input className="input" value={approval} onChange={(e) => setApproval(e.target.value)} placeholder="e.g. Approved by A. Naidoo (attorney), 3 Oct 2026" />
          </Field>
          <div><button className="btn btn-primary" disabled={!approval.trim()} onClick={approve}>Approve for sending</button></div>
        </div>
      )}
    </Card>
  );
}
