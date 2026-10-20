import { redirect } from "next/navigation";
import { getSupabaseSessionClient } from "@/lib/supabase-server";
import MediaLibrary, { type MediaAsset } from "@/components/staff/MediaLibrary";

export const metadata = { title: "Media library — BAME staff" };

export default async function StaffMediaPage() {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff/login?next=/staff/media");

  const [{ data: assets }, { data: players }, { data: profile }] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id, storage_path, title, section, player_id, uploaded_by, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("players").select("id, full_name").order("full_name"),
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <main className="px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="bame-eyebrow">Media library</p>
        <h1 className="mt-2 text-2xl">Images for the website</h1>
        <p className="mt-2 text-sm text-[var(--bame-muted)]">
          Keep the team&rsquo;s photos here, so the site always uses the right ones. Set a player&rsquo;s photo
          straight from an image; for other sections, name the image in a change request to TEBOS.
        </p>
        <p className="mt-2 text-xs text-[var(--bame-muted)]">
          Anyone with an image&rsquo;s link can view it, so upload only images meant for the website, never contracts
          or private documents.
        </p>
        <div className="mt-8">
          <MediaLibrary
            assets={(assets || []) as MediaAsset[]}
            players={(players || []) as { id: string; full_name: string }[]}
            userId={user.id}
            isAdmin={Boolean(profile?.is_admin)}
          />
        </div>
      </div>
    </main>
  );
}
