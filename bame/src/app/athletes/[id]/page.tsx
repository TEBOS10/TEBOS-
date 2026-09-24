import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase";

interface PublicPlayer {
  id: string;
  full_name: string;
  sport: string | null;
  photo_url: string | null;
  bio: string | null;
  highlights: string[] | null;
  achievements: string[] | null;
}

export default async function AthletePortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  // Only ever select public-safe columns here — never email, status,
  // package_tier or source_case_* — even though the RLS policy behind this
  // (portfolio_public = true) already scopes which rows anon can see.
  const { data: player } = await supabase
    .from("players")
    .select("id, full_name, sport, photo_url, bio, highlights, achievements")
    .eq("id", id)
    .maybeSingle();

  if (!player) notFound();
  const p = player as PublicPlayer;

  return (
    <main className="flex-1 bg-[var(--bame-bg)] px-5 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 text-xs text-[var(--bame-muted)]">
          <Image src="/logo-mark.png" alt="BAME" width={20} height={20} className="rounded" />
          Represented by BAME Sports Management
        </div>

        <div className="mt-8 flex items-center gap-5">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--bame-panel)]">
            {p.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--bame-muted)]">
                {p.full_name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl">{p.full_name}</h1>
            {p.sport && <p className="mt-1 text-sm text-[var(--bame-muted)]">{p.sport}</p>}
          </div>
        </div>

        {p.bio && <p className="mt-8 text-sm leading-relaxed text-[var(--bame-muted)]">{p.bio}</p>}

        {p.highlights && p.highlights.length > 0 && (
          <section className="mt-8">
            <p className="bame-eyebrow">Highlights</p>
            <ul className="mt-3 space-y-2 text-sm">
              {p.highlights.map((h, i) => (
                <li key={i}>— {h}</li>
              ))}
            </ul>
          </section>
        )}

        {p.achievements && p.achievements.length > 0 && (
          <section className="mt-8">
            <p className="bame-eyebrow">Achievements</p>
            <ul className="mt-3 space-y-2 text-sm">
              {p.achievements.map((a, i) => (
                <li key={i}>— {a}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 text-center">
          <p className="text-sm text-[var(--bame-muted)]">Interested in working with {p.full_name.split(" ")[0]}?</p>
          <Link
            href="/intake?contact_type=athlete&lead_source=Portfolio"
            className="mt-4 inline-block rounded-full bg-[var(--bame-accent)] px-6 py-3 text-sm font-semibold text-[#1a1608]"
          >
            Get in touch with BAME
          </Link>
        </div>
      </div>
    </main>
  );
}
