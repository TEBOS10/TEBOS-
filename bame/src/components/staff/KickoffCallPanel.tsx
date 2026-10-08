"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function KickoffCallPanel({
  playerId,
  scheduledAt,
  completedAt,
  notes,
}: {
  playerId: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
}) {
  const router = useRouter();
  const [when, setWhen] = useState(toLocalInputValue(scheduledAt));
  const [noteText, setNoteText] = useState(notes || "");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch(fields: Record<string, unknown>, key: string) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/staff/players", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: playerId, ...fields }),
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
      setSaving(null);
    }
  }

  const status = completedAt ? "completed" : scheduledAt ? "scheduled" : "needs_scheduling";

  return (
    <section className="rounded-2xl border border-[var(--bame-accent)]/50 bg-[var(--bame-panel)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--bame-accent)]">Kickoff call</h2>
        <span className="text-xs text-[var(--bame-muted)]">
          {status === "completed" && `Completed ${new Date(completedAt!).toLocaleString()}`}
          {status === "scheduled" && `Scheduled for ${new Date(scheduledAt!).toLocaleString()}`}
          {status === "needs_scheduling" && "Needs scheduling"}
        </span>
      </div>

      {status !== "completed" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-[var(--bame-muted)]">Date & time</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={() => patch({ kickoff_call_scheduled_at: when ? new Date(when).toISOString() : null }, "schedule")}
            disabled={!when || saving === "schedule"}
            className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
          >
            {saving === "schedule" ? "Saving…" : scheduledAt ? "Reschedule" : "Schedule call"}
          </button>
          {scheduledAt && (
            <button
              onClick={() => patch({ kickoff_call_completed_at: new Date().toISOString() }, "complete")}
              disabled={saving === "complete"}
              className="rounded-full border border-[var(--bame-line)] px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {saving === "complete" ? "Saving…" : "Mark call completed"}
            </button>
          )}
        </div>
      )}

      <label className="mt-4 block">
        <span className="text-xs text-[var(--bame-muted)]">Notes</span>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => patch({ kickoff_call_notes: noteText }, "notes")}
          rows={3}
          placeholder="What was covered, what they need, follow-ups…"
          className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}
