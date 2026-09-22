import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import NotificationItem from "@/components/staff/NotificationItem";
import CaseAssign from "@/components/staff/CaseAssign";
import { DEPARTMENT_LABELS, type Department, type StaffProfile } from "@/lib/staff";

export const metadata = { title: "Dashboard — BAME staff" };

interface CaseRow {
  table: "leads" | "diagnostics";
  id: string;
  name: string;
  email: string;
  sport: string | null;
  status: string;
  assigned_department: Department | null;
  created_at: string;
}

export default async function StaffDashboardPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;

  if (!profile) {
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl text-sm text-[var(--bame-muted)]">
          Your account isn&apos;t fully set up yet. Contact an admin.
        </div>
      </main>
    );
  }

  const [{ data: notifications }, { data: leads }, { data: diagnostics }, unassigned] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, message, read, created_at")
      .order("read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("leads")
      .select("id, full_name, email, sport, status, assigned_department, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("diagnostics")
      .select("id, athlete_full_name, athlete_email, primary_sport, status, assigned_department, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    profile.is_admin
      ? Promise.all([
          supabase
            .from("leads")
            .select("id, full_name, email, sport, status, assigned_department, created_at")
            .is("assigned_department", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("diagnostics")
            .select("id, athlete_full_name, athlete_email, primary_sport, status, assigned_department, created_at")
            .is("assigned_department", null)
            .order("created_at", { ascending: false }),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }] as const),
  ]);

  const cases: CaseRow[] = [
    ...(leads || []).map((l) => ({
      table: "leads" as const,
      id: l.id,
      name: l.full_name,
      email: l.email,
      sport: l.sport,
      status: l.status,
      assigned_department: l.assigned_department as Department | null,
      created_at: l.created_at,
    })),
    ...(diagnostics || []).map((d) => ({
      table: "diagnostics" as const,
      id: d.id,
      name: d.athlete_full_name || "—",
      email: d.athlete_email || "—",
      sport: d.primary_sport,
      status: d.status,
      assigned_department: d.assigned_department as Department | null,
      created_at: d.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const [{ data: unassignedLeads }, { data: unassignedDiagnostics }] = unassigned;
  const unassignedCases: CaseRow[] = [
    ...(unassignedLeads || []).map((l) => ({
      table: "leads" as const,
      id: l.id,
      name: l.full_name,
      email: l.email,
      sport: l.sport,
      status: l.status,
      assigned_department: null,
      created_at: l.created_at,
    })),
    ...(unassignedDiagnostics || []).map((d) => ({
      table: "diagnostics" as const,
      id: d.id,
      name: d.athlete_full_name || "—",
      email: d.athlete_email || "—",
      sport: d.primary_sport,
      status: d.status,
      assigned_department: null,
      created_at: d.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <p className="bame-eyebrow">Dashboard</p>
          <h1 className="mt-2 text-2xl">
            {profile.is_admin ? "Every case" : `${DEPARTMENT_LABELS[profile.department]} queue`}
          </h1>
        </div>

        {profile.is_admin && unassignedCases.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--bame-accent)]">
              Unassigned &mdash; needs routing ({unassignedCases.length})
            </h2>
            <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
              {unassignedCases.map((c) => (
                <div key={`${c.table}-${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p>
                      {c.name} <span className="text-xs text-[var(--bame-muted)]">({c.table === "leads" ? "enquiry" : "diagnostic"})</span>
                    </p>
                    <p className="text-xs text-[var(--bame-muted)]">
                      {c.email} {c.sport ? `· ${c.sport}` : ""}
                    </p>
                  </div>
                  <CaseAssign table={c.table} id={c.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold">Notifications</h2>
          <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
            {(!notifications || notifications.length === 0) && (
              <p className="p-4 text-sm text-[var(--bame-muted)]">Nothing routed to you yet.</p>
            )}
            {notifications?.map((n) => (
              <NotificationItem key={n.id} id={n.id} message={n.message} createdAt={n.created_at} read={n.read} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Cases</h2>
          <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
            {cases.length === 0 && <p className="p-4 text-sm text-[var(--bame-muted)]">No cases assigned yet.</p>}
            {cases.map((c) => (
              <div key={`${c.table}-${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p>
                    {c.name} <span className="text-xs text-[var(--bame-muted)]">({c.table === "leads" ? "enquiry" : "diagnostic"})</span>
                  </p>
                  <p className="text-xs text-[var(--bame-muted)]">
                    {c.email} {c.sport ? `· ${c.sport}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--bame-muted)]">
                  <p className="capitalize">{c.status}</p>
                  {c.assigned_department && <p>{DEPARTMENT_LABELS[c.assigned_department]}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
