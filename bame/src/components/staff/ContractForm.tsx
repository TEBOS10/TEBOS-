"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIER_DEFAULT_FEE: Record<string, number | ""> = { foundation: 6500, growth: 10000, custom: "" };

export default function ContractForm({
  caseTable,
  caseId,
  defaultFullName,
  defaultEmail,
  defaultPackageTier,
}: {
  caseTable: "leads" | "diagnostics";
  caseId: string;
  defaultFullName: string;
  defaultEmail: string | null;
  defaultPackageTier: "foundation" | "growth" | "custom" | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = defaultPackageTier || "foundation";
  const [form, setForm] = useState({
    athlete_id_passport: "",
    athlete_dob: "",
    athlete_address: "",
    athlete_email: defaultEmail || "",
    athlete_phone: "",
    current_club: "",
    package_tier: tier,
    monthly_fee: TIER_DEFAULT_FEE[tier],
    initial_term_months: 3,
    commencement_date: new Date().toISOString().slice(0, 10),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-xs font-semibold text-[#1a1608]"
      >
        Mark interview successful →
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_case_table: caseTable,
          source_case_id: caseId,
          athlete_full_name: defaultFullName,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't generate the contract. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[var(--bame-accent)]/50 bg-[var(--bame-panel)] p-5 text-sm">
      <p className="text-xs text-[var(--bame-muted)]">
        This generates the Athlete Personal Branding &amp; Marketing Services Agreement — BAME&apos;s banking details and the
        standard terms are filled in automatically. You&apos;ll get one more chance to review the PDF before it&apos;s sent.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Package</span>
          <select
            value={form.package_tier}
            onChange={(e) => {
              const t = e.target.value as "foundation" | "growth" | "custom";
              setForm({ ...form, package_tier: t, monthly_fee: TIER_DEFAULT_FEE[t] });
            }}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
          >
            <option value="foundation">Foundation</option>
            <option value="growth">Growth</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Monthly fee (ZAR)</span>
          <input
            type="number"
            required
            value={form.monthly_fee}
            onChange={(e) => setForm({ ...form, monthly_fee: e.target.value === "" ? "" : Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Initial term (months)</span>
          <input
            type="number"
            min={1}
            required
            value={form.initial_term_months}
            onChange={(e) => setForm({ ...form, initial_term_months: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Commencement date</span>
          <input
            type="date"
            required
            value={form.commencement_date}
            onChange={(e) => setForm({ ...form, commencement_date: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Athlete ID / passport no.</span>
          <input
            value={form.athlete_id_passport}
            onChange={(e) => setForm({ ...form, athlete_id_passport: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Date of birth</span>
          <input
            type="date"
            value={form.athlete_dob}
            onChange={(e) => setForm({ ...form, athlete_dob: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Email (where the contract will be sent)</span>
          <input
            type="email"
            required
            value={form.athlete_email}
            onChange={(e) => setForm({ ...form, athlete_email: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Phone</span>
          <input
            value={form.athlete_phone}
            onChange={(e) => setForm({ ...form, athlete_phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs text-[var(--bame-muted)]">Address</span>
          <input
            value={form.athlete_address}
            onChange={(e) => setForm({ ...form, athlete_address: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs text-[var(--bame-muted)]">Current club</span>
          <input
            value={form.current_club}
            onChange={(e) => setForm({ ...form, current_club: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate contract"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bame-muted)] hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
