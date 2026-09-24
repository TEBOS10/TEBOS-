import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { createOrganisation, slugify } from "../lib/data";
import { useSessionState } from "../lib/session";

/** First run: the signed-in user creates their organisation and becomes its admin. */
export function CreateOrganisation() {
  const { db, refresh, state } = useSessionState();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const email = state.phase === "no_organisation" ? state.session.user.email : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createOrganisation(db, name.trim(), slug || slugify(name));
      await refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div>
          <p className="eyebrow">Signed in as {email}</p>
          <h1 className="page-title">Create your organisation</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Businesses, evidence and actions belong to an organisation, and nobody outside it can see them. You'll be its admin.
          </p>
        </div>
        <Field label="Organisation name">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tidy Enterprise" />
        </Field>
        <Field label="Short name" hint="Lowercase letters, numbers and dashes.">
          <input className="input mono" value={slug || slugify(name)} onChange={(e) => setSlug(slugify(e.target.value))} pattern="[a-z0-9][a-z0-9-]{1,62}" required />
        </Field>
        <ErrorNote error={error} title="Couldn't create the organisation" />
        <div className="row">
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create organisation"}
          </button>
          <button type="button" className="btn" onClick={() => db.auth.signOut()}>
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
