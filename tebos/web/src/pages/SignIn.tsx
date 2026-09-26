import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { useSessionState } from "../lib/session";

export function SignIn({ notice: intro }: { notice?: string } = {}) {
  const { db } = useSessionState();
  const [mode, setMode] = useState<"sign_in" | "sign_up" | "reset">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "reset") {
      const res = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (res.error) return setError(res.error);
      // Same answer whether or not the address has an account.
      return setNotice("If that address has a TEBOS account, a reset link is on its way. Open it on this device.");
    }
    const res =
      mode === "sign_in"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (mode === "sign_up" && !res.data.session) {
      setNotice("Check your email to confirm your address, then sign in. You don't need to press the button again.");
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="row">
          <span className="brand-mark" aria-hidden>
            <ShieldCheck size={18} />
          </span>
          <div>
            <h1 className="page-title" style={{ fontSize: 22 }}>
              TEBOS
            </h1>
            <p className="muted">Understand the business. Know what matters. Execute what is next.</p>
          </div>
        </div>
        {intro && <div className="note note-info">{intro}</div>}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode !== "sign_up"} className={`tab ${mode !== "sign_up" ? "active" : ""}`} onClick={() => { setMode("sign_in"); setNotice(null); }}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "sign_up"} className={`tab ${mode === "sign_up" ? "active" : ""}`} onClick={() => { setMode("sign_up"); setNotice(null); }}>
            Create account
          </button>
        </div>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== "reset" && (
        <Field label="Password" hint={mode === "sign_up" ? "At least 8 characters." : undefined}>
          <input
            className="input"
            type="password"
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            minLength={mode === "sign_up" ? 8 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        )}
        {mode === "sign_in" && (
          <button type="button" className="link-button" onClick={() => { setMode("reset"); setError(null); setNotice(null); }}>
            Forgot password?
          </button>
        )}
        {mode === "reset" && <p className="muted">Enter your email and TEBOS will send you a link to choose a new password.</p>}
        <ErrorNote error={error} title={mode === "sign_in" ? "Couldn't sign in" : mode === "reset" ? "Couldn't send the link" : "Couldn't create the account"} />
        {notice && <div className="note note-info">{notice}</div>}
        <button className="btn btn-primary" disabled={busy || (mode !== "sign_in" && !!notice)}>
          {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : mode === "reset" ? "Send reset link" : "Create account"}
        </button>
        {mode === "reset" && (
          <button type="button" className="link-button" onClick={() => { setMode("sign_in"); setNotice(null); setError(null); }}>
            Back to sign in
          </button>
        )}
        <p className="muted" style={{ textAlign: "center", fontSize: 14 }}>
          New to TEBOS? <a href="/tour">Watch the tour</a> or <a href="/demo">try the demo</a>. No account needed.
        </p>
      </form>
    </div>
  );
}
