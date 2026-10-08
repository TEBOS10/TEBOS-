"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "@/lib/staff";

export default function CaseAssign({
  table,
  id,
  currentDepartment,
}: {
  table: "leads" | "diagnostics";
  id: string;
  currentDepartment?: Department | null;
}) {
  const router = useRouter();
  const [department, setDepartment] = useState<Department>(currentDepartment || "sales");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAssign() {
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table, id, department }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't route this case. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value as Department)}
          className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1 text-xs"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <button
          onClick={onAssign}
          disabled={assigning || department === currentDepartment}
          className="rounded-full bg-[var(--bame-accent)] px-3 py-1 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
        >
          {assigning ? "Routing…" : currentDepartment ? "Reassign" : "Route"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
