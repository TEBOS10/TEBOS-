import { KeyRound } from "lucide-react";
import { useState } from "react";
import { SetPassword } from "../components/SetPassword";
import { navigate } from "../lib/router";

/** /reset-password: reached from the emailed reset link, which signs the person in for this purpose. */
export function ResetPassword() {
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
          <button className="btn" onClick={() => navigate("/")}>
            Continue to TEBOS
          </button>
        )}
      </div>
    </div>
  );
}
