"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function StaffJoinForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/staff/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error || "Could not set up your account.");
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: json.email,
      password,
    });
    if (signInError) {
      router.push("/staff/login");
      return;
    }
    router.push("/staff");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-24 max-w-sm rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6"
    >
      <p className="bame-eyebrow">BAME staff</p>
      <h1 className="mt-2 text-xl">Set your password</h1>
      <p className="mt-2 text-sm text-[var(--bame-muted)]">
        Choose a password to finish setting up your account.
      </p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="mt-4 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        autoComplete="new-password"
        className="mt-3 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {loading ? "Setting up…" : "Create account"}
      </button>
    </form>
  );
}
