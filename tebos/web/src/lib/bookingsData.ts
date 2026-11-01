// Bookings (migration bookings, ADR 0016). The database decides what can be booked, what confirming needs and who sees
// whose details; these calls only read and write, and a refusal carries the database's reason.
import type { Database } from "../database.types";
import type { Db } from "./supabase";

type Tables = Database["public"]["Tables"];
export type Booking = Tables["bookings"]["Row"];
export type Service = Tables["booking_services"]["Row"];
export type BookingPackage = Tables["booking_packages"]["Row"];
export type Hours = Tables["booking_hours"]["Row"];
export type TimeOff = Tables["booking_time_off"]["Row"];
export type ScheduleItem = Database["public"]["Functions"]["booking_schedule"]["Returns"][number];

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R["data"]>;
}

/** Whether this organisation takes bookings (it has at least one service). */
export async function takesBookings(db: Db, org: string): Promise<boolean> {
  const rows = must(await db.from("booking_services").select("id").eq("org_id", org).limit(1));
  return rows.length > 0;
}

export async function schedule(db: Db, org: string, from: string, days = 7): Promise<ScheduleItem[]> {
  return must(await db.rpc("booking_schedule", { p_org: org, p_from: from, p_days: days })) as ScheduleItem[];
}

/** Every open request, oldest first: what the team has to answer. */
export async function openRequests(db: Db, org: string): Promise<Booking[]> {
  return must(await db.from("bookings").select("*").eq("org_id", org).eq("status", "requested").order("created_at"));
}

export async function booking(db: Db, id: string): Promise<Booking> {
  return must(await db.from("bookings").select("*").eq("id", id).single());
}

export async function services(db: Db, org: string): Promise<Service[]> {
  return must(await db.from("booking_services").select("*").eq("org_id", org).order("sort"));
}

export async function packages(db: Db, org: string): Promise<BookingPackage[]> {
  return must(await db.from("booking_packages").select("*").eq("org_id", org).order("sort"));
}

export async function hours(db: Db, org: string): Promise<Hours[]> {
  return must(await db.from("booking_hours").select("*").eq("org_id", org).order("weekday"));
}

export async function updateBooking(db: Db, id: string, patch: Tables["bookings"]["Update"]): Promise<Booking> {
  return must(await db.from("bookings").update(patch).eq("id", id).select().single());
}

export async function addTimeOff(db: Db, org: string, starts_at: string, ends_at: string, reason: string): Promise<void> {
  must(await db.from("booking_time_off").insert({ org_id: org, starts_at, ends_at, reason: reason.trim() || null }).select());
}

export async function setHours(db: Db, org: string, weekday: number, opens: string, closes: string | null): Promise<void> {
  if (!closes) {
    must(await db.from("booking_hours").delete().eq("org_id", org).eq("weekday", weekday).select());
    return;
  }
  must(await db.from("booking_hours").upsert({ org_id: org, weekday, opens, closes }).select());
}
