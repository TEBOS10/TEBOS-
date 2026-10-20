// The Listing studio (TEPOS): from a listing's stated facts, the advert's words, the walkthrough shot list and the
// caption. Everything here is built from what the founder filled in, and nothing else: an empty fact is left out,
// never guessed, and no figure (income, yield, value) is ever invented. The database enforces the same limits on
// the facts (migration 20261019140000_agent_listing_studio.sql).
import { looksPersonal, type Deal } from "./agent";
import { money } from "./property";
import { looksSecret } from "./resilience";
import { fail, OK, type Check } from "./rules";

export const PROPERTY_KINDS = {
  house: "House",
  apartment: "Apartment",
  townhouse: "Townhouse",
  commercial: "Commercial property",
  industrial: "Industrial property",
  land: "Vacant land",
  farm: "Farm",
} as const;
export type PropertyKind = keyof typeof PROPERTY_KINDS;

/** What the advert says about the listing's state. "Just sold" and "Just let" are for listings that closed. */
export const AD_STATUSES = {
  available: "Available",
  new: "Just listed",
  under_offer: "Under offer",
  closed: "Just sold",
} as const;
export type AdStatus = keyof typeof AD_STATUSES;

export interface ListingFacts {
  kind: PropertyKind | null;
  suburb: string | null;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  offices: number | null;
  kitchens: number | null;
  parking: number | null;
  floorM2: number | null;
  erfM2: number | null;
  highlights: string[];
}

export const EMPTY_FACTS: ListingFacts = {
  kind: null, suburb: null, city: null, bedrooms: null, bathrooms: null, offices: null, kitchens: null, parking: null,
  floorM2: null, erfM2: null, highlights: [],
};

const COUNTS = ["bedrooms", "bathrooms", "offices", "kitchens", "parking"] as const;
export const HIGHLIGHTS_MAX = 6;
export const HIGHLIGHT_MAX = 60;

/** The rules for a listing's facts, checked before saving; the database enforces the same. */
export function checkFacts(f: ListingFacts): Check {
  if (f.kind !== null && !(f.kind in PROPERTY_KINDS)) return fail("TEBOS_VALIDATION", "Choose the kind of property.");
  for (const k of COUNTS) {
    const n = f[k];
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 99)) return fail("TEBOS_VALIDATION", "Counts are whole numbers from 0 to 99.");
  }
  for (const a of [f.floorM2, f.erfM2]) {
    if (a !== null && (!Number.isFinite(a) || a < 0)) return fail("TEBOS_VALIDATION", "Sizes are zero or more square metres.");
  }
  for (const t of [f.suburb, f.city]) {
    if (t !== null && (t.trim().length < 1 || t.trim().length > 80)) return fail("TEBOS_VALIDATION", "Keep the suburb and city under 80 characters.");
  }
  if (f.highlights.length > HIGHLIGHTS_MAX) return fail("TEBOS_VALIDATION", "Up to six highlights.");
  if (f.highlights.some((h) => h.trim().length < 1 || h.trim().length > HIGHLIGHT_MAX)) {
    return fail("TEBOS_VALIDATION", "Each highlight is 1 to 60 characters.");
  }
  const text = [f.suburb, f.city, ...f.highlights];
  if (text.some(looksSecret)) return fail("TEBOS_VALIDATION", "This looks like a password, key or token. Secrets are never stored here.");
  if (text.some(looksPersonal)) return fail("TEBOS_VALIDATION", "No phone numbers, email addresses or ID numbers in a listing's facts.");
  return OK;
}

/** "R850 000", or "R8 500 per month" for a rental. Null when the price isn't known: the advert then says "Price on request". */
export function priceText(price: number | null, deal: Deal): string | null {
  if (price === null) return null;
  return deal === "rental" ? `${money(price)} per month` : money(price);
}

export interface Feature { value: string; label: string }

/** The features the founder stated, in the order buyers read them; zero and empty are left out. */
export function features(f: ListingFacts): Feature[] {
  const out: Feature[] = [];
  const count = (n: number | null, one: string, many: string) => {
    if (n !== null && n > 0) out.push({ value: String(n), label: n === 1 ? one : many });
  };
  count(f.bedrooms, "Bedroom", "Bedrooms");
  count(f.bathrooms, "Bathroom", "Bathrooms");
  count(f.offices, "Office", "Offices");
  count(f.kitchens, "Kitchen", "Kitchens");
  count(f.parking, "Parking bay", "Parking bays");
  if (f.floorM2 !== null && f.floorM2 > 0) out.push({ value: `${trim(f.floorM2)} m²`, label: "Floor area" });
  if (f.erfM2 !== null && f.erfM2 > 0) out.push({ value: `${trim(f.erfM2)} m²`, label: "Erf size" });
  return out;
}

