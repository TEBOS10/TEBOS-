import Image from "next/image";
import Link from "next/link";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import { getSupabaseServerClient } from "@/lib/supabase";

export const metadata = { title: "Athletes — BAME" };

interface PublicPlayer {
  id: string;
  full_name: string;
  sport: string | null;
  photo_url: string | null;
  bio: string | null;
}

const SPORT_FILTERS = ["Football", "Tennis", "Athletics", "Combat"];

// Staff enter a player's sport as free text, so matching it to one of the
// four homepage categories can't rely on an exact string match — this maps
// each category to the real-world spellings/synonyms it should catch.
const SPORT_SYNONYMS: Record<string, string[]> = {
  Football: ["football", "soccer"],
  Tennis: ["tennis"],
  Athletics: ["athletics", "track", "track and field", "running", "athletic"],
  Combat: ["combat", "boxing", "mma", "wrestling", "judo", "karate", "kickboxing", "taekwondo"],
};

export default async function AthleteLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sportParam = sp.sport;
  const rawSport = Array.isArray(sportParam) ? sportParam[0] : sportParam;
  // Ignore anything that isn't one of the known filters rather than show a
  // confusing empty state for a typo'd or stale URL.
  const sport = SPORT_FILTERS.includes(rawSport || "") ? rawSport : undefined;

  const supabase = getSupabaseServerClient();
  // Only ever select public-safe columns — RLS also scopes this to
  // portfolio_public = true rows, see the players table policy. Filtering by
  // sport happens below, not in the query, since it needs synonym matching.
  const { data: players } = await supabase.from("players").select("id, full_name, sport, photo_url, bio").order("full_name");
  const allAthletes = (players || []) as PublicPlayer[];
  const athletes = sport
    ? allAthletes.filter((a) => {
        const s = a.sport?.toLowerCase() || "";
        return SPORT_SYNONYMS[sport].some((syn) => s.includes(syn));
      })
    : allAthletes;

  return (
    <>
      <Header />
      <main className="flex-1 px-5 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="bame-eyebrow">BAME represents</p>
          <h1 className="mt-2 text-3xl md:text-4xl">Athlete library</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--bame-muted)]">
            Published athlete portfolios, open to browse. An athlete controls whether their profile appears here —
            open one to see their full story, highlights and how to get in touch.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/athletes"
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                !sport ? "bg-[var(--bame-accent)] text-[#1a1608]" : "text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
              }`}
            >
              All sports
            </Link>
            {SPORT_FILTERS.map((s) => (
              <Link
                key={s}
                href={`/athletes?sport=${encodeURIComponent(s)}`}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  sport === s ? "bg-[var(--bame-accent)] text-[#1a1608]" : "text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
                }`}
              >
                {s}
              </Link>
            ))}
          </div>

          {athletes.length === 0 ? (
            <div className="mt-12 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-8 text-center text-sm text-[var(--bame-muted)]">
              {sport
                ? `No published ${sport} portfolios yet — check back soon.`
                : "No published athlete portfolios yet — check back soon."}
            </div>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {athletes.map((a) => (
                <Link
                  key={a.id}
                  href={`/athletes/${a.id}`}
                  className="floaty rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-5"
                >
                  <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-[var(--bame-bg)]">
                    {a.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo_url} alt={a.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg text-[var(--bame-muted)]">
                        {a.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-center text-sm font-medium">{a.full_name}</p>
                  {a.sport && <p className="text-center text-xs text-[var(--bame-muted)]">{a.sport}</p>}
                  {a.bio && <p className="mt-2 line-clamp-2 text-center text-xs text-[var(--bame-muted)]">{a.bio}</p>}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-14 flex items-center gap-2 text-xs text-[var(--bame-muted)]">
            <Image src="/logo-mark.png" alt="BAME" width={18} height={18} className="rounded" />
            Every athlete above is represented by BAME Sports Management.
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
