"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "@/lib/staff";

export default function CaseAssign({ table, id }: { table: "leads" | "diagnostics"; id: string }) {
  const router = useRouter();
  const [department, setDepartment] = useState<Department>("sales");
  const [assigning, setAssigning] = useState(false);

  async function onAssign() {
    setAssigning(true);
    await fetch("/api/staff/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ table, id, department }),
    });
    router.refresh();
  }

  return (
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
        disabled={assigning}
        className="rounded-full bg-[var(--bame-accent)] px-3 py-1 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {assigning ? "Routing…" : "Route"}
      </button>
    </div>
  );
}
