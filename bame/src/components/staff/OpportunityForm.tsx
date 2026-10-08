"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_CATEGORY_LABELS } from "@/lib/staff";

export default function OpportunityForm({ playerId }: { playerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "other",
    value_estimate: "",
    contact_name: "",
    contact_org: "",
    source: "",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch("/api/staff/opportunities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player_id: playerId, ...form }),
    });
    setSaving(false);
    setOpen(false);
    setForm({ title: "", category: "other", value_estimate: "", contact_name: "", contact_org: "", source: "", notes: "" });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-[var(--bame-line)] hover:bg-[var(--bame-bg)]"
      >
        + Log opportunity
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5 text-sm">
      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="Opportunity — e.g. Nike regional sponsorship enquiry"
        required
        className="w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />
      <div className="grid gap-3 md:grid-cols-2">
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
        >
          {OPPORTUNITY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {OPPORTUNITY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          value={form.value_estimate}
          onChange={(e) => setForm({ ...form, value_estimate: e.target.value })}
          placeholder="Estimated value (R, optional)"
          type="number"
          className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
        />
        <input
          value={form.contact_name}
          onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          placeholder="Contact name (optional)"
          className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
        />
        <input
          value={form.contact_org}
          onChange={(e) => setForm({ ...form, contact_org: e.target.value })}
          placeholder="Contact organisation (optional)"
          className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
        />
        <input
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          placeholder="Source — e.g. inbound, referral, outreach (optional)"
          className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 md:col-span-2"
        />
      </div>
      <textarea
        value={form.notes}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
        >
          {saving ? "Logging…" : "Log opportunity"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-4 py-2 text-xs text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
