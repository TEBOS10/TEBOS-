"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardPlayerButton({
  caseTable,
  caseId,
  fullName,
  email,
  sport,
  packageTier,
}: {
  caseTable: "leads" | "diagnostics";
  caseId: string;
  fullName: string;
  email: string | null;
  sport: string | null;
  packageTier: "foundation" | "growth" | "custom";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/players", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          sport,
          package_tier: packageTier,
          source_case_table: caseTable,
          source_case_id: caseId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't onboard this player. Please try again.");
        return;
      }
      router.push(`/staff/players/${json.id}`);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={onboard}
        disabled={loading}
        className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {loading ? "Onboarding…" : "Onboard as player"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
