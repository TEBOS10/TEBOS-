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

  async function markRead() {
    setDismissing(true);
    await fetch("/api/staff/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className={`flex items-center justify-between p-4 text-sm ${read ? "opacity-50" : ""}`}>
      <div>
        <p>{message}</p>
        <p className="text-xs text-[var(--bame-muted)]">{new Date(createdAt).toLocaleString()}</p>
      </div>
      {!read && (
        <button
          onClick={markRead}
          disabled={dismissing}
          className="text-xs text-[var(--bame-muted)] hover:text-[var(--bame-accent)]"
        >
          Mark read
        </button>
      )}
    </div>
  );
}
