import { connectionLabel, type ConnectionInstance } from "@core/capabilities";
import { parseFromAddress } from "@core/email";
import type { ConnectionStatus } from "@core/states";
import { KeyRound, Mail, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Card, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import {
  createConnection,
  listConnections,
  requestVerification,
  setConnectionEnabled,
  setConnectionSecret,
  updateConnectionSettings,
  webhookUrl,
  type Connection,
} from "../lib/data";
import { ago } from "../lib/format";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const asInstance = (c: Connection): ConnectionInstance => ({
  id: c.id,
  connectorKey: c.connector_key,
  businessId: c.business_id,
  status: c.status as ConnectionStatus,
  grantedScopes: c.granted_scopes,
  lastVerifiedAt: c.last_verified_at,
});

const settingsOf = (c: Connection) => (c.settings ?? {}) as Record<string, string>;

/**
 * Connections to outside systems. People configure them and hand over
 * credentials; only TEBOS's worker, after calling the provider, can say a
 * connection works. Secrets go straight to the vault and are never shown again.
 */
export function ConnectionsPage() {
  const org = useOrg();
  const isAdmin = org.can("connection.manage");
  const q = useQuery(() => listConnections(org.db, org.organisation.id), [org.organisation.id]);
  const resend = q.data?.connections.filter((c) => c.connector_key === "resend") ?? [];

  return (
    <div className="stack">
      <PageHeader eyebrow="Controls" title="Connections">
        Outside systems TEBOS can act through. A connection shows as connected only after TEBOS has checked it with the provider, and actions through it
        still need approval.
      </PageHeader>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load connections" />
      {q.data && (
        <div className="grid grid-2">
          <div className="stack">
            {resend.map((c) => (
              <ResendCard key={c.id} connection={c} isAdmin={isAdmin} onChange={q.reload} />
            ))}
            {resend.length === 0 && (isAdmin ? <NewResend onCreated={q.reload} /> : <Card title="Email (Resend)"><Empty>Not set up. An organisation admin can connect it.</Empty></Card>)}
          </div>
          <Card title="How this works">
            <ol className="steps">
              <li>An admin adds the sender address and a Resend API key. The key goes to the vault; nobody can read it back, including admins.</li>
              <li>TEBOS's worker checks the key with Resend. Only then does the connection show as connected.</li>
              <li>An email action is approved for its exact recipients and text. Changing them needs a new approval.</li>
              <li>The worker sends it once. The action is verified only when Resend confirms delivery.</li>
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}

function NewResend({ onCreated }: { onCreated: () => void }) {
  const org = useOrg();
  const [from, setFrom] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const parsed = parseFromAddress(from);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    setBusy(true);
    setError(null);
    try {
      const c = await createConnection(org.db, org.organisation.id, "resend", { from: parsed.value.header });
      await setConnectionSecret(org.db, c.id, "api_key", apiKey.trim());
      setApiKey("");
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={<span className="row" style={{ gap: 8 }}><Mail size={16} aria-hidden /> Email (Resend)</span>} subtitle="Send transactional email from your own domain">
      <form className="form" onSubmit={submit} aria-label="Connect Resend">
        <Field label="Sender" hint={from && !parsed.ok ? parsed.problems[0] : "The domain must be verified in your Resend account."}>
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Clay Studio <orders@claystudio.co.za>" required />
        </Field>
        <Field label="Resend API key" hint="Stored in the vault. A send-only key works; a full-access key also lets TEBOS check delivery itself.">
          <input className="input mono" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_…" required />
        </Field>
        <ErrorNote error={error} title="Not connected" />
        <button className="btn btn-primary" disabled={busy || !parsed.ok || apiKey.trim().length < 8}>
          {busy ? "Saving…" : "Save and check with Resend"}
        </button>
      </form>
    </Card>
  );
}

function ResendCard({ connection: c, isAdmin, onChange }: { connection: Connection; isAdmin: boolean; onChange: () => void }) {
  const org = useOrg();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [from, setFrom] = useState(settingsOf(c).from ?? "");
  const [apiKey, setApiKey] = useState("");
  const [signing, setSigning] = useState("");
  const parsed = parseFromAddress(from);
  const label = connectionLabel(asInstance(c));
  const awaitingCheck = !!c.verification_requested_at && (!c.last_verified_at || c.verification_requested_at > c.last_verified_at) &&
    (!c.last_failure_at || c.verification_requested_at > c.last_failure_at);
  const hook = webhookUrl(c.id);
  const canPoll = c.granted_scopes.includes("emails:read");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setApiKey("");
      setSigning("");
      onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={<span className="row" style={{ gap: 8 }}><Mail size={16} aria-hidden /> Email (Resend)</span>}
      subtitle={settingsOf(c).from}
      actions={<StatusBadge status={c.status} />}
    >
      <p className="list-title" data-testid="connection-label">{label}</p>
      <dl className="confidence-parts" style={{ marginTop: 8 }}>
        <div><dt>Last checked</dt><dd>{c.last_verified_at ? ago(c.last_verified_at) : "never"}</dd></div>
        <div><dt>Delivery confirmation</dt><dd>{c.status !== "connected" ? "not available yet" : canPoll ? "TEBOS asks Resend, and webhooks if set" : "webhooks only (send-only key)"}</dd></div>
        <div><dt>Webhook signing secret</dt><dd>{c.webhook_credential_ref_id ? "set" : "not set"}</dd></div>
        {c.failure_detail && <div><dt>Last problem</dt><dd>{c.failure_detail}</dd></div>}
      </dl>
      {awaitingCheck && <div className="note note-info" style={{ marginTop: 10 }}>Waiting for TEBOS's worker to check this with Resend.</div>}
      <ErrorNote error={error} title="That wasn't saved" />

      {isAdmin && (
        <div className="stack" style={{ marginTop: 14, gap: 12 }}>
          <div className="row">
            <button className="btn btn-sm" disabled={busy || c.status === "disabled"} onClick={() => act(() => requestVerification(org.db, c.id))}>
              <RefreshCw size={14} aria-hidden /> Check now
            </button>
            {c.status === "disabled" ? (
              <button className="btn btn-sm" disabled={busy} onClick={() => act(() => setConnectionEnabled(org.db, c.id, true))}>Enable</button>
            ) : (
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act(() => setConnectionEnabled(org.db, c.id, false))}>Disable</button>
            )}
          </div>
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (parsed.ok) void act(() => updateConnectionSettings(org.db, c.id, { ...settingsOf(c), from: parsed.value.header })); }}>
            <Field label="Sender" hint={from && !parsed.ok ? parsed.problems[0] : undefined}>
              <div className="row">
                <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                <button className="btn btn-sm" disabled={busy || !parsed.ok || parsed.value.header === settingsOf(c).from}>Save</button>
              </div>
            </Field>
          </form>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void act(() => setConnectionSecret(org.db, c.id, "api_key", apiKey.trim())); }}>
            <Field label="Replace API key" hint="The old key is deleted from the vault. The connection is checked again before it's used.">
              <div className="row">
                <input className="input mono" type="password" autoComplete="off" aria-label="New Resend API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_…" />
                <button className="btn btn-sm" disabled={busy || apiKey.trim().length < 8}><KeyRound size={14} aria-hidden /> Replace</button>
              </div>
            </Field>
          </form>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void act(() => setConnectionSecret(org.db, c.id, "webhook_signing_secret", signing.trim())); }}>
            <Field
              label="Delivery webhook"
              hint={hook ? <>In Resend, add a webhook to <span className="mono">{hook}</span> for email events, then paste its signing secret here.</> : "The worker's public address isn't configured for this interface yet, so the webhook URL can't be shown."}
            >
              <div className="row">
                <input className="input mono" type="password" autoComplete="off" aria-label="Webhook signing secret" value={signing} onChange={(e) => setSigning(e.target.value)} placeholder="whsec_…" />
                <button className="btn btn-sm" disabled={busy || signing.trim().length < 8}>Save secret</button>
              </div>
            </Field>
          </form>
        </div>
      )}
    </Card>
  );
}
