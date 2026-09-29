// TEBOS's own client pipeline: every enquiry from the pricing page, screened,
// decided by staff, then paid, contracted and onboarded by TEBOS on proof.
// Visible only to TEBOS's staff (row-level security); people decide, the
// server records the rest.
import { useState, type FormEvent } from "react";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { formatRand, PLAN_TERMS, type PlanKey } from "@core/plans";
import { CONTRACT_PLACEHOLDERS, DRAFT_AGREEMENT } from "../lib/contract-drafts";
import {
  assignMaintainer,
  decideOpportunity,
  getOpportunity,
  listContractTemplates,
  listOpportunities,
  listStaff,
  recordEft,
  saveTemplateDraft,
  setTemplateStatus,
  staffAccess,
  updateTemplateDraft,
  type ContractTemplate,
  type OpportunityRow,
  type StaffAccess,
} from "../lib/data";
import { ago, statusLabel, when } from "../lib/format";
import { usePeople } from "../lib/people";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
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

function useStaff() {
  const org = useOrg();
  return useQuery(() => staffAccess(org.db, org.userId), [org.userId]);
}

function StaffOnly({ access, children }: { access: ReturnType<typeof useStaff>; children: (a: StaffAccess) => React.ReactNode }) {
  if (access.loading && !access.data) return <Loading />;
  if (!access.data?.sales && !access.data?.maintainer) {
    return <PageHeader title="Pipeline">This page is for TEBOS's own staff.</PageHeader>;
  }
  return <>{children(access.data)}</>;
}

export function PipelinePage() {
  const org = useOrg();
  const access = useStaff();
  const q = useQuery(() => listOpportunities(org.db), []);
  const all = q.data ?? [];
  return (
    <StaffOnly access={access}>
      {(a) => (
        <div className="stack">
          <PageHeader
            eyebrow="TEBOS"
            title="Client pipeline"
            actions={a.admin ? <Link to="/pipeline/contracts" className="btn">Contract templates</Link> : undefined}
          >
            Every enquiry from the pricing page. Your team decides who to take on; TEBOS takes the payment, sends the contract and
            sets the client up, each only on proof.
          </PageHeader>
          {q.error ? <ErrorNote error={q.error} title="Couldn't load the pipeline" /> : !q.data ? <Loading /> : (
            <>
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
                            <span className="list-meta">{planName(o.plan)} · {o.contact_name} · {o.email} · {ago(o.created_at)}</span>
                          </div>
                          {flagsOf(o).length > 0 ? <Badge tone="warn">{flagsOf(o).length} flag{flagsOf(o).length === 1 ? "" : "s"}</Badge> : <Badge tone="good">clear</Badge>}
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
              {all.length === 0 && <Card><Empty>No enquiries yet. They appear here within a few seconds of arriving.</Empty></Card>}
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

export function OpportunityPage({ id }: { id: string }) {
  const org = useOrg();
  const access = useStaff();
  const q = useQuery(() => getOpportunity(org.db, id), [id]);
  return (
    <StaffOnly access={access}>
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
                <Card title="Enquiry" subtitle={`Received ${when(o.created_at)}`}>
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
  const org = useOrg();
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
  const org = useOrg();
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

function Maintainer({ opportunity: o, admin, onDone }: { opportunity: OpportunityRow; admin: boolean; onDone: () => void }) {
  const org = useOrg();
  const { nameOf } = usePeople();
  const staff = useQuery(() => (admin ? listStaff(org.db) : Promise.resolve([])), [admin]);
  const [error, setError] = useState<unknown>(null);
  const maintainers = (staff.data ?? []).filter((s) => s.role === "maintainer");
  return (
    <Card title="Maintainer" subtitle="The TEBOS person who looks after this client's operating system once they're onboarded.">
      <p className="list-meta">{o.maintainer_id ? nameOf(o.maintainer_id) : "Not assigned yet."}</p>
      {admin && (
        <>
          <select className="input" style={{ marginTop: 8 }} aria-label="Maintainer" value={o.maintainer_id ?? ""}
            onChange={async (e) => { setError(null); try { await assignMaintainer(org.db, o.id, e.target.value || null); onDone(); } catch (err) { setError(err); } }}>
            <option value="">Unassigned</option>
            <option value={org.userId}>You</option>
            {maintainers.filter((m) => m.user_id !== org.userId).map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
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
  const org = useOrg();
  const access = useStaff();
  const q = useQuery(() => listContractTemplates(org.db), []);
  const [editing, setEditing] = useState<ContractTemplate | "new" | null>(null);
  return (
    <StaffOnly access={access}>
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
  const org = useOrg();
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
