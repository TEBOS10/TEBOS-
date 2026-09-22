"use client";

import { useEffect, useState } from "react";
import { DEPARTMENTS, DEPARTMENT_LABELS, type Department } from "@/lib/staff";

interface StaffRow {
  id: string;
  full_name: string;
  email: string;
  department: Department;
  is_admin: boolean;
  created_at: string;
}

interface InviteRow {
  id: string;
  email: string;
  full_name: string | null;
  department: Department;
  is_admin: boolean;
  created_at: string;
}

export default function TeamManager() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState<Department>("sales");
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/staff/team", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.ok) {
      setStaff(json.staff || []);
      setInvites(json.pending_invites || []);
    } else {
      setError(json.error || "Could not load team.");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setInviteLink(null);
    const res = await fetch("/api/staff/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "invite", email, full_name: fullName, department, is_admin: isAdmin }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.error || "Could not send invite.");
      setInviting(false);
      return;
    }
    setInviteLink(`${window.location.origin}/staff/join?token=${json.token}`);
    setEmail("");
    setFullName("");
    setIsAdmin(false);
    setInviting(false);
    load();
  }

  async function onRevoke(inviteEmail: string) {
    await fetch("/api/staff/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke_invite", email: inviteEmail }),
    });
    load();
  }

  return (
    <div className="grid gap-8 md:grid-cols-[320px_1fr]">
      <form
        onSubmit={onInvite}
        className="h-fit rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5"
      >
        <h2 className="text-sm font-semibold">Invite a team member</h2>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Work email"
          className="mt-3 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
        />
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="mt-2 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm"
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value as Department)}
          className="mt-2 w-full rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2 text-sm"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--bame-muted)]">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Grant admin access
        </label>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={inviting}
          className="mt-4 w-full rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
        >
          {inviting ? "Sending…" : "Create invite"}
        </button>
        {inviteLink && (
          <div className="mt-3 rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] p-3 text-xs break-all">
            <p className="text-[var(--bame-muted)]">Share this link with them:</p>
            <p className="mt-1">{inviteLink}</p>
          </div>
        )}
      </form>

      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-semibold">Active staff</h2>
          {loading ? (
            <p className="mt-2 text-sm text-[var(--bame-muted)]">Loading…</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
              {staff.length === 0 && <p className="p-4 text-sm text-[var(--bame-muted)]">No staff yet.</p>}
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p>{s.full_name}</p>
                    <p className="text-xs text-[var(--bame-muted)]">{s.email}</p>
                  </div>
                  <div className="text-right text-xs text-[var(--bame-muted)]">
                    <p>{DEPARTMENT_LABELS[s.department]}</p>
                    {s.is_admin && <p className="text-[var(--bame-accent)]">Admin</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Pending invites</h2>
          <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
            {invites.length === 0 && <p className="p-4 text-sm text-[var(--bame-muted)]">Nothing pending.</p>}
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p>{inv.full_name || inv.email}</p>
                  <p className="text-xs text-[var(--bame-muted)]">
                    {inv.email} &middot; {DEPARTMENT_LABELS[inv.department]}
                  </p>
                </div>
                <button
                  onClick={() => onRevoke(inv.email)}
                  className="text-xs text-[var(--bame-muted)] hover:text-red-400"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
