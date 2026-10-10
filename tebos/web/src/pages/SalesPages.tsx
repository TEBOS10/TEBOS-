// The sales team's side of TEBOS: the playbook every salesperson sells from,
// the staff list where a platform admin invites people, and the page an
// invited person opens to join. Staff join as staff only: they never become
// members of a client's organisation.
import type { PlaybookDepartment, StaffRole } from "@core/staff";
import { BriefcaseBusiness, Printer } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import {
  acceptStaffInvitation,
  createStaffInvitation,
  listPlaybook,
  listStaffInvitations,
  removeStaffRole,
  revokeStaffInvitation,
  savePlaybookSection,
  staffInvitationForToken,
  type PlaybookSection,
} from "../lib/data";
import { ago, when } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { fillPlaybook, PLAYBOOK_FIELDS } from "../lib/playbook";
import { useSessionState, useSignedIn } from "../lib/session";
import { useStaff } from "../lib/staff";
import { useQuery } from "../lib/useQuery";
import { AgreementText } from "./ContractPage";
import { StaffOnly } from "./PipelinePage";
import { SignIn } from "./SignIn";

const ROLE_LABEL: Record<string, string> = { sales: "Sales", maintainer: "Maintainer", marketing: "Marketing", admin: "Admin" };

const PLAYBOOKS: Record<PlaybookDepartment, { eyebrow: string; title: string; intro: string; footer: ReactNode }> = {
  sales: {
    eyebrow: "TEBOS sales",
    title: "Sales playbook",
    intro: "What TEBOS is, who to sell to, the plans and prices, and how to run a call, from first message to payment. Internal: don't share it outside TEBOS.",
    footer: <>Ready? <Link to="/pipeline">Add your lead to the pipeline</Link>. Prices here are the ones on the pricing page and in every contract.</>,
  },
  marketing: {
    eyebrow: "TEBOS marketing",
    title: "Marketing playbook",
    intro: "What TEBOS says and never says, how a post goes from draft to published, the channels, and what to do when someone gets in touch. Internal: don't share it outside TEBOS.",
    footer: <>Ready? <Link to="/marketing">Write a draft</Link>. Nothing goes out until a platform admin approves it.</>,
  },
};

export function SalesPlaybookPage() {
  return <StaffOnly title="Sales playbook">{(a) => <Playbook department="sales" admin={a.admin} />}</StaffOnly>;
}

export function MarketingPlaybookPage() {
  return (
    <StaffOnly title="Marketing playbook" allow={(a) => a.sales || a.maintainer || a.marketing}>
      {(a) => <Playbook department="marketing" admin={a.admin} />}
    </StaffOnly>
  );
}

