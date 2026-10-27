// Two-step sign-in: a code from an authenticator app (TOTP), on top of the password. Supabase holds the
// factor and raises the session to aal2 when a code is verified; the database then opens the private
// organisation's records (migration two_step_resilience). The secret is shown once, here, to scan or type into
// the person's own app; TEBOS never stores it.
import { useEffect, useState, type FormEvent } from "react";
import { useSessionState } from "../lib/session";
import { ErrorNote, Field } from "./ui";

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at: string;
}

const CODE = /^\d{6}$/;

function useFactors() {
  const { db } = useSessionState();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function reload() {
    const { data, error: e } = await db.auth.mfa.listFactors();
    if (e) return setError(e);
    setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp") as Factor[]);
  }
  useEffect(() => {
    void reload();
  }, []);
  return { factors, error, reload };
}

function CodeInput({ value, onChange, label = "6-digit code" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label} hint="From your authenticator app. It changes every 30 seconds.">
      <input className="input mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} />
    </Field>
  );
}

/** Shown after a password sign-in when the account has two-step sign-in. Nothing else loads until it passes. */
export function TwoStepChallenge() {
  const { db } = useSessionState();
  const { factors, error: loadError } = useFactors();
  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const chosen = factorId || verified[0]?.id || "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!CODE.test(code) || !chosen) return;
    setBusy(true);
    setError(null);
    const { error: err } = await db.auth.mfa.challengeAndVerify({ factorId: chosen, code });
    setBusy(false);
    // on success the session is replaced with a two-step one and the app opens by itself
    if (err) {
      setError(err);
      setCode("");
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} aria-label="Two-step sign-in">
        <h1 className="page-title">Enter your code</h1>
        <p className="muted">Your account uses two-step sign-in. Open your authenticator app and enter the code for TEBOS.</p>
        <ErrorNote error={loadError} title="Couldn't load your authenticators" />
        {verified.length > 1 && (
          <Field label="Authenticator">
            <select className="input" value={chosen} onChange={(e) => setFactorId(e.target.value)}>
              {verified.map((f) => <option key={f.id} value={f.id}>{f.friendly_name || "Authenticator"}</option>)}
            </select>
          </Field>
        )}
        <CodeInput value={code} onChange={setCode} />
        <ErrorNote error={error} title="That code didn't work" />
        <button className="btn btn-primary" disabled={busy || !CODE.test(code) || !chosen}>{busy ? "Checking…" : "Continue"}</button>
        <p className="field-hint">Lost your phone? Use your backup authenticator if you set one up. Otherwise an authenticator can only be removed by the
          owner of the Supabase project (Authentication → Users), after which you sign in with your password and set it up again.</p>
        <button type="button" className="btn" onClick={() => void db.auth.signOut()}>Sign out</button>
      </form>
    </div>
  );
}

/** The Account page card: turn two-step sign-in on, add a backup authenticator, or remove one. */
// issuer: the name the authenticator app shows for this entry ("TEPOS" in the founder's app). It is one sign-in either way.
export function TwoStepSettings({ active, issuer = "TEBOS" }: { active: boolean; issuer?: string }) {
  const { db, refresh } = useSessionState();
  const { factors, error: loadError, reload } = useFactors();
  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      // an earlier attempt that was never confirmed is cleared first
      for (const f of (factors ?? []).filter((x) => x.status !== "verified")) {
        const { error: e } = await db.auth.mfa.unenroll({ factorId: f.id });
        if (e) throw e;
      }
      const friendlyName = name.trim() || (verified.length === 0 ? "Phone" : `Backup ${verified.length}`);
      const { data, error: e } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName, issuer });
      if (e) throw e;
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!enrolling || !CODE.test(code)) return;
    setBusy(true);
    setError(null);
    const { error: err } = await db.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code });
    setBusy(false);
    if (err) return setError(err);
    setEnrolling(null);
    setCode("");
    setName("");
    setDone(verified.length === 0 ? "Two-step sign-in is on. Next time you sign in, TEBOS will ask for a code." : "Backup authenticator added.");
    await reload();
    await refresh();
  }

  async function remove(f: Factor) {
    const last = verified.length === 1;
    if (!window.confirm(last ? "Turn two-step sign-in off? Your private organisation's records will be closed until you turn it on again." : `Remove ${f.friendly_name || "this authenticator"}?`)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const { error: e } = await db.auth.mfa.unenroll({ factorId: f.id });
    setBusy(false);
    if (e) return setError(e);
    await reload();
    await db.auth.refreshSession();
    await refresh();
  }

  return (
    <div className="stack" data-testid="two-step">
      <p className="muted">
        {verified.length === 0
          ? "Off. Turn it on to protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and similar). Your private organisation's records need it."
          : `On, with ${verified.length} authenticator${verified.length === 1 ? "" : "s"}.${active ? "" : " Sign out and back in with a code to open your private records."}`}
      </p>
      <ErrorNote error={loadError} title="Couldn't load your authenticators" />
      {verified.length > 0 && (
        <ul className="list">
          {verified.map((f) => (
            <li key={f.id}>
              <span>{f.friendly_name || "Authenticator"}</span>
              <button className="btn btn-sm" disabled={busy} onClick={() => void remove(f)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {verified.length === 1 && <div className="note note-info">Add a backup authenticator on a second device, so losing your phone doesn't lock you out.</div>}
      {!enrolling && (
        <div className="stack">
          <Field label="Name for this authenticator" hint="So you can tell them apart, e.g. Phone or Tablet.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={verified.length === 0 ? "Phone" : "Backup"} />
          </Field>
          <button className="btn btn-primary" disabled={busy || factors === null} onClick={() => void start()}>
            {verified.length === 0 ? "Turn on two-step sign-in" : "Add a backup authenticator"}
          </button>
        </div>
      )}
      {enrolling && (
        <form className="stack" onSubmit={confirm} aria-label="Confirm authenticator">
          <p>Scan this with your authenticator app, or type the key into it. Then enter the code it shows.</p>
          <img src={enrolling.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
          <div className="field-hint">Key: <span className="mono" data-testid="totp-secret">{enrolling.secret}</span></div>
          <CodeInput value={code} onChange={setCode} />
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !CODE.test(code)}>Confirm</button>
            <button type="button" className="btn" onClick={() => { setEnrolling(null); setCode(""); }}>Cancel</button>
          </div>
        </form>
      )}
      <ErrorNote error={error} title="Two-step sign-in wasn't changed" />
      {done && <div className="note note-info">{done}</div>}
    </div>
  );
}
