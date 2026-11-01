import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import { deliveryWindow, deposit, saLocal, slotProblem } from "../src/domain/bookings";

const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opens: "08:00", closes: "18:00" }));
const now = new Date("2026-11-01T10:00:00Z");
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`).toISOString();

describe("bookings", () => {
  it("moves through its states and nowhere else", () => {
    expect(canTransition("booking", "requested", "confirmed")).toBe(true);
    expect(canTransition("booking", "requested", "completed")).toBe(false);
    expect(canTransition("booking", "completed", "delivered")).toBe(true);
    expect(canTransition("booking", "delivered", "cancelled")).toBe(false);
  });
  it("asks half as the deposit", () => {
    expect(deposit(260_000)).toEqual({ deposit: 130_000, balance: 130_000 });
  });
  it("reads South African wall-clock time", () => {
    expect(saLocal("2026-11-08T08:00:00Z")).toEqual({ date: "2026-11-08", time: "10:00", isoWeekday: 7 });
  });
  it("refuses a slot for the same reasons as the database, in the same order", () => {
    expect(slotProblem(at("2026-11-01", "14:00"), at("2026-11-01", "15:00"), now, hours, [], [])).toBe("a booking is made at least a day ahead");
    expect(slotProblem(at("2027-06-01", "10:00"), at("2027-06-01", "11:00"), now, hours, [], [])).toBe("bookings open up to six months ahead");
    expect(slotProblem(at("2026-11-08", "06:00"), at("2026-11-08", "07:00"), now, hours, [], [])).toBe("that is outside working hours");
    expect(slotProblem(at("2026-11-08", "17:30"), at("2026-11-08", "18:30"), now, hours, [], [])).toBe("that is outside working hours");
    const busy = [{ starts_at: at("2026-11-08", "10:00"), ends_at: at("2026-11-08", "11:00") }];
    expect(slotProblem(at("2026-11-08", "10:30"), at("2026-11-08", "11:30"), now, hours, [], busy)).toBe("that time is already taken");
    expect(slotProblem(at("2026-11-08", "10:30"), at("2026-11-08", "11:30"), now, hours, busy, [])).toBe("the studio is closed then");
    expect(slotProblem(at("2026-11-08", "11:00"), at("2026-11-08", "12:00"), now, hours, [], busy)).toBeNull();
  });
  it("gives the delivery window in working days", () => {
    expect(deliveryWindow(at("2026-11-06", "10:00"), 2, 4)).toEqual({ from: "2026-11-10", to: "2026-11-12" });
  });
});
