// Grape Studios' site talks to TEBOS's bookings (ADR 0016) as the public: the catalogue, free times, a request, and the
// customer's own booking by its private link. No account and no privileged key. Until Grape Studios is set up in TEBOS,
// the site shows the rate cards it was given and says plainly that online booking opens soon.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { CATEGORIES } from "../lib/grapeRates";

export const SLUG = "grape-studios";
export const BOOKINGS_EMAIL = "grapephotographybookings@gmail.com";
export const INSTAGRAM = "https://www.instagram.com/grape.studios_/";
export const BEHANCE = "https://www.behance.net/tebohotefu";

// The brands Grape Studios has shot for, as listed in its own Instagram highlights (seen 1 Nov 2026). Shown as names
// in type, never as the brands' logos. Grape confirms each one, and that it may name it, before the site goes live
// (operator log, decision 34).
export const BRANDS = ["PUMA", "G-Star Raw", "Antony Morato", "Happyville", "YMZ", "2Millionicons"] as const;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const db = url && key ? createClient<Database>(url, key, { auth: { persistSession: false } }) : null;

export interface CatPackage { id: string | null; label: string; minutes: number; price_cents: number; note: string | null }
export interface CatService {
  id: string | null; key: string; name: string; cover: string | null; pictures: string | null;
  delivery_min: number | null; delivery_max: number | null; travel_min: number | null; travel_max: number | null; at_studio: boolean;
  packages: CatPackage[];
}
export interface Catalogue { name: string; accepting: boolean; services: CatService[]; live: boolean }

const COVER = (k: string) => `/photos/${k.replace("_", "-")}.jpg`;

/** The rate cards as supplied, for before Grape Studios is set up in TEBOS. Nothing can be booked from these. */
export function fallbackCatalogue(): Catalogue {
  const days = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  return {
    name: "Grape Studios", accepting: false, live: false,
    services: CATEGORIES.map((c) => ({
      id: null, key: c.key, name: c.name, cover: COVER(c.key), pictures: c.pictures,
      delivery_min: days(c.delivery)[0] ?? null, delivery_max: days(c.delivery)[1] ?? null,
      travel_min: c.transport?.[0] ?? null, travel_max: c.transport?.[1] ?? null, at_studio: c.transport === null,
      packages: c.packages.map((p) => ({ id: null, label: p.label, minutes: (p.hours ?? 1) * 60, price_cents: p.cents, note: p.note ?? null })),
    })),
  };
}

export async function loadCatalogue(): Promise<Catalogue> {
  if (!db) return fallbackCatalogue();
  const { data, error } = await db.rpc("booking_catalogue", { p_slug: SLUG });
  if (error || !data) return fallbackCatalogue();
  const c = data as unknown as Omit<Catalogue, "live">;
  return { ...c, live: true, services: c.services.map((s) => ({ ...s, cover: s.cover ?? COVER(s.key) })) };
}

export async function freeTimes(day: string, minutes: number): Promise<string[]> {
  if (!db) return [];
  const { data, error } = await db.rpc("booking_free_times", { p_slug: SLUG, p_day: day, p_minutes: minutes });
  if (error) throw error;
  return (data ?? []).map((r) => r.starts_at);
}

export interface Request {
  service: string; package: string | null; starts: string; minutes: number; name: string; email: string; phone: string; brief: string; consent: boolean;
}
export async function requestBooking(r: Request): Promise<{ ref: string; token: string }> {
  if (!db) throw new Error("Online booking isn't open yet.");
  const { data, error } = await db.rpc("booking_request", {
    p_slug: SLUG, p_service: r.service, p_package: r.package, p_starts: r.starts, p_minutes: r.minutes,
    p_name: r.name, p_email: r.email, p_phone: r.phone || null, p_brief: r.brief || null, p_consent: r.consent,
  });
  if (error) throw error;
  return data as unknown as { ref: string; token: string };
}

export interface MyBooking {
  ref: string; status: string; status_note: string | null; business: string; contact_email: string | null; service: string;
  package: string | null; starts_at: string; ends_at: string; price_cents: number | null; deposit_cents: number | null;
  deposit_paid: boolean; deposit_instructions: string | null; delivery_min: number | null; delivery_max: number | null;
  travel_min: number | null; travel_max: number | null; delivered_note: string | null;
  /** Shot, and the balance is still owed before the gallery is released. */
  balance_due?: boolean;
  /** Only once delivered. */
  gallery_url?: string | null;
  week_busy: Array<{ starts_at: string; ends_at: string; yours: boolean }>;
}
export async function myBooking(token: string): Promise<MyBooking | null> {
  if (!db) return null;
  const { data, error } = await db.rpc("booking_for_token", { p_token: token });
  if (error) throw error;
  return (data as unknown as MyBooking) ?? null;
}
