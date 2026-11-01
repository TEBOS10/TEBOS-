// Grape Studios' rate cards, as supplied by the founder on 1 Nov 2026 (the PDF rate cards for studio, on location,
// corporate, graduation and property). Events has no card: it is quoted. Every category also takes a custom rate for
// tailored work. Banking details on the cards are deliberately left out of the website: payment details belong in
// the booking confirmation, not on a public page.

export type CategoryKey = "studio" | "on_location" | "corporate" | "graduation" | "property" | "events";

export interface Package { label: string; hours: number | null; cents: number; note?: string }
export interface Category {
  key: CategoryKey;
  name: string;
  cover: string;
  coverAlt: string;
  packages: Package[];
  /** What the card says about the pictures delivered. */
  pictures: string;
  /** Working days to receive the images. */
  delivery: string;
  /** Travel around Johannesburg, charged on top, in rand; null when the shoot is at the studio. */
  transport: [number, number] | null;
}

export const DEPOSIT_SHARE = 0.5;

export const CATEGORIES: Category[] = [
  { key: "studio", name: "Studio shoots", cover: "/work/grape/studio.jpg", coverAlt: "A studio portrait on a grey backdrop",
    packages: [
      { label: "1 hour", hours: 1, cents: 260_000, note: "Up to 2 outfits" },
      { label: "2 hours", hours: 2, cents: 340_000, note: "Up to 3 outfits" },
      { label: "Half day", hours: 4, cents: 640_000 },
      { label: "Full day", hours: 8, cents: 1_230_000 },
    ], pictures: "20 to 25 edited pictures per hour", delivery: "2 to 4 days", transport: null },
  { key: "on_location", name: "On location", cover: "/work/grape/on-location.jpg", coverAlt: "A couple photographed in front of a white building",
    packages: [
      { label: "1 hour", hours: 1, cents: 180_000 },
      { label: "2 hours", hours: 2, cents: 230_000 },
      { label: "Half day", hours: 4, cents: 520_000 },
    ], pictures: "Unlimited edited pictures", delivery: "2 to 4 days", transport: [300, 400] },
  { key: "corporate", name: "Corporate", cover: "/work/grape/corporate.jpg", coverAlt: "Guests arriving on a red carpet at an evening function",
    packages: [
      { label: "Per hour", hours: 1, cents: 180_000 },
      { label: "Half day", hours: 4, cents: 650_000 },
      { label: "Full day", hours: 8, cents: 965_000 },
    ], pictures: "Unlimited edited pictures", delivery: "2 to 4 days", transport: [300, 400] },
  { key: "graduation", name: "Graduation", cover: "/work/grape/graduation.jpg", coverAlt: "A graduate in gown and cap under trees",
    packages: [
      { label: "1 hour", hours: 1, cents: 150_000 },
      { label: "2 hours", hours: 2, cents: 230_000 },
      { label: "Half day", hours: 4, cents: 520_000 },
    ], pictures: "Unlimited edited pictures", delivery: "2 to 4 days", transport: [300, 400] },
  { key: "property", name: "Property listing", cover: "/work/grape/property.jpg", coverAlt: "A lounge with leather couches and a cowhide rug",
    packages: [{ label: "Per unit", hours: null, cents: 80_000 }],
    pictures: "No limit on edited pictures", delivery: "1 to 2 days", transport: [300, 450] },
  { key: "events", name: "Events", cover: "/work/grape/events.jpg", coverAlt: "A white and gold balloon arch for a birthday",
    packages: [], pictures: "Agreed per event", delivery: "Agreed per event", transport: [300, 400] },
];

/** The deposit that secures a date: half, non-refundable; the rest is paid on the day. */
export function deposit(cents: number): { deposit: number; balance: number } {
  const d = Math.round(cents * DEPOSIT_SHARE);
  return { deposit: d, balance: cents - d };
}
