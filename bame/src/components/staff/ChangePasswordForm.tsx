"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setMessage({ ok: false, text: "Passwords don't match." });
      return;
    }

    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMessage({ ok: false, text: error.message });
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage({ ok: true, text: "Password updated." });
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        required
        minLength={8}
        className="w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        required
        minLength={8}
        className="w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />
      {message && (
        <p className={message.ok ? "text-[var(--bame-accent)]" : "text-red-400"}>{message.text}</p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-[var(--bame-accent)] px-4 py-2 font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {saving ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
