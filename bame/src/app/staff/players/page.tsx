import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseSessionClient } from "@/lib/supabase-server";

export const metadata = { title: "Players — BAME staff" };

const TIER_LABELS: Record<string, string> = {
  foundation: "Foundation",
  growth: "Growth",
  custom: "Custom",
};

interface PlayerRow {
  id: string;
  full_name: string;
  sport: string | null;
  package_tier: string;
  status: string;
  photo_url: string | null;
  bio: string | null;
  highlights: string[] | null;
  portfolio_public: boolean;
}

export default async function StaffPlayersPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/players");

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, sport, package_tier, status, photo_url, bio, highlights, portfolio_public")
    .order("full_name");

  const tiers = ["foundation", "growth", "custom"] as const;
  const byTier = tiers.map((tier) => ({
    tier,
    players: ((players || []) as PlayerRow[]).filter((p) => p.package_tier === tier),
  }));

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="bame-eyebrow">Players</p>
        <h1 className="mt-2 text-2xl">Client roster</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          Every onboarded player and event client, organised by package so the roster stays ordered as it grows.
          Use this as the review library in meetings — open a card for the full profile, highlights and public
          portfolio link.
        </p>

        <div className="mt-8 space-y-10">
          {byTier.map(({ tier, players: tierPlayers }) => (
            <section key={tier}>
              <h2 className="text-sm font-semibold text-[var(--bame-accent)]">
                {TIER_LABELS[tier]} ({tierPlayers.length})
              </h2>
              {tierPlayers.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--bame-muted)]">No {TIER_LABELS[tier].toLowerCase()} players yet.</p>
              ) : (
                <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tierPlayers.map((p) => (
                    <Link
                      key={p.id}
                      href={`/staff/players/${p.id}`}
                      className="floaty rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--bame-bg)]">
                          {p.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg text-[var(--bame-muted)]">
                              {p.full_name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {p.full_name}
                            {p.portfolio_public && (
                              <span className="rounded-full bg-[var(--bame-accent)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--bame-accent)]">
                                Portfolio live
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--bame-muted)]">
                            {p.sport || "—"} · <span className="capitalize">{p.status}</span>
                          </p>
                          {p.highlights && p.highlights.length > 0 && (
                            <p className="mt-1 text-xs text-[var(--bame-muted)]">
                              {p.highlights.length} highlight{p.highlights.length > 1 ? "s" : ""} on file
                            </p>
                          )}
                        </div>
                      </div>
                      {p.bio && <p className="mt-3 line-clamp-2 text-xs text-[var(--bame-muted)]">{p.bio}</p>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
