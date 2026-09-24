import { MailCheck } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "../components/ui";
import { acceptInvitation } from "../lib/data";
import { navigate } from "../lib/router";
import { useSessionState } from "../lib/session";
import { SignIn } from "./SignIn";

/**
 * /invite/:token — works whether or not the visitor is signed in. Signed-out
 * visitors sign in or create an account first; the link (and its token)
 * stays in the address bar, including through email confirmation.
 */
export function AcceptInvite({ token }: { token: string }) {
  const { state, db, switchOrganisation } = useSessionState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [expired, setExpired] = useState(false);

  if (state.phase === "signed_out") {
    return <SignIn notice="You've been invited to TEBOS. Sign in, or create an account, with the email address the invitation was sent to." />;
  }
  const email = state.phase === "ready" || state.phase === "no_organisation" ? state.session.user.email : null;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const orgId = await acceptInvitation(db, token);
      if (!orgId) {
        setExpired(true);
        setBusy(false);
        return;
      }
      switchOrganisation(orgId);
      navigate("/");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="row">
          <span className="brand-mark" aria-hidden>
            <MailCheck size={18} />
          </span>
          <h1 className="page-title" style={{ fontSize: 22 }}>
            Join an organisation on TEBOS
          </h1>
        </div>
        <p className="muted">
          You're signed in as <strong>{email}</strong>. The invitation only works for the address it was sent to.
        </p>
        {expired && <div className="note note-warn">This invitation has expired. Ask the person who invited you for a new link.</div>}
        <ErrorNote error={error} title="Couldn't join" />
        <div className="row">
          <button className="btn btn-primary" onClick={accept} disabled={busy || expired}>
            {busy ? "Joining…" : "Accept invitation"}
          </button>
          <button className="btn" onClick={() => db.auth.signOut()}>
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
