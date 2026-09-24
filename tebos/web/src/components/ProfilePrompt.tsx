import { UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { saveMyProfile } from "../lib/data";
import { usePeople } from "../lib/people";
import { useOrg } from "../lib/session";
import { ErrorNote } from "./ui";

/** Shown until the signed-in person has a name, so history and approvals say who did what. */
export function ProfilePrompt() {
  const { db, userId } = useOrg();
  const { me, loaded, reload } = usePeople();
  const [name, setName] = useState("");
  const [error, setError] = useState<unknown>(null);
  if (!loaded || me) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await saveMyProfile(db, userId, name);
      reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <form className="note note-info no-print" onSubmit={save} style={{ marginBottom: 18, alignItems: "center" }}>
      <UserRound size={16} aria-hidden />
      <div style={{ flex: 1 }}>
        <strong>Add your name.</strong> Colleagues see it in history and approvals instead of an id.
        <ErrorNote error={error} title="Not saved" />
      </div>
      <input className="input" style={{ maxWidth: 240 }} aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      <button className="btn btn-primary btn-sm" disabled={!name.trim()}>
        Save
      </button>
    </form>
  );
}
