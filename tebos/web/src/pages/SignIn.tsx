import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { useSessionState } from "../lib/session";

export function SignIn() {
  const { db } = useSessionState();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
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
    const res =
      mode === "sign_in"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (mode === "sign_up" && !res.data.session) {
      setNotice("Check your email to confirm your address, then sign in.");
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
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "sign_in"} className={`tab ${mode === "sign_in" ? "active" : ""}`} onClick={() => setMode("sign_in")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "sign_up"} className={`tab ${mode === "sign_up" ? "active" : ""}`} onClick={() => setMode("sign_up")}>
            Create account
          </button>
        </div>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
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
        <ErrorNote error={error} title={mode === "sign_in" ? "Couldn't sign in" : "Couldn't create the account"} />
        {notice && <div className="note note-info">{notice}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
