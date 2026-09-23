import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import PlayerProfileForm from "@/components/staff/PlayerProfileForm";

export const metadata = { title: "Player profile — BAME staff" };

export default async function StaffPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/staff/login?next=/staff/players/${id}`);

  const { data: player } = await supabase.from("players").select("*").eq("id", id).maybeSingle();
  if (!player) notFound();

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
      </div>
    </main>
  );
}
