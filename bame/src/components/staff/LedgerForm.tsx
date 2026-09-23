"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/staff";

const ENTRY_TYPES = ["income", "expense", "payout"];

export default function LedgerForm() {
  const router = useRouter();
  const [entryType, setEntryType] = useState("income");
  const [amount, setAmount] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/staff/ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entry_type: entryType, amount, department: department || null, description }),
    });
    setAmount("");
    setDescription("");
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5 text-sm md:grid-cols-5">
      <select
        value={entryType}
        onChange={(e) => setEntryType(e.target.value)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
      >
        {ENTRY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (R)"
        required
        type="number"
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />
      <select
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
      >
        <option value="">No department</option>
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        required
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 md:col-span-1"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-[var(--bame-accent)] px-4 py-2 font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {saving ? "Adding…" : "Add entry"}
      </button>
    </form>
  );
}
