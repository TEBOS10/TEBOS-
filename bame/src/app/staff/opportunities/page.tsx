import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_CATEGORY_LABELS,
  formatZAR,
  type Opportunity,
  type StaffProfile,
} from "@/lib/staff";
import OpportunityControls from "@/components/staff/OpportunityControls";

export const metadata = { title: "Opportunities — BAME staff" };

type OpportunityRow = Opportunity & { players: { full_name: string } | null };

export default async function StaffOpportunitiesPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/opportunities");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;
  if (!profile) {
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-5xl text-sm text-[var(--bame-muted)]">Your account isn&apos;t fully set up yet. Contact an admin.</div>
      </main>
    );
  }

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*, players(full_name)")
    .order("created_at", { ascending: false });

  const rows = (opportunities || []) as OpportunityRow[];
  const unassigned = rows.filter((o) => !o.assigned_department);
  const byStatus = OPPORTUNITY_STATUSES.map((status) => ({
    status,
    rows: rows.filter((o) => o.status === status),
  }));

  const totalValue = rows
    .filter((o) => o.status !== "closed" || o.outcome === "won")
    .reduce((sum, o) => sum + (o.value_estimate || 0), 0);

  function Row({ o }: { o: OpportunityRow }) {
    const canEdit = profile!.is_admin || o.assigned_department === profile!.department;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bame-line)] p-4 text-sm first:border-t-0">
        <div className="min-w-0">
          <Link href={`/staff/players/${o.player_id}`} className="font-medium hover:underline">
            {o.players?.full_name || "Unknown player"}
          </Link>
          <p className="text-xs text-[var(--bame-muted)]">
            {o.title} · {OPPORTUNITY_CATEGORY_LABELS[o.category]}
            {o.value_estimate ? ` · ${formatZAR(o.value_estimate)}` : ""}
            {o.contact_org ? ` · ${o.contact_org}` : ""}
          </p>
        </div>
        <OpportunityControls
          id={o.id}
          status={o.status}
          outcome={o.outcome}
          assignedDepartment={o.assigned_department}
          canEdit={canEdit}
          isAdmin={profile!.is_admin}
        />
      </div>
    );
  }

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-5xl space-y-10">
        <div>
          <p className="bame-eyebrow">Commercial opportunity pipeline</p>
          <h1 className="mt-2 text-2xl">Opportunities</h1>
          <p className="mt-2 text-sm text-[var(--bame-muted)]">
            Every sponsorship, partnership, media and business opportunity logged for a BAME client, tracked from
            first contact to close. Open weighted pipeline value (open opportunities plus anything already won):{" "}
            <span className="text-[var(--bame-accent)]">{formatZAR(totalValue)}</span>.
          </p>
        </div>

        {profile.is_admin && unassigned.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--bame-accent)]">
              Unassigned &mdash; needs routing ({unassigned.length})
            </h2>
            <div className="mt-3 rounded-2xl border border-[var(--bame-line)]">
              {unassigned.map((o) => (
                <Row key={o.id} o={o} />
              ))}
            </div>
          </section>
        )}

        {byStatus.map(({ status, rows: statusRows }) => (
          <section key={status}>
            <h2 className="text-sm font-semibold">
              {OPPORTUNITY_STATUS_LABELS[status]} ({statusRows.length})
            </h2>
            {statusRows.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--bame-muted)]">Nothing here yet.</p>
            ) : (
              <div className="mt-3 rounded-2xl border border-[var(--bame-line)]">
                {statusRows.map((o) => (
                  <Row key={o.id} o={o} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
