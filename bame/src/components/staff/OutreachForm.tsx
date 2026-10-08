"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROSPECT_CONTACT_TYPES,
  PROSPECT_CONTACT_TYPE_LABELS,
  PROSPECT_CHANNELS,
  PROSPECT_CHANNEL_LABELS,
  OUTREACH_OUTCOMES,
  OUTREACH_OUTCOME_LABELS,
} from "@/lib/staff";

// Logs an outreach attempt or a referral. Any staff member can add a brand
// new prospect here (not just Sales) — that's what keeps the call sheet
// fed from everyone's conversations, not a single person's list.
export default function OutreachForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [contactType, setContactType] = useState<(typeof PROSPECT_CONTACT_TYPES)[number]>("other");
  const [channel, setChannel] = useState<(typeof PROSPECT_CHANNELS)[number]>("other");
  const [handle, setHandle] = useState("");
  const [isReferral, setIsReferral] = useState(false);
  const [outcome, setOutcome] = useState<(typeof OUTREACH_OUTCOMES)[number]>("other");
  const [summary, setSummary] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          contact_type: contactType,
          channel,
          handle_or_contact: handle || null,
          source: isReferral ? "referral" : "outreach",
          log_channel: channel,
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
      setFullName("");
      setHandle("");
      setSummary("");
      setFollowUpAt("");
      setOutcome("other");
      setOpen(false);
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
        className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-sm font-semibold text-[#1a1608]"
      >
        + Log outreach or referral
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5 text-sm md:grid-cols-3"
    >
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Name / organisation"
        required
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 md:col-span-2"
      />
      <label className="flex items-center gap-2 text-xs text-[var(--bame-muted)]">
        <input type="checkbox" checked={isReferral} onChange={(e) => setIsReferral(e.target.checked)} />
        This is a referral
      </label>

      <select
        value={contactType}
        onChange={(e) => setContactType(e.target.value as typeof contactType)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
      >
        {PROSPECT_CONTACT_TYPES.map((t) => (
          <option key={t} value={t}>
            {PROSPECT_CONTACT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value as typeof channel)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
      >
        {PROSPECT_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {PROSPECT_CHANNEL_LABELS[c]}
          </option>
        ))}
      </select>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="Handle / number / email"
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />

      <select
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as typeof outcome)}
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
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
        title="Next follow-up date"
        className="rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
      />
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="What happened"
        className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
      />

      <div className="flex gap-2 md:col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--bame-accent)] px-4 py-2 font-semibold text-[#1a1608] disabled:opacity-60"
        >
          {saving ? "Logging…" : "Log it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--bame-line)] px-4 py-2 text-[var(--bame-muted)]"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400 md:col-span-3">{error}</p>}
    </form>
  );
}
