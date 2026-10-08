"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotificationItem({
  id,
  message,
  createdAt,
  read,
}: {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
}) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState(false);

  async function markRead() {
    setDismissing(true);
    setError(false);
    try {
      const res = await fetch("/api/staff/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div className={`flex items-center justify-between p-4 text-sm ${read ? "opacity-50" : ""}`}>
      <div>
        <p>{message}</p>
        <p className="text-xs text-[var(--bame-muted)]">{new Date(createdAt).toLocaleString()}</p>
      </div>
      {!read && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={markRead}
            disabled={dismissing}
            className="text-xs text-[var(--bame-muted)] hover:text-[var(--bame-accent)]"
          >
            Mark read
          </button>
          {error && <span className="text-xs text-red-400">Couldn&apos;t update — try again</span>}
        </div>
      )}
    </div>
  );
}
