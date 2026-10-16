"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ContractPanel({
  contractId,
  status,
  athleteEmail,
  sentAt,
}: {
  contractId: string;
  status: "draft" | "sent";
  athleteEmail: string | null;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/contracts/${contractId}/download`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't open the PDF.");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDownloading(false);
    }
  }

  async function send() {
    if (!confirm(`Send this contract to ${athleteEmail}? This emails a signed-ready PDF with BAME's banking details.`)) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/contracts/${contractId}/send`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't send the contract.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--bame-accent)]/50 bg-[var(--bame-panel)] p-5 text-sm">
      <h2 className="text-sm font-semibold text-[var(--bame-accent)]">Athlete agreement</h2>
      <p className="mt-1 text-xs text-[var(--bame-muted)]">
        {status === "sent"
          ? `Sent to ${athleteEmail} on ${sentAt ? new Date(sentAt).toLocaleString() : ""}.`
          : "Generated and ready — review the PDF before sending."}
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          onClick={download}
          disabled={downloading}
          className="rounded-full border border-[var(--bame-line)] px-4 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {downloading ? "Opening…" : "Review PDF"}
        </button>
        {status === "draft" && (
          <button
            onClick={send}
            disabled={sending}
            className="rounded-full bg-[var(--bame-accent)] px-4 py-2 text-xs font-semibold text-[#1a1608] disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send to client"}
          </button>
        )}
      </div>
    </div>
  );
}
