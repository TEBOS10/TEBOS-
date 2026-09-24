import { Check, Copy, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { createInvitation, inviteLink, listInvitations, ORG_ROLE_LABEL, removeMember, revokeInvitation, setMemberRole } from "../lib/data";
import { ago, when } from "../lib/format";
import { usePeople } from "../lib/people";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const ROLE_HELP: Record<string, string> = {
  org_admin: "Everything, including people and connections",
  operator: "Runs scans, records evidence, proposes and runs actions",
  approver: "Reads everything and decides approvals",
  viewer: "Read-only",
};

export function TeamPage() {
  const org = useOrg();
  const people = usePeople();
  const isAdmin = org.can("org.manage_members");
  const invitations = useQuery(() => (isAdmin ? listInvitations(org.db, org.organisation.id) : Promise.resolve([])), [org.organisation.id, isAdmin]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      people.reload();
      invitations.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Controls" title="Team">
        Who can see and change {org.organisation.name}'s businesses, evidence and actions. Every change here is audited.
      </PageHeader>
      <ErrorNote error={error} title="That change wasn't made" />
      <div className="grid grid-main">
        <Card title="Members" subtitle={`${people.members.length} ${people.members.length === 1 ? "person" : "people"}`}>
          {!people.loaded ? (
            <Loading />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {people.members.map(({ membership: m, profile }) => (
                  <tr key={m.user_id}>
                    <td className="wrap">
                      <div className="list-title">{people.nameOf(m.user_id)}</div>
                      <div className="list-meta">
                        {profile?.email ?? "No email shared yet"} · joined {ago(m.created_at)}
                      </div>
                    </td>
                    <td>
                      {isAdmin ? (
                        <select
                          className="input"
                          aria-label={`Role for ${people.nameOf(m.user_id)}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => act(() => setMemberRole(org.db, org.organisation.id, m.user_id, e.target.value))}
                        >
                          {Object.entries(ORG_ROLE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ORG_ROLE_LABEL[m.role]
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        {m.user_id !== org.userId && (
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act(() => removeMember(org.db, org.organisation.id, m.user_id))}>
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="stack">
          {isAdmin ? <InviteCard onInvited={invitations.reload} /> : <Card title="Invitations"><Empty>Only admins can invite people.</Empty></Card>}
          {isAdmin && (
            <Card title="Invitations" subtitle="Links expire after 7 days and work once">
              {invitations.loading && !invitations.data && <Loading />}
              <ErrorNote error={invitations.error} title="Couldn't load invitations" />
              {invitations.data && invitations.data.length === 0 && <Empty>None sent yet.</Empty>}
              {invitations.data && invitations.data.length > 0 && (
                <ul className="list">
                  {invitations.data.map((i) => (
                    <li key={i.id}>
                      <div className="list-main">
                        <span className="list-title">{i.email}</span>
                        <span className="list-meta">
                          {ORG_ROLE_LABEL[i.role]} · sent {ago(i.created_at)}
                          {i.status === "pending" ? ` · expires ${when(i.expires_at)}` : ""}
                        </span>
                      </div>
                      <div className="row">
                        <StatusBadge status={i.status} />
                        {i.status === "pending" && (
                          <button className="btn btn-sm" disabled={busy} onClick={() => act(() => revokeInvitation(org.db, i.id))}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InviteCard({ onInvited }: { onInvited: () => void }) {
  const org = useOrg();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operator");
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const token = await createInvitation(org.db, org.organisation.id, email, role);
      setLink({ email: email.trim().toLowerCase(), url: inviteLink(token) });
      setEmail("");
      onInvited();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card title="Invite someone" subtitle="They join with the role you choose, once they sign in with this exact email and confirm it.">
      <form className="form" onSubmit={invite}>
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ORG_ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote error={error} title="No invitation was created" />
        <div>
          <button className="btn btn-primary" disabled={busy}>
            <UserPlus size={15} aria-hidden /> {busy ? "Creating…" : "Create invitation link"}
          </button>
        </div>
      </form>
      {link && (
        <div className="note note-good" style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div>
            <strong>Send this link to {link.email}.</strong> It's shown only now — TEBOS keeps just a fingerprint of it. If it's lost, create a new one.
          </div>
          <div className="excerpt" data-testid="invite-link">
            {link.url}
          </div>
          <div>
            <button type="button" className="btn btn-sm" onClick={copy}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
