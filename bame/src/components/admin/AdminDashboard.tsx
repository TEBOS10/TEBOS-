"use client";

import { useEffect, useState } from "react";

type Row = Record<string, unknown> & { id: string; created_at: string; status: string };

const LEAD_STATUSES = ["new", "contacted", "diagnostic_sent", "diagnostic_received", "qualified", "onboarded", "declined"];
const DIAGNOSTIC_STATUSES = ["received", "reviewed", "scoped", "proposal_sent", "won", "lost"];
const DEPARTMENTS = ["", "sales", "production", "pr", "finance", "tech", "admin"];

function useRows(table: "leads" | "diagnostics") {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/data?table=${table}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load.");
      setRows(json.data || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, loading, error, reload: load };
}

async function patch(table: string, id: string, fields: Record<string, unknown>) {
  await fetch("/api/admin/update", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ table, id, fields }),
  });
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-[var(--bame-line)] bg-transparent px-2 py-1 text-xs"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
    </select>
  );
}

function LeadsTable() {
  const { rows, loading, error, reload } = useRows("leads");
  if (loading) return <p className="text-sm text-[var(--bame-muted)]">Loading leads…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!rows.length) return <p className="text-sm text-[var(--bame-muted)]">No leads yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs text-[var(--bame-muted)]">
          <tr>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Contact</th>
            <th className="py-2 pr-4">Sport</th>
            <th className="py-2 pr-4">Focus</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Department</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--bame-line)]">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-4 text-xs">{new Date(r.created_at).toLocaleString()}</td>
              <td className="py-2 pr-4">{String(r.contact_type)}</td>
              <td className="py-2 pr-4">{String(r.full_name)}</td>
              <td className="py-2 pr-4 text-xs">{String(r.email)}<br />{String(r.phone || "")}</td>
              <td className="py-2 pr-4">{String(r.sport || "")}</td>
              <td className="py-2 pr-4">{String(r.primary_focus || "")}</td>
              <td className="py-2 pr-4">
                <Select
                  value={String(r.status)}
                  options={LEAD_STATUSES}
                  onChange={async (v) => {
                    await patch("leads", r.id, { status: v });
                    reload();
                  }}
                />
              </td>
              <td className="py-2 pr-4">
                <Select
                  value={String(r.assigned_department || "")}
                  options={DEPARTMENTS}
                  onChange={async (v) => {
                    await patch("leads", r.id, { assigned_department: v || null });
                    reload();
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosticsTable() {
  const { rows, loading, error, reload } = useRows("diagnostics");
  const [openId, setOpenId] = useState<string | null>(null);
  if (loading) return <p className="text-sm text-[var(--bame-muted)]">Loading diagnostics…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!rows.length) return <p className="text-sm text-[var(--bame-muted)]">No diagnostics yet.</p>;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border border-[var(--bame-line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{String(r.athlete_full_name || "Unnamed")}</p>
              <p className="text-xs text-[var(--bame-muted)]">
                {String(r.contact_type)} · {String(r.primary_sport || "")} · {String(r.package_interest || "")} ·{" "}
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(r.status)}
                options={DIAGNOSTIC_STATUSES}
                onChange={async (v) => {
                  await patch("diagnostics", r.id, { status: v });
                  reload();
                }}
              />
              <Select
                value={String(r.assigned_department || "")}
                options={DEPARTMENTS}
                onChange={async (v) => {
                  await patch("diagnostics", r.id, { assigned_department: v || null });
                  reload();
                }}
              />
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : String(r.id))}
                className="rounded-full px-3 py-1 text-xs ring-1 ring-[var(--bame-line)]"
              >
                {openId === r.id ? "Hide" : "View"}
              </button>
            </div>
          </div>
          {openId === r.id && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-black/30 p-3 text-xs whitespace-pre-wrap">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<"leads" | "diagnostics">("leads");
  return (
    <div>
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab("leads")}
          className={`rounded-full px-4 py-2 text-sm ${tab === "leads" ? "bg-[var(--bame-accent)] text-[#1a1608]" : "ring-1 ring-[var(--bame-line)]"}`}
        >
          Leads
        </button>
        <button
          onClick={() => setTab("diagnostics")}
          className={`rounded-full px-4 py-2 text-sm ${tab === "diagnostics" ? "bg-[var(--bame-accent)] text-[#1a1608]" : "ring-1 ring-[var(--bame-line)]"}`}
        >
          Diagnostics
        </button>
      </div>
      {tab === "leads" ? <LeadsTable /> : <DiagnosticsTable />}
    </div>
  );
}