const trim = (n: number) => String(Math.round(n * 10) / 10).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function placeText(f: ListingFacts): string | null {
  const parts = [f.suburb, f.city].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export interface AdvertCopy {
  ribbon: string;
  headline: string;
  place: string | null;
  price: string;
  features: Feature[];
  highlights: string[];
}

/** The words on the advert, from the facts alone. */
export function advertCopy(deal: Deal, price: number | null, f: ListingFacts, status: AdStatus): AdvertCopy {
  const what = f.kind ? PROPERTY_KINDS[f.kind] : "Property";
  const verb = deal === "rental" ? "to let" : "for sale";
  const ribbon = status === "closed" ? (deal === "rental" ? "Just let" : "Just sold")
    : status === "available" ? (deal === "rental" ? "To let" : "For sale")
    : AD_STATUSES[status];
  return {
    ribbon: ribbon.toUpperCase(),
    headline: status === "closed" ? what : `${what} ${verb}`,
    place: placeText(f),
    price: status === "closed" ? (deal === "rental" ? "Let" : "Sold") : (priceText(price, deal) ?? "Price on request"),
    features: features(f),
    highlights: f.highlights.map((h) => h.trim()),
  };
}

export interface Shot { title: string; how: string }

/**
 * The walkthrough, room by room, for a phone video with the founder on camera: arrive, enter, the living spaces,
 * then the rooms the facts list, and close at the door. Only rooms the facts list are in it.
 */
export function shotList(f: ListingFacts): Shot[] {
  const shots: Shot[] = [
    { title: "Arrival", how: "Outside, phone upright at chest height. Walk slowly towards the entrance; say the opening line as you reach it." },
    { title: "Entrance", how: "Open the door and step through. Pause two seconds so the space reads." },
  ];
  const each = (n: number | null, one: string, how: string) => {
    if (!n || n <= 0) return;
    for (let i = 1; i <= Math.min(n, 4); i++) shots.push({ title: n === 1 ? one : `${one} ${i}`, how });
  };
  const home = f.kind === null || ["house", "apartment", "townhouse", "farm"].includes(f.kind);
  if (home) shots.push({ title: "Living areas", how: "Stand in a corner, turn slowly from the windows to the room. Let the light lead." });
  each(f.kitchens, "Kitchen", "Start wide, then one close shot of the best finish (counter, oven, storage).");
  each(f.offices, "Office", "From the doorway, show the size and the light. One sentence on how it could be used.");
  each(f.bedrooms, "Bedroom", "From the doorway, walk to the window. Show the cupboards.");
  each(f.bathrooms, "Bathroom", "One steady shot from the door; no mirror selfies of the phone.");
  if (f.parking && f.parking > 0) shots.push({ title: "Parking", how: "Show the bays and how cars come in and out." });
  for (const h of f.highlights) shots.push({ title: h, how: "A short, close shot that proves it." });
  shots.push({ title: "Close", how: "Back at the entrance, facing the camera: say what it costs and how to reach you." });
  return shots;
}

export interface AgentCard { name: string; title: string; phone: string; email: string; agencyLine: string }

/** The opening line for the walkthrough video: what it is, where, and the founder's angle, without a made-up figure. */
export function openingLine(deal: Deal, price: number | null, f: ListingFacts): string {
  const what = (f.kind ? PROPERTY_KINDS[f.kind] : "property").toLowerCase();
  const where = placeText(f);
  const p = priceText(price, deal);
  return `This ${what}${where ? ` in ${where}` : ""}${p ? ` at ${p}` : ""}: let me show you what it is, and what it could become.`;
}

/** The caption: the facts, the founder's angle, and the agency's line. Hashtags come from the place and the agency. */
export function caption(deal: Deal, price: number | null, f: ListingFacts, status: AdStatus, card: AgentCard): string {
  const c = advertCopy(deal, price, f, status);
  const lines: string[] = [];
  const what = (f.kind ? PROPERTY_KINDS[f.kind] : "Property").toLowerCase();
  lines.push(`${c.ribbon[0]}${c.ribbon.slice(1).toLowerCase()}: ${what}${c.place ? ` in ${c.place}` : ""}.`);
  if (status !== "closed") lines.push(c.price);
  if (c.features.length) lines.push(c.features.map((x) => `${x.value} ${x.label.toLowerCase()}`).join(" · "));
  for (const h of c.highlights) lines.push(`• ${h}`);
  lines.push("");
  lines.push(status === "closed"
    ? "Thinking of selling? Ask me what your property could achieve."
    : "Looking at what a property can earn, not just what it costs? Message me to view it.");
  const sign = [card.name.trim(), card.title.trim()].filter(Boolean).join(" | ");
  if (sign) lines.push(sign);
  const contact = [card.phone.trim(), card.email.trim()].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  if (card.agencyLine.trim()) lines.push(card.agencyLine.trim());
  const tags = [f.suburb, f.city].map((s) => s?.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean).map((s) => `#${s}`);
  tags.push("#PelserRealEstate", status === "closed" ? (deal === "rental" ? "#JustLet" : "#JustSold") : (deal === "rental" ? "#ToLet" : "#ForSale"));
  lines.push("", tags.join(" "));
  return lines.join("\n");
}
