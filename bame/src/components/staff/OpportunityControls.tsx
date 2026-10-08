"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_LABELS,
  type Department,
  type OpportunityStatus,
} from "@/lib/staff";

export default function OpportunityControls({
  id,
  status,
  outcome,
  assignedDepartment,
  canEdit,
  isAdmin,
}: {
  id: string;
  status: OpportunityStatus;
  outcome: "won" | "lost" | null;
  assignedDepartment: Department | null;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(fields: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/opportunities", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "That change didn't save. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="w-full text-xs text-red-400">{error}</span>}
      {isAdmin && (
        <select
          value={assignedDepartment || ""}
          onChange={(e) => patch({ assigned_department: e.target.value || null })}
          disabled={saving}
          className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1 text-xs"
        >
          <option value="">Unassigned</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
      )}

      {canEdit ? (
        <select
          value={status}
          onChange={(e) => patch({ status: e.target.value })}
          disabled={saving}
          className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1 text-xs"
        >
          {OPPORTUNITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OPPORTUNITY_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ) : (
        <span className="rounded-lg px-2 py-1 text-xs text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]">
          {OPPORTUNITY_STATUS_LABELS[status]}
        </span>
      )}

      {status === "closed" && canEdit && (
        <select
          value={outcome || ""}
          onChange={(e) => patch({ outcome: e.target.value || null })}
          disabled={saving}
          className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1 text-xs"
        >
          <option value="">Outcome?</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      )}
      {status === "closed" && !canEdit && outcome && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            outcome === "won" ? "bg-[var(--bame-accent)]/20 text-[var(--bame-accent)]" : "text-[var(--bame-muted)]"
          }`}
        >
          {outcome === "won" ? "Won" : "Lost"}
        </span>
      )}
    </div>
  );
}
