import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import TeamManager from "@/components/staff/TeamManager";

export const metadata = { title: "Team — BAME staff" };

export default async function StaffTeamPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/team");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl text-sm text-[var(--bame-muted)]">
          Only administrators can manage the team.
        </div>
      </main>
    );
  }

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="bame-eyebrow">Team</p>
        <h1 className="mt-2 text-2xl">Staff accounts</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          Invite new hires, assign them to a department, and see who&apos;s pending.
        </p>
        <div className="mt-8">
          <TeamManager />
        </div>
      </div>
    </main>
  );
}
