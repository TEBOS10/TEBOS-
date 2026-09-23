"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DeliverableItem {
  id: string;
  title: string;
  phase: "setup" | "monthly" | "process";
  done: boolean;
}

const PHASE_LABELS: Record<DeliverableItem["phase"], string> = {
  setup: "Setup (once)",
  monthly: "Every month",
  process: "Process",
};

export default function DeliverableChecklist({
  caseTable,
  caseId,
  items,
}: {
  caseTable: "leads" | "diagnostics";
  caseId: string;
  items: DeliverableItem[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(item: DeliverableItem) {
    setPending(item.id);
    await fetch("/api/staff/deliverables", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ case_table: caseTable, case_id: caseId, deliverable_id: item.id, done: !item.done }),
    });
    setPending(null);
    router.refresh();
  }

  const phases: DeliverableItem["phase"][] = ["setup", "monthly", "process"];
  const done = items.filter((i) => i.done).length;

  return (
    <div>
      <p className="text-xs text-[var(--bame-muted)]">
        {done} of {items.length} complete
      </p>
      <div className="mt-3 space-y-5">
        {phases.map((phase) => {
          const phaseItems = items.filter((i) => i.phase === phase);
          if (phaseItems.length === 0) return null;
          return (
            <div key={phase}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bame-muted)]">
                {PHASE_LABELS[phase]}
              </p>
              <ul className="mt-2 space-y-2">
                {phaseItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={pending === item.id}
                      onChange={() => toggle(item)}
                      className="mt-0.5"
                    />
                    <span className={item.done ? "text-[var(--bame-muted)] line-through" : ""}>{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
