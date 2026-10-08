import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import PlayerProfileForm from "@/components/staff/PlayerProfileForm";
import OpportunityForm from "@/components/staff/OpportunityForm";
import OpportunityControls from "@/components/staff/OpportunityControls";
import { OPPORTUNITY_CATEGORY_LABELS, formatZAR, type Opportunity, type StaffProfile } from "@/lib/staff";

export const metadata = { title: "Player profile — BAME staff" };

export default async function StaffPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/staff/login?next=/staff/players/${id}`);

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as StaffProfile | null;

  const [{ data: player }, { data: opportunities }] = await Promise.all([
    supabase.from("players").select("*").eq("id", id).maybeSingle(),
    supabase.from("opportunities").select("*").eq("player_id", id).order("created_at", { ascending: false }),
  ]);
  if (!player) notFound();
  const oppRows = (opportunities || []) as Opportunity[];

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/staff/players" className="text-xs text-[var(--bame-muted)] hover:underline">
          ← All players
        </Link>
        <p className="bame-eyebrow mt-4">Player profile</p>
        <h1 className="mt-2 text-2xl">{player.full_name}</h1>
        <div className="mt-8">
          <PlayerProfileForm player={player} />
        </div>
        {(player.source_case_table && player.source_case_id) && (
          <Link
            href={`/staff/case/${player.source_case_table}/${player.source_case_id}`}
            className="mt-4 inline-block text-xs text-[var(--bame-muted)] hover:underline"
          >
            View originating case →
          </Link>
        )}

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Commercial opportunities</h2>
            <OpportunityForm playerId={id} />
          </div>
          <div className="mt-3 divide-y divide-[var(--bame-line)] rounded-2xl border border-[var(--bame-line)]">
            {oppRows.length === 0 && (
              <p className="p-4 text-sm text-[var(--bame-muted)]">No opportunities logged for {player.full_name} yet.</p>
            )}
            {oppRows.map((o) => {
              const canEdit = !!profile && (profile.is_admin || o.assigned_department === profile.department);
              return (
                <div key={o.id} className="space-y-2 p-4 text-sm">
                  <p className="font-medium">{o.title}</p>
                  <p className="text-xs text-[var(--bame-muted)]">
                    {OPPORTUNITY_CATEGORY_LABELS[o.category]}
                    {o.value_estimate ? ` · ${formatZAR(o.value_estimate)}` : ""}
                    {o.contact_org ? ` · ${o.contact_org}` : ""}
                  </p>
                  <OpportunityControls
                    id={o.id}
                    status={o.status}
                    outcome={o.outcome}
                    assignedDepartment={o.assigned_department}
                    canEdit={canEdit}
                    isAdmin={!!profile?.is_admin}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
