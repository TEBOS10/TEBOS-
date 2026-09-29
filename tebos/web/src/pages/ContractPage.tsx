// The client's side of the pipeline. No account is needed: the one-time link
// in their email is the key. They read the exact agreement on record and
// accept it by typing their name; the database records who, when and from
// where, against a fingerprint of the text they saw.
import { ShieldCheck } from "lucide-react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { ErrorNote, Field } from "../components/ui";
import { acceptContract, contractForToken } from "../lib/data";
import { when } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useQuery } from "../lib/useQuery";

/** A small, safe renderer for the agreement text: headings, lists, bold and paragraphs. No HTML is ever injected. */
export function AgreementText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="agreement">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (b.startsWith("# ")) return <h2 key={i}>{inline(b.slice(2))}</h2>;
        if (b.startsWith("## ")) return <h3 key={i}>{inline(b.slice(3))}</h3>;
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="brand-mark" aria-hidden><ShieldCheck size={18} /></span> TEBOS</a>
      </header>
      <main className="contract-wrap">{children}</main>
    </div>
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ContractPage({ token }: { token: string }) {
  const q = useQuery(() => (supabase ? contractForToken(supabase, token) : Promise.resolve(null)), [token]);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  if (q.loading && !q.data) return <PublicFrame><p className="muted">Loading your agreement…</p></PublicFrame>;
  const c = q.data;
  if (q.error || !c) {
    return (
      <PublicFrame>
        <div className="contract-card">
          <h1>This link isn't valid</h1>
          <p>It may have been mistyped, or the agreement was replaced. Reply to the email it came in and TEBOS will send a new one.</p>
        </div>
      </PublicFrame>
    );
  }
  const accepted = acceptedAt ?? (c.status === "accepted" ? c.accepted_at : null);
  const expired = !accepted && new Date(c.expires_at).getTime() < Date.now();

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !c) return;
    setBusy(true);
    setError(null);
    try {
      // the fingerprint of the text shown here: the database accepts only the exact agreement on record
      const at = await acceptContract(supabase, token, name.trim(), await sha256Hex(c.body));
      setAcceptedAt(String(at));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicFrame>
      <div className="contract-card">
        <p className="lp-kicker">Agreement for {c.business}</p>
        <AgreementText text={c.body} />
        {accepted ? (
          <div className="note note-info" role="status" data-testid="accepted">
            Accepted{c.accepted_name || name ? ` by ${c.accepted_name ?? name.trim()}` : ""} on {when(accepted)}. Thank you. TEBOS is setting up your account; the
            invitation arrives by email shortly.
          </div>
        ) : expired ? (
          <div className="note note-warn">This link expired on {when(c.expires_at)}. Reply to the email it came in and TEBOS will send a new one.</div>
        ) : (
          <form className="form contract-accept" onSubmit={accept} aria-label="Accept the agreement">
            <Field label="Your full name">
              <input className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I have read this agreement and accept it on behalf of {c.business}, and I'm authorised to do so.</span>
            </label>
            <p className="muted" style={{ fontSize: 13 }}>
              Your name, the time, and your network address and browser are recorded with this exact text as proof of acceptance.
            </p>
            <ErrorNote error={error} title="Not accepted" />
            <button className="btn btn-primary" disabled={busy || !agreed || name.trim().length < 2}>{busy ? "Accepting…" : "Accept the agreement"}</button>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}

/** Where Paystack sends the client back. It doesn't claim success: Paystack's signed confirmation does. */
export function PaidPage() {
  return (
    <PublicFrame>
      <div className="contract-card">
        <h1>Thank you</h1>
        <p>
          If your payment went through, Paystack emails you a receipt, and TEBOS emails your agreement to read and accept within a
          few minutes, once Paystack has confirmed the payment to us.
        </p>
        <p className="muted">Nothing arrived after 15 minutes? Reply to the email with your payment link and we'll check.</p>
      </div>
    </PublicFrame>
  );
}
