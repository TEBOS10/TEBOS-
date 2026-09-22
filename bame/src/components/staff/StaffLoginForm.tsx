"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function StaffLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-24 max-w-sm rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6"
    >
      <p className="bame-eyebrow">BAME staff</p>
      <h1 className="mt-2 text-xl">Sign in</h1>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Work email"
        autoComplete="username"
        className="mt-4 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="mt-3 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-4 text-xs text-[var(--bame-muted)]">
        New here? Use the invite link sent to your work email.
      </p>
    </form>
  );
}
