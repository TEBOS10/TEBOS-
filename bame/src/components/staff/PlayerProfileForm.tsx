"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  full_name: string;
  email: string | null;
  sport: string | null;
  package_tier: string;
  status: string;
  photo_url: string | null;
  bio: string | null;
  highlights: string[] | null;
  achievements: string[] | null;
  portfolio_public: boolean;
}

const TIERS = ["foundation", "growth", "custom"];
const STATUSES = ["active", "paused", "offboarded"];

export default function PlayerProfileForm({ player }: { player: Player }) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: player.full_name,
    email: player.email || "",
    sport: player.sport || "",
    package_tier: player.package_tier,
    status: player.status,
    photo_url: player.photo_url || "",
    bio: player.bio || "",
    highlights: (player.highlights || []).join("\n"),
    achievements: (player.achievements || []).join("\n"),
    portfolio_public: player.portfolio_public,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/staff/players", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: player.id,
        ...form,
        highlights: form.highlights.split("\n").map((s) => s.trim()).filter(Boolean),
        achievements: form.achievements.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6 text-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Full name</span>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Email</span>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Sport</span>
          <input
            value={form.sport}
            onChange={(e) => setForm({ ...form, sport: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Package</span>
          <select
            value={form.package_tier}
            onChange={(e) => setForm({ ...form, package_tier: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Status</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-[var(--bame-bg)] px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Photo URL (optional)</span>
          <input
            value={form.photo_url}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-[var(--bame-muted)]">Bio</span>
        <textarea
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          rows={4}
          className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Highlights (one per line)</span>
          <textarea
            value={form.highlights}
            onChange={(e) => setForm({ ...form, highlights: e.target.value })}
            rows={4}
            placeholder="Provincial captain, U19&#10;3x regional tournament winner"
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--bame-muted)]">Achievements (one per line)</span>
          <textarea
            value={form.achievements}
            onChange={(e) => setForm({ ...form, achievements: e.target.value })}
            rows={4}
            placeholder="National championship, 2025&#10;Signed first brand partnership, 2026"
            className="mt-1 w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bame-line)] p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.portfolio_public}
            onChange={(e) => setForm({ ...form, portfolio_public: e.target.checked })}
          />
          Publish public portfolio
        </label>
        {form.portfolio_public && (
          <a
            href={`/athletes/${player.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--bame-accent)] hover:underline"
          >
            View / copy shareable link →
          </a>
        )}
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-[var(--bame-accent)] px-5 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save profile"}
      </button>
    </form>
  );
}
