"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export interface MediaAsset {
  id: string;
  storage_path: string;
  title: string;
  section: string;
  player_id: string | null;
  uploaded_by: string;
  created_at: string;
}

const BUCKET = "site-media";
const SECTIONS: Record<string, string> = {
  player: "Player",
  gallery: "Gallery",
  event: "Event",
  partner: "Partner",
  hero: "Home page banner",
  other: "Other",
};
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 10 * 1024 * 1024;

// Turns a file name into the safe form the database accepts.
function safeName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "image").slice(-80);
}

export default function MediaLibrary({
  assets,
  players,
  userId,
  isAdmin,
}: {
  assets: MediaAsset[];
  players: { id: string; full_name: string }[];
  userId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("gallery");
  const [playerId, setPlayerId] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("all");

  const url = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const playerName = (id: string | null) => players.find((p) => p.id === id)?.full_name;

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!file) return setMessage({ ok: false, text: "Choose an image first." });
    if (!TYPES.includes(file.type)) return setMessage({ ok: false, text: "Use a JPEG, PNG, WebP or AVIF image." });
    if (file.size > MAX_BYTES) return setMessage({ ok: false, text: "The image is over 10 MB; use a smaller one." });
    if (!title.trim()) return setMessage({ ok: false, text: "Give the image a title." });
    if (!permission) return setMessage({ ok: false, text: "Confirm BAME may publish this image." });

    setBusy(true);
    const path = `${userId}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
    const stored = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (stored.error) {
      setBusy(false);
      return setMessage({ ok: false, text: `The image wasn't uploaded: ${stored.error.message}` });
    }
    const recorded = await supabase.from("media_assets").insert({
      storage_path: path,
      title: title.trim(),
      section,
      player_id: playerId || null,
      publish_permission: true,
    });
    if (recorded.error) {
      // never leave a file without its record
      await supabase.storage.from(BUCKET).remove([path]);
      setBusy(false);
      return setMessage({ ok: false, text: `The image wasn't saved: ${recorded.error.message}` });
    }
    setBusy(false);
    setFile(null);
    setTitle("");
    setPlayerId("");
    setPermission(false);
    (e.target as HTMLFormElement).reset();
    setMessage({ ok: true, text: "Uploaded." });
    router.refresh();
  }

  async function setAsPlayerPhoto(asset: MediaAsset) {
    if (!asset.player_id) return;
    setMessage(null);
    const res = await fetch("/api/staff/players", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: asset.player_id, photo_url: url(asset.storage_path) }),
    });
    setMessage(
      res.ok
        ? { ok: true, text: `${playerName(asset.player_id)}'s photo is updated.` }
        : { ok: false, text: "The player's photo wasn't changed. Try again, or ask an admin." },
    );
    router.refresh();
  }

  async function remove(asset: MediaAsset) {
    if (!confirm(`Remove "${asset.title}"? Anywhere the site uses it will lose the image.`)) return;
    setMessage(null);
    const gone = await supabase.from("media_assets").delete().eq("id", asset.id).select("id");
    if (gone.error || !gone.data?.length) {
      return setMessage({ ok: false, text: "The image wasn't removed: only its uploader or an admin can." });
    }
    await supabase.storage.from(BUCKET).remove([asset.storage_path]);
    setMessage({ ok: true, text: "Removed." });
    router.refresh();
  }

  async function copyLink(asset: MediaAsset) {
    await navigator.clipboard.writeText(url(asset.storage_path));
    setMessage({ ok: true, text: "Link copied." });
  }

  const shown = filter === "all" ? assets : assets.filter((a) => a.section === filter);

  return (
    <div className="space-y-8">
      <form
        onSubmit={upload}
        data-testid="media-upload"
        className="space-y-4 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 text-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-[var(--bame-muted)]">Image (JPEG, PNG, WebP or AVIF, up to 10 MB)</span>
            <input
              type="file"
              accept={TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-xs"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--bame-muted)]">Title</span>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Signing day, March 2026"
              className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--bame-muted)]">Where it&rsquo;s for</span>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
            >
              {Object.entries(SECTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[var(--bame-muted)]">Player in the image (optional)</span>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
            >
              <option value="">None</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5" />
          <span>
            BAME may publish this image, and everyone in it (or their parent or guardian, for a minor) has agreed.
          </span>
        </label>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[var(--bame-accent)] px-5 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
          {message && (
            <p role="status" className={`text-xs ${message.ok ? "text-[var(--bame-accent)]" : "text-red-400"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>

      <div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["all", ...Object.keys(SECTIONS)].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 ${
                filter === k ? "border-[var(--bame-accent)] text-[var(--bame-accent)]" : "border-[var(--bame-line)] text-[var(--bame-muted)]"
              }`}
            >
              {k === "all" ? `All (${assets.length})` : SECTIONS[k]}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bame-muted)]">No images here yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url(a.storage_path)} alt={a.title} className="aspect-square w-full object-cover" loading="lazy" />
                <figcaption className="space-y-2 p-3 text-xs">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-[var(--bame-muted)]">
                    {SECTIONS[a.section] ?? a.section}
                    {a.player_id && playerName(a.player_id) ? ` · ${playerName(a.player_id)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => copyLink(a)} className="text-[var(--bame-muted)] hover:underline">
                      Copy link
                    </button>
                    {a.player_id && (
                      <button onClick={() => setAsPlayerPhoto(a)} className="text-[var(--bame-accent)] hover:underline">
                        Use as player photo
                      </button>
                    )}
                    {(a.uploaded_by === userId || isAdmin) && (
                      <button onClick={() => remove(a)} className="text-red-400 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
