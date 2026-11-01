// A studio that takes bookings, for the bookings and Grape Studios specs.
import { ORG } from "./fixtures";

export function seedStudio(t: Record<string, unknown[]>, slug = "demo-fixture") {
  (t.organisations as Array<Record<string, unknown>>)[0]!.slug = slug;
  t.booking_settings = [{ org_id: ORG, public_name: "Grape Studios", contact_email: "bookings@grape.test", deposit_instructions: "Pay by EFT; use your booking reference.", accepting: true }];
  t.booking_services = [
    { id: "s-studio", org_id: ORG, key: "studio", name: "Studio shoots", cover_path: "/photos/studio.jpg", pictures_note: "20 to 25 edited pictures per hour", delivery_min: 2, delivery_max: 4, travel_min: null, travel_max: null, at_studio: true, sort: 1, active: true },
    { id: "s-events", org_id: ORG, key: "events", name: "Events", cover_path: "/photos/events.jpg", pictures_note: null, delivery_min: 2, delivery_max: 4, travel_min: 300, travel_max: 400, at_studio: false, sort: 6, active: true },
  ];
  t.booking_packages = [
    { id: "p-1h", service_id: "s-studio", org_id: ORG, label: "1 hour", minutes: 60, price_cents: 260000, note: "Up to 2 outfits", sort: 1, active: true },
    { id: "p-2h", service_id: "s-studio", org_id: ORG, label: "2 hours", minutes: 120, price_cents: 340000, note: "Up to 3 outfits", sort: 2, active: true },
  ];
  t.booking_hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ org_id: ORG, weekday, opens: "08:00:00", closes: "18:00:00" }));
}