function Playbook({ department, admin }: { department: PlaybookDepartment; admin: boolean }) {
  const { db } = useSignedIn();
  const q = useQuery(() => listPlaybook(db, department), [department]);
  const book = PLAYBOOKS[department];
  const [editing, setEditing] = useState<string | null>(null);
  const sections = q.data ?? [];
  return (
    <div className="stack playbook">
      <PageHeader
        eyebrow={book.eyebrow}
        title={book.title}
        actions={<button className="btn no-print" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print</button>}
      >
        {book.intro}
      </PageHeader>
      {q.error ? <ErrorNote error={q.error} title="Couldn't load the playbook" /> : !q.data ? <Loading /> : sections.length === 0 ? (
        <Card><Empty>The playbook is empty.</Empty></Card>
      ) : (
        <>
          <Card>
            <nav aria-label="Playbook contents" className="playbook-toc">
              {sections.map((s, i) => <a key={s.id} href={`#${s.key}`}>{i + 1}. {s.title}</a>)}
            </nav>
          </Card>
          {sections.map((s, i) => (
            <section key={s.id} id={s.key} className="card playbook-section" aria-labelledby={`${s.key}-title`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 id={`${s.key}-title`} className="card-title">{i + 1}. {s.title}</h2>
                {admin && editing !== s.id && <button className="btn btn-sm no-print" onClick={() => setEditing(s.id)}>Edit</button>}
              </div>
              {editing === s.id ? (
                <SectionEditor section={s} onDone={() => { setEditing(null); q.reload(); }} />
              ) : (
                <AgreementText text={fillPlaybook(s.body)} />
              )}
            </section>
          ))}
        </>
      )}
      <p className="muted no-print">
        {book.footer}
      </p>
    </div>
  );
}

function SectionEditor({ section, onDone }: { section: PlaybookSection; onDone: () => void }) {
  const { db } = useSignedIn();
  const [form, setForm] = useState({ title: section.title, body: section.body });
  const [error, setError] = useState<unknown>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await savePlaybookSection(db, section.id, form);
      onDone();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <form className="form" onSubmit={save} aria-label={`Edit ${section.title}`}>
      <Field label="Title"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Text" hint={<>Headings start with ## , list items with - , **bold** in stars. Prices: {Object.keys(PLAYBOOK_FIELDS).map((k) => <code key={k}>{`{{${k}}}`} </code>)}</>}>
        <textarea className="input mono" rows={16} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      <ErrorNote error={error} title="Not saved" />
      <div className="row">
        <button className="btn btn-primary">Save</button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Staff (platform admins)
// ---------------------------------------------------------------------------

export function StaffTeamPage() {
  return (
    <StaffOnly title="Staff">
      {(a) => (!a.admin ? <PageHeader title="Staff">Only TEBOS's platform admins manage staff.</PageHeader> : <StaffAdmin />)}
    </StaffOnly>
  );
}

function StaffAdmin() {
  const { db, userId } = useSignedIn();
  const staff = useStaff();
  const invitations = useQuery(() => listStaffInvitations(db), []);
  const [form, setForm] = useState<{ email: string; role: StaffRole }>({ email: "", role: "sales" });
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const token = await createStaffInvitation(db, form.email, form.role);
      setLink({ email: form.email.trim().toLowerCase(), url: `${window.location.origin}/staff-invite/${token}` });
      setForm({ ...form, email: "" });
      invitations.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      invitations.reload();
      staff.reload();
    } catch (err) {
      setError(err);
    }
  }

  const pending = (invitations.data ?? []).filter((i) => i.status === "pending");
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title="Staff">
        TEBOS's own people. Sales see the pipeline and the playbook and add leads; maintainers look after clients once they're
        onboarded; marketing drafts posts and articles for approval, and sees no pipeline or client. Staff never see a client's data unless they maintain that client.
      </PageHeader>
      <Card title="Invite someone" subtitle="The link works only for this email address, once confirmed, for 7 days.">
        <form className="form" onSubmit={invite} aria-label="Invite staff">
          <div className="form-row">
            <Field label="Email address"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
                <option value="sales">Sales</option>
                <option value="maintainer">Maintainer</option>
                <option value="marketing">Marketing</option>
              </select>
            </Field>
          </div>
          <ErrorNote error={error} title="Not done" />
          <div><button className="btn btn-primary" disabled={busy || !form.email.trim()}>{busy ? "Creating link…" : "Create invitation link"}</button></div>
        </form>
        {link && (
          <div className="note note-info" role="status" style={{ marginTop: 12 }} data-testid="staff-invite-link">
            Send this link to <strong>{link.email}</strong> yourself. It's shown only once.
            <div className="mono" style={{ wordBreak: "break-all", marginTop: 6 }}>{link.url}</div>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(link.url)}>Copy link</button>
          </div>
        )}
      </Card>
      <Card title="Staff">
        {staff.members.length === 0 ? <Empty>Nobody yet.</Empty> : (
          <ul className="list" data-testid="staff">
            {staff.members.map((m) => (
              <li key={m.user_id}>
                <div className="list-main">
                  <span className="list-title">{staff.nameOf(m.user_id)}</span>
                  <span className="list-meta">{m.email} · {m.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</span>
                </div>
                {m.user_id !== userId && (
                  <div className="row" style={{ gap: 6 }}>
                    {m.roles.filter((r) => r !== "admin").map((r) => (
                      <button key={r} className="btn btn-sm" onClick={() => act(() => removeStaffRole(db, m.user_id, r))}>Remove {ROLE_LABEL[r]?.toLowerCase() ?? r}</button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Invitations" subtitle={pending.length ? `${pending.length} waiting` : undefined}>
        {invitations.error ? <ErrorNote error={invitations.error} title="Couldn't load invitations" /> : !invitations.data ? <Loading /> : invitations.data.length === 0 ? <Empty>No invitations yet.</Empty> : (
          <ul className="list" data-testid="staff-invitations">
            {invitations.data.map((i) => (
              <li key={i.id}>
                <div className="list-main">
                  <span className="list-title">{i.email}</span>
                  <span className="list-meta">{ROLE_LABEL[i.role]} · sent {ago(i.created_at)}{i.status === "pending" ? ` · valid until ${when(i.expires_at)}` : ""}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <StatusBadge status={i.status} />
                  {i.status === "pending" && <button className="btn btn-sm" onClick={() => act(() => revokeStaffInvitation(db, i.id))}>Revoke</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /staff-invite/:token: join TEBOS's staff
// ---------------------------------------------------------------------------

export function StaffInvitePage({ token }: { token: string }) {
  const { state, db, refresh } = useSessionState();
  const invite = useQuery(() => staffInvitationForToken(db, token), [token]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expired, setExpired] = useState(false);

  if (invite.loading && invite.data === undefined) return <div className="auth"><Loading label="Checking your invitation" /></div>;
  if (!invite.data) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1 className="page-title" style={{ fontSize: 22 }}>This invitation isn't valid</h1>
          <p className="muted">It may have expired, been replaced by a newer link, or already been used. Ask the person who invited you for a new one.</p>
        </div>
      </div>
    );
  }
  const role = ROLE_LABEL[invite.data.role] ?? invite.data.role;
  if (state.phase === "signed_out") {
    return <SignIn allowSignUp notice={`You've been invited to join TEBOS's team (${role.toLowerCase()}). Sign in, or create an account, with ${invite.data.email}.`} />;
  }
  const email = state.phase === "ready" || state.phase === "no_organisation" ? state.session.user.email : null;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const granted = await acceptStaffInvitation(db, token);
      if (!granted) {
        setExpired(true);
        setBusy(false);
        return;
      }
      await refresh();
      navigate(granted === "sales" ? "/sales" : "/pipeline");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="row">
          <span className="brand-mark" aria-hidden><BriefcaseBusiness size={18} /></span>
          <h1 className="page-title" style={{ fontSize: 22 }}>Join TEBOS's team: {role}</h1>
        </div>
        <p className="muted">
          You're signed in as <strong>{email}</strong>. The invitation is for <strong>{invite.data.email}</strong> and only works for that
          address.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          As TEBOS staff you see the client pipeline and the sales playbook. Both are confidential to TEBOS.
        </p>
        {expired && <div className="note note-warn">This invitation has expired. Ask for a new link.</div>}
        <ErrorNote error={error} title="Couldn't join" />
        <div className="row">
          <button className="btn btn-primary" onClick={accept} disabled={busy || expired}>{busy ? "Joining…" : "Join the team"}</button>
          <button className="btn" onClick={() => db.auth.signOut()}>Use a different account</button>
        </div>
      </div>
    </div>
  );
}
