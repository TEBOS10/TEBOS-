"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "@/lib/staff";

interface Allocation {
  package_tier: "foundation" | "growth";
  department: Department;
  monthly_amount: number | null;
}

const TIERS: Array<"foundation" | "growth"> = ["foundation", "growth"];
const ALLOCATABLE_DEPARTMENTS = DEPARTMENTS.filter((d) => d !== "admin");

export default function AllocationEditor({ allocations }: { allocations: Allocation[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const a of allocations) {
      initial[`${a.package_tier}:${a.department}`] = a.monthly_amount === null ? "" : String(a.monthly_amount);
    }
    return initial;
  });
  const [saving, setSaving] = useState<string | null>(null);

  async function save(tier: string, department: string) {
    const key = `${tier}:${department}`;
    setSaving(key);
    await fetch("/api/staff/allocations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package_tier: tier, department, monthly_amount: values[key] }),
    });
    setSaving(null);
    router.refresh();
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--bame-muted)]">
            <th className="pb-2">Department</th>
            {TIERS.map((t) => (
              <th key={t} className="pb-2 capitalize">
                {t}/mo
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALLOCATABLE_DEPARTMENTS.map((dept) => (
            <tr key={dept} className="border-t border-[var(--bame-line)]">
              <td className="py-2 pr-4">{DEPARTMENT_LABELS[dept]}</td>
              {TIERS.map((tier) => {
                const key = `${tier}:${dept}`;
                return (
                  <td key={key} className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--bame-muted)]">R</span>
                      <input
                        value={values[key] ?? ""}
                        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                        onBlur={() => save(tier, dept)}
                        placeholder="TBD"
                        className="w-24 rounded-lg border border-[var(--bame-line)] bg-transparent px-2 py-1"
                      />
                      {saving === key && <span className="text-xs text-[var(--bame-muted)]">saving…</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
