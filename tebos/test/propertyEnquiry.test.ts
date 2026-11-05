import { describe, expect, it } from "vitest";
import { checkEnquiry, looksPersonal, type EnquiryDraft } from "../src/domain/propertyEnquiry";

const ok: EnquiryDraft = {
  situation: "arrears", relationship: "owner", area: "Sunnyside, Pretoria",
  message: "Two units have been empty since March and the levies are three months behind.",
  name: "A Owner", email: "owner@example.test", phone: "", consent: true,
};

describe("property enquiry", () => {
  it("accepts a complete enquiry", () => expect(checkEnquiry(ok)).toBeNull());
  it("needs consent", () => expect(checkEnquiry({ ...ok, consent: false })).toMatch(/Agree/));
  it("needs a known situation and relationship", () => {
    expect(checkEnquiry({ ...ok, situation: "flip" })).toMatch(/what is happening/);
    expect(checkEnquiry({ ...ok, relationship: "" })).toMatch(/connected/);
  });
  it("needs a real description", () => expect(checkEnquiry({ ...ok, message: "help" })).toMatch(/a little more/));
  it("keeps personal details out of the description", () => {
    expect(looksPersonal("call me on 082 555 1234")).toBe(true);
    expect(looksPersonal("my ID is 8001015009087")).toBe(true);
    expect(looksPersonal("mail me at x@y.co.za")).toBe(true);
    expect(looksPersonal("six flats, two empty since March")).toBe(false);
    expect(checkEnquiry({ ...ok, message: "Please phone me on 082 555 1234 about the flats." })).toMatch(/Leave ID numbers/);
  });
  it("needs a reply address", () => expect(checkEnquiry({ ...ok, email: "nope" })).toMatch(/email/));
});
