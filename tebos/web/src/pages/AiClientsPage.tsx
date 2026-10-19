// AI clients: give an AI client access to this organisation's REEDS work through
// the Model Bridge, see who has access, and revoke it. The database issues the
// token, stores only its hash, and shows it here exactly once. Only an admin, in
// a session that passed two-step sign-in, can issue one.
import { BRIDGE_LIMITS, BRIDGE_SCOPES, type BridgeScope } from "@core/bridge";
import { KeyRound, ShieldOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { issueBridgeClient, listBridgeClients, revokeBridgeClient } from "../lib/data";
import { ago, when } from "../lib/format";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export const CLIENT_KINDS: Record<string, string> = {
  coding_agent: "Coding assistant (works in your code: writes, tests, opens pull requests)",
  chat_assistant: "Chat assistant (research, drafting, planning)",
};
const SCOPE_TEXT: Record<BridgeScope, string> = {
  "context.read": "Read the organisation's context: businesses, active objectives, open work",
  "tasks.read": "See the tasks written for it",
  "tasks.claim": "Take a task to work on",
  "results.submit": "Hand in results (a person reviews every one)",
};

export function AiClientsPage() {
  const org = useOrg();
  const q = useQuery(() => listBridgeClients(org.db, org.organisation.id), [org.organisation.id]);
  const [issued, setIssued] = useState<{ token: string; expires: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const admin = org.role === "org_admin";

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeBridgeClient(org.db, id);
      q.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/reeds">REEDS</Link>} title="AI clients">
        An AI client can read {org.organisation.name}'s context, take tasks a person wrote for it, and hand in results. It can't approve,
        pay, send, deploy or change access, and every result is reviewed by a person before it counts.
      </PageHeader>
      {org.organisation.private && <p className="note note-warn" role="status">Private organisations are never open to AI clients.</p>}
      {!admin && <p className="note note-info" role="status">Only an admin of {org.organisation.name} can give an AI client access.</p>}
      {admin && !org.organisation.private && !org.twoStep && (
        <p className="note note-warn" role="status" data-testid="ai-two-step">
          Giving an AI client access needs a session that passed two-step sign-in. <Link to="/account">Turn it on</Link>, then sign in again with your code.
        </p>
      )}
      {issued && (
        <Card title="Copy this token now" subtitle="It is shown once and can't be seen again. TEBOS keeps only a fingerprint of it.">
          <div className="stack" data-testid="ai-token">
            <code className="mono" style={{ wordBreak: "break-all" }}>{issued.token}</code>
            <p className="muted">
              Put it in the AI client's secret settings as <code>TEBOS_BRIDGE_TOKEN</code>, never in a chat, a document or the code. It works
              until {when(issued.expires)}. If it is ever exposed, revoke it below and issue a new one.
            </p>
            <div><button type="button" className="btn" onClick={() => setIssued(null)}>I've stored it</button></div>
          </div>
        </Card>
      )}
      {admin && !org.organisation.private && org.twoStep && <IssueCard onIssued={(token, expires) => { setIssued({ token, expires }); q.reload(); }} />}
      <ErrorNote error={error} title="The client wasn't revoked" />
      <Card title="Who has access" subtitle="Each client, what it may do, and when it was last used">
        {q.loading && !q.data && <Loading />}
        <ErrorNote error={q.error} title="Couldn't load AI clients" />
        {q.data && q.data.length === 0 && <Empty>No AI client has access.</Empty>}
        {q.data && q.data.length > 0 && (
          <ul className="list" data-testid="ai-clients">
            {q.data.map((c) => {
              const live = !c.revoked_at && new Date(c.expires_at) > new Date();
              return (
                <li key={c.id}>
                  <div className="list-main">
                    <span className="list-title">{c.name} <span className="mono muted">{c.token_hint}…</span></span>
                    <span className="list-meta">
                      {CLIENT_KINDS[c.client_kind]?.split(" (")[0] ?? c.client_kind} · {c.scopes.join(", ")}
                      {c.revoked_at ? ` · revoked ${ago(c.revoked_at)}` : live ? ` · until ${when(c.expires_at)}` : " · expired"}
                      {c.last_used_at ? ` · last used ${ago(c.last_used_at)}` : " · never used"}
                    </span>
                  </div>
                  {admin && live && <button type="button" className="btn btn-sm" onClick={() => revoke(c.id)}><ShieldOff size={14} aria-hidden /> Revoke</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function IssueCard({ onIssued }: { onIssued: (token: string, expires: string) => void }) {
  const org = useOrg();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("coding_agent");
  const [scopes, setScopes] = useState<BridgeScope[]>([...BRIDGE_SCOPES]);
  const [days, setDays] = useState<number>(BRIDGE_LIMITS.defaultDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function issue(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await issueBridgeClient(org.db, org.organisation.id, name.trim(), kind, scopes, days);
      setName("");
      onIssued(r.token, r.expires_at);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Give an AI client access" subtitle={`For ${org.organisation.name} only. At most ${BRIDGE_LIMITS.maxDays} days.`}>
      <form className="stack" onSubmit={issue} aria-label="Give an AI client access">
        <Field label="Name" hint="Which client, on which device, e.g. “coding assistant on the founder's laptop”">
          <input className="input" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kind of client">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(CLIENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">What it may do</legend>
          {BRIDGE_SCOPES.map((s) => (
            <label key={s} className="choice">
              <input type="checkbox" checked={scopes.includes(s)}
                onChange={(e) => setScopes((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} />
              <span>{SCOPE_TEXT[s]}</span>
            </label>
          ))}
        </fieldset>
        <Field label="Days of access">
          <input className="input" type="number" min={1} max={BRIDGE_LIMITS.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
        <ErrorNote error={error} title="No access was given" />
        <div><button type="submit" className="btn btn-primary" disabled={busy || scopes.length === 0}><KeyRound size={15} aria-hidden /> {busy ? "Issuing…" : "Issue a token"}</button></div>
      </form>
    </Card>
  );
}
