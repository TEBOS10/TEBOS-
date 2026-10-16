import { KeyRound } from "lucide-react";
import { useState } from "react";
import { SetPassword } from "../components/SetPassword";
import { navigate } from "../lib/router";
import { useSessionState } from "../lib/session";

/**
 * Reached from the emailed reset link, which signs the person in for this purpose: at /reset-password, or wherever
 * the link lands (the session marks it as a recovery). Nothing else opens until a new password is chosen.
 */
export function ResetPassword() {
  const { endRecovery } = useSessionState();
  const [done, setDone] = useState(false);
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="row">
          <span className="brand-mark" aria-hidden>
            <KeyRound size={18} />
          </span>
          <h1 className="page-title" style={{ fontSize: 22 }}>
            Choose a new password
          </h1>
        </div>
        <SetPassword submitLabel="Save new password" onDone={() => setDone(true)} />
        {done && (
          <button className="btn" onClick={() => { endRecovery(); navigate("/"); }}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
