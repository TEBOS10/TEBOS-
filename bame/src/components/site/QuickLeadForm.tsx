"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CAREER_STAGES = [
  "Academy / student athlete",
  "Emerging / amateur",
  "Semi-professional",
  "Professional",
  "Elite / national / international",
  "Post-career / creator",
];

const PRIMARY_FOCUS = [
  "Brand foundations",
  "Content and media",
  "Commercial profile",
  "Sponsorship / partnerships",
  "Representation support",
  "Full brand management",
];

export default function QuickLeadForm() {
  const router = useRouter();
  const [contactType, setContactType] = useState<"athlete" | "event">("athlete");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      contact_type: contactType,
      full_name: String(form.get("full_name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      sport: String(form.get("sport") || ""),
      career_stage: String(form.get("career_stage") || ""),
      primary_focus: String(form.get("primary_focus") || ""),
      location: String(form.get("location") || ""),
      goal: String(form.get("goal") || ""),
      consent: form.get("consent") === "on",
    };

    if (!payload.full_name || !payload.email || !payload.consent) {
      setError("Please complete your name, email, and consent before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      const params = new URLSearchParams({
        contact_type: contactType,
        full_name: payload.full_name,
        email: payload.email,
        phone: payload.phone,
        sport: payload.sport,
        ...(json.id ? { lead_id: json.id } : {}),
      });
      router.push(`/intake?${params.toString()}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-6">
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setContactType("athlete")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            contactType === "athlete" ? "bg-[var(--bame-accent)] text-[#1a1608]" : "bg-transparent text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
          }`}
        >
          I am an athlete
        </button>
        <button
          type="button"
          onClick={() => setContactType("event")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            contactType === "event" ? "bg-[var(--bame-accent)] text-[#1a1608]" : "bg-transparent text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
          }`}
        >
          I run a sports event
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Your full name <span className="text-[var(--bame-accent)]">*</span>
          <input name="full_name" required className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email address <span className="text-[var(--bame-accent)]">*</span>
          <input name="email" type="email" required className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone number
          <input name="phone" className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sport
          <input name="sport" className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
        {contactType === "athlete" && (
          <label className="flex flex-col gap-1 text-sm">
            Career stage
            <select name="career_stage" className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2">
              <option value="">Select one</option>
              {CAREER_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Primary focus
          <select name="primary_focus" className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2">
            <option value="">Select one</option>
            {PRIMARY_FOCUS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Location
          <input name="location" className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Where do you want sport to take you?
          <textarea name="goal" rows={3} className="rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2" />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 text-xs text-[var(--bame-muted)]">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        I confirm these details are accurate and consent to BAME retaining them to assess this enquiry. No final pricing or commitment is made at this stage.
      </label>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full rounded-full bg-[var(--bame-accent)] px-5 py-3 text-sm font-semibold text-[#1a1608] transition hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? "Continuing…" : "See my BAME path"}
      </button>
    </form>
  );
}
