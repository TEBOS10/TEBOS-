import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLOSED_CONTACT, CLOSED_LISTING, CONTACT_ROLES, CONTACT_STAGES, LISTING_STAGES, ROLE_PREFIX, SOURCES,
  agenda, checkContact, checkListing, dueText, looksPersonal, type Contact, type Listing,
} from "../src/domain/agent";

const TODAY = "2026-10-17";
let n = 0;
const listing = (over: Partial<Listing> = {}): Listing => ({
  id: `l${++n}`, ref: `L-00${n}`, label: "3-bed house, Erf 512", deal: "sale", stage: "prospect", price: 1_850_000, mandate: null,
  mandateEndsOn: null, nextStep: "Present the valuation", nextStepOn: TODAY, outcome: null, note: null, ...over,
});
const contact = (over: Partial<Contact> = {}): Contact => ({
  id: `c${++n}`, ref: `B-00${n}`, role: "buyer", label: "First-time buyer, R1.2m", listingId: null, source: "portal", stage: "new",
  nextStep: "Book viewings", nextStepOn: TODAY, outcome: null, note: null, ...over,
});
const { id: _l, ref: _lr, ...l0 } = listing();
const { id: _c, ref: _cr, ...c0 } = contact();

describe("agent's office: the rules", () => {
  it("accepts a well-formed listing and contact", () => {
    expect(checkListing(l0)).toEqual({ ok: true });
    expect(checkContact(c0)).toEqual({ ok: true });
  });

  it("nothing open is left without a next step and a date", () => {
    expect(checkListing({ ...l0, nextStep: null }).ok).toBe(false);
    expect(checkListing({ ...l0, nextStep: "  " }).ok).toBe(false);
    expect(checkListing({ ...l0, nextStepOn: null }).ok).toBe(false);
    expect(checkContact({ ...c0, nextStepOn: null }).ok).toBe(false);
  });

  it("anything closed says how it ended, and needs no next step", () => {
    expect(checkListing({ ...l0, stage: "lost", nextStep: null, nextStepOn: null }).ok).toBe(false);
    expect(checkListing({ ...l0, stage: "lost", nextStep: null, nextStepOn: null, outcome: "Owner chose another agency" }).ok).toBe(true);
    expect(checkContact({ ...c0, stage: "completed", nextStep: null, nextStepOn: null, outcome: "Bought L-002" }).ok).toBe(true);
  });

  it("an unknown price stays blank, never negative", () => {
    expect(checkListing({ ...l0, price: null }).ok).toBe(true);
    expect(checkListing({ ...l0, price: -1 }).ok).toBe(false);
  });

  it("no contact details or ID numbers until the agency allows them", () => {
    for (const t of ["jo@example.co.za", "Call 082 555 1234", "WhatsApp +27 82 555 1234", "0825551234", "ID 8001015009087", "011-555-1234"]) {
      expect(looksPersonal(t), t).toBe(true);
    }
    for (const t of ["Erf 512, 1 250 m²", "asking R1 850 000", "valued 2026-10-15", "rates R1 420 pm", "3-bed, 2-bath", "L-002", "B-001"]) {
      expect(looksPersonal(t), t).toBe(false);
    }
    expect(checkContact({ ...c0, note: "jo@example.co.za" }).ok).toBe(false);
    expect(checkListing({ ...l0, nextStep: "Call 082 555 1234" }).ok).toBe(false);
  });

  it("no secrets either", () => {
    expect(checkListing({ ...l0, note: "password: hunter2" }).ok).toBe(false);
  });
});

describe("agent's office: the agenda", () => {
  it("lists open next steps soonest first, grouped by when they are due", () => {
    const a = agenda(
      [listing({ ref: "L-001", nextStepOn: "2026-10-20" }), listing({ ref: "L-002", nextStepOn: "2026-10-15" }),
       listing({ ref: "L-003", stage: "withdrawn", nextStep: null, nextStepOn: null, outcome: "Owner withdrew" })],
      [contact({ ref: "B-001", nextStepOn: TODAY }), contact({ ref: "B-002", nextStepOn: "2026-11-30" })],
      TODAY,
    );
    expect(a.items.map((i) => i.ref)).toEqual(["L-002", "B-001", "L-001", "B-002"]);
    expect(a.items.map((i) => i.when)).toEqual(["overdue", "today", "this_week", "later"]);
    expect(a.counts).toEqual({ overdue: 1, today: 1, this_week: 1, later: 1 });
    expect(a.openListings).toBe(2);
    expect(a.openContacts).toBe(2);
  });

  it("flags open mandates ending within two weeks, or already ended", () => {
    const a = agenda(
      [listing({ ref: "L-001", mandate: "sole", mandateEndsOn: "2026-10-25" }), listing({ ref: "L-002", mandate: "sole", mandateEndsOn: "2026-12-31" }),
       listing({ ref: "L-003", mandate: "open", mandateEndsOn: "2026-10-10" }),
       listing({ ref: "L-004", stage: "completed", mandateEndsOn: "2026-10-18", nextStep: null, nextStepOn: null, outcome: "Registered" })],
      [], TODAY,
    );
    expect(a.mandatesEnding.map((m) => [m.ref, m.days])).toEqual([["L-003", -7], ["L-001", 8]]);
  });

  it("says how late or how soon", () => {
    expect(dueText(0)).toBe("today");
    expect(dueText(-1)).toBe("1 day late");
    expect(dueText(-3)).toBe("3 days late");
    expect(dueText(1)).toBe("tomorrow");
    expect(dueText(5)).toBe("in 5 days");
  });
});

describe("agent's office: the domain mirrors the database", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019100000_agent_office.sql"), "utf8");
  const values = (col: string, table: string) => {
    const body = sql.split(`create table public.${table}`)[1]!.split(");\n")[0]!;
    const line = body.split("\n").find((l) => l.trim().startsWith(col + " "))!;
    return [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };
  it("stages, roles and sources match", () => {
    expect(values("stage", "agent_listings")).toEqual(["prospect", ...Object.keys(LISTING_STAGES)]);
    expect(values("role", "agent_contacts")).toEqual(Object.keys(CONTACT_ROLES));
    expect(values("source", "agent_contacts")).toEqual(Object.keys(SOURCES));
    expect(values("stage", "agent_contacts")).toEqual(["new", ...Object.keys(CONTACT_STAGES)]);
  });
  it("closed stages and reference prefixes match", () => {
    expect(sql).toContain(`stage in (${CLOSED_LISTING.map((s) => `'${s}'`).join(", ")})`);
    expect(sql).toContain(`stage in (${CLOSED_CONTACT.map((s) => `'${s}'`).join(", ")})`);
    for (const [role, p] of Object.entries(ROLE_PREFIX)) {
      if (role !== "landlord") expect(sql).toContain(`when '${role}' then '${p}'`);
    }
    expect(sql).toContain(`else '${ROLE_PREFIX.landlord}'`);
  });
});
