import { useState, type FormEvent } from "react";
import { useSessionState } from "../lib/session";
import { ErrorNote, Field } from "./ui";

export const MIN_PASSWORD = 8;

/** Sets a new password for the signed-in person (also used after a reset link). */
export function SetPassword({ onDone, submitLabel = "Change password" }: { onDone?: () => void; submitLabel?: string }) {
  const { db } = useSessionState();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD || password !== confirm) return;
    setBusy(true);
    setError(null);
    const res = await db.auth.updateUser({ password });
    setBusy(false);
    if (res.error) return setError(res.error);
    setPassword("");
    setConfirm("");
    setDone(true);
    onDone?.();
  }

  return (
    <form className="form" onSubmit={submit} aria-label="Set a new password">
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. Save it in a password manager.`}>
        <input className="input" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required value={password} onChange={(e) => { setPassword(e.target.value); setDone(false); }} />
      </Field>
      <Field label="Repeat new password" hint={mismatch ? "The two passwords don't match." : undefined}>
        <input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <ErrorNote error={error} title="Password not changed" />
      {done && <div className="note note-info">Password changed. Use the new one next time you sign in.</div>}
      <button className="btn btn-primary" disabled={busy || password.length < MIN_PASSWORD || password !== confirm}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
