import { describe, expect, it } from "vitest";
import { isEmailAddress, parseEmailInput, parseFromAddress } from "../../src/domain/email";
import { transitionPath } from "../../src/domain/states";

describe("email input", () => {
  it("normalises recipients and accepts a complete email", () => {
    const r = parseEmailInput({ to: "Buyer@Clay.test, other@clay.test; buyer@clay.test", subject: " Order received ", text: "Thanks\r\nfor ordering" });
    expect(r).toEqual({ ok: true, value: { to: ["buyer@clay.test", "other@clay.test"], subject: "Order received", text: "Thanks\nfor ordering", replyTo: null } });
  });

  it("refuses what it can't send safely, and says why", () => {
    const r = parseEmailInput({ to: ["not-an-address", "a@b"], subject: "Hi\r\nBcc: victim@x.test", text: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toEqual(expect.arrayContaining(["Not an email address: not-an-address, a@b", "The subject must be a single line", "Add the message"]));
    }
    expect(parseEmailInput(null)).toEqual({ ok: false, problems: ["The email is missing"] });
    expect(parseEmailInput({ to: Array.from({ length: 21 }, (_, i) => `p${i}@x.test`), subject: "s", text: "t" }).ok).toBe(false);
  });

  it("recognises plain mailboxes only", () => {
    expect(isEmailAddress("orders@clay.co.za")).toBe(true);
    for (const bad of ["a..b@x.test", "Name <a@x.test>", "a@x", "a@-x.test", "a b@x.test", "a@x.test,b@y.test"]) expect(isEmailAddress(bad)).toBe(false);
  });

  it("accepts a sender with or without a name, and nothing that could smuggle headers", () => {
    expect(parseFromAddress("Clay Studio <Orders@Clay.test>")).toEqual({ ok: true, value: { address: "orders@clay.test", name: "Clay Studio", header: "Clay Studio <orders@clay.test>" } });
    expect(parseFromAddress("orders@clay.test")).toMatchObject({ ok: true, value: { header: "orders@clay.test" } });
    for (const bad of ["", "Clay\r\nBcc: x@y.test <o@clay.test>", "a@x.test, b@y.test", "Clay <not an address>", undefined]) expect(parseFromAddress(bad).ok).toBe(false);
  });
});

describe("transition paths", () => {
  it("finds the legal route through the machine", () => {
    expect(transitionPath("connection", "configured", "connected")).toEqual(["connected"]);
    expect(transitionPath("connection", "unavailable", "connected")).toEqual(["configured", "connected"]);
    expect(transitionPath("connection", "connected", "connected")).toEqual([]);
    expect(transitionPath("action", "verified", "ready")).toBeNull();
  });
});
