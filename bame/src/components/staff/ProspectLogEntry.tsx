"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OUTREACH_OUTCOMES, OUTREACH_OUTCOME_LABELS, PROSPECT_CHANNEL_LABELS, type ProspectChannel } from "@/lib/staff";

// Quick "I contacted this one" action against an existing prospect row on
// the call sheet — logs an outreach_log entry, which in turn moves the
// prospect's status and next follow-up date forward automatically.
export default function ProspectLogEntry({ prospectId, defaultChannel }: { prospectId: string; defaultChannel: ProspectChannel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<(typeof OUTREACH_OUTCOMES)[number]>("connected");
  const [summary, setSummary] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_id: prospectId,
          log_channel: defaultChannel,
          outcome,
          summary: summary || null,
          follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't log that. Please try again.");
        return;
      }
      setOpen(false);
      setSummary("");
      setFollowUpAt("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--bame-line)] px-3 py-1 text-xs text-[var(--bame-muted)] hover:text-[var(--bame-accent)]"
      >
        Log {PROSPECT_CHANNEL_LABELS[defaultChannel].toLowerCase()}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as typeof outcome)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1"
      >
        {OUTREACH_OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {OUTREACH_OUTCOME_LABELS[o]}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={followUpAt}
        onChange={(e) => setFollowUpAt(e.target.value)}
        title="Next follow-up"
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-2 py-1"
      />
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Note"
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-2 py-1"
      />
      <button type="submit" disabled={saving} className="rounded-full bg-[var(--bame-accent)] px-3 py-1 font-semibold text-[#1a1608] disabled:opacity-60">
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[var(--bame-muted)]">
        Cancel
      </button>
      {error && <p className="w-full text-red-400">{error}</p>}
    </form>
  );
}
