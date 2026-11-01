import { describe, expect, it } from "vitest";
import { canTransition } from "../src/domain/states";
import { crewBlocker, deliveryWindow, deposit, GALLERY_URL, saLocal, shootChecklist, slotProblem, type CrewRecord } from "../src/domain/bookings";

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

describe("studio crew: running a shoot without the owner", () => {
  const base: CrewRecord = { status: "requested", assignee_id: null, call_sheet_at: null, releases_note: null, backed_up_at: null,
    balance_ref: null, gallery_url: null, price_cents: 260000, deposit_cents: 130000 };

  it("confirms only with a photographer assigned", () => {
    expect(crewBlocker(base, "confirmed")).toMatch(/assign the photographer/);
    expect(crewBlocker({ ...base, assignee_id: "u1" }, "confirmed")).toBeNull();
  });

  it("marks a shoot done only once it is backed up and releases are noted", () => {
    const shot = { ...base, status: "confirmed" as const, assignee_id: "u1" };
    expect(crewBlocker(shot, "completed")).toMatch(/backed up/);
    expect(crewBlocker({ ...shot, backed_up_at: "2026-11-02T10:00:00Z" }, "completed")).toMatch(/releases/);
    expect(crewBlocker({ ...shot, backed_up_at: "2026-11-02T10:00:00Z", releases_note: "Model release signed." }, "completed")).toBeNull();
  });

  it("delivers only with the gallery and, when a balance is owed, its payment", () => {
    const done = { ...base, status: "completed" as const, assignee_id: "u1", backed_up_at: "x", releases_note: "Signed." };
    expect(crewBlocker(done, "delivered")).toMatch(/gallery link/);
    expect(crewBlocker({ ...done, gallery_url: "https://g.example/a" }, "delivered")).toMatch(/balance/);
    expect(crewBlocker({ ...done, gallery_url: "https://g.example/a", balance_ref: "EFT 1300" }, "delivered")).toBeNull();
    // paid in full up front: nothing more owed
    expect(crewBlocker({ ...done, gallery_url: "https://g.example/a", deposit_cents: 260000 }, "delivered")).toBeNull();
    expect(GALLERY_URL.test("http://g.example/a")).toBe(false);
  });

  it("lists the checklist in order, ticking what is done", () => {
    const list = shootChecklist({ ...base, assignee_id: "u1", call_sheet_at: "x" });
    expect(list.map((x) => x.key)).toEqual(["assignee", "call_sheet", "releases", "backup", "balance", "gallery"]);
    expect(list.filter((x) => x.done).map((x) => x.key)).toEqual(["assignee", "call_sheet"]);
  });
});
