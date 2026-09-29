import { useState, type FormEvent } from "react";
import { ErrorNote, Field } from "../components/ui";
import { createOrganisation, isPlatformAdmin, slugify } from "../lib/data";
import { useSessionState } from "../lib/session";
import { useQuery } from "../lib/useQuery";

/**
 * A signed-in account with no organisation. TEBOS is invite-only: only
 * TEBOS's platform admins create organisations (for a client once their plan
 * starts). Everyone else is told how access works, and sees nothing else.
 */
export function CreateOrganisation() {
  const { db, state } = useSessionState();
  const userId = state.phase === "no_organisation" ? state.session.user.id : "";
  const admin = useQuery(() => isPlatformAdmin(db, userId), [userId]);
  if (admin.loading && admin.data === undefined) return null;
  return admin.data ? <NewOrganisation /> : <NoAccess />;
}

function NoAccess() {
  const { db, state } = useSessionState();
  const email = state.phase === "no_organisation" ? state.session.user.email : "";
  return (
    <div className="auth">
      <div className="auth-card">
        <div>
          <p className="eyebrow">Signed in as {email}</p>
          <h1 className="page-title">Your account isn't linked to an organisation yet</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            TEBOS sets up your organisation when your plan starts. If you're joining a team, open the invitation link your
            admin sent you, while signed in with this address.
          </p>
        </div>
        <div className="row">
          <a className="btn btn-primary" href="/pricing">See the plans</a>
          <button type="button" className="btn" onClick={() => db.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/** For TEBOS's platform admins: create an organisation and become its admin. */
function NewOrganisation() {
  const { db, refresh, state } = useSessionState();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const email = state.phase === "no_organisation" ? state.session.user.email : "";
  // Typed short names keep their dashes while typing; they are tidied on submit.
  const shortName = slug ? slugify(slug) : slugify(name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (!name.trim()) return setProblem("Type your organisation's name first.");
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(shortName)) {
      return setProblem("The short name needs at least 2 characters: lowercase letters, numbers and dashes.");
    }
    setBusy(true);
    setError(null);
    try {
      await createOrganisation(db, name.trim(), shortName);
      await refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div>
          <p className="eyebrow">Signed in as {email}</p>
          <h1 className="page-title">Create your organisation</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Businesses, evidence and actions belong to an organisation, and nobody outside it can see them. You'll be its admin.
          </p>
        </div>
        <Field label="Organisation name">
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setProblem(null); }} placeholder="e.g. Tidy Enterprise" autoComplete="organization" />
        </Field>
        <Field label="Short name" hint="Filled in from the name. Lowercase letters, numbers and dashes.">
          <input
            className="input mono"
            value={slug || slugify(name)}
            onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setProblem(null); }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        {problem && <div className="note note-warn" role="alert">{problem}</div>}
        <ErrorNote error={error} title="Couldn't create the organisation" />
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>
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
