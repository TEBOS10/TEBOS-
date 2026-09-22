"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setError("Incorrect password.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 max-w-sm rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
      <p className="bame-eyebrow">BAME administration</p>
      <h1 className="mt-2 text-xl">Sign in</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        className="mt-4 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {loading ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
