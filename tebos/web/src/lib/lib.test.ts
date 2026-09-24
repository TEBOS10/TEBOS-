import { describe, expect, it } from "vitest";
import { RULE_CODES } from "@core/rules";
import { describeEvent } from "../pages/ActionPage";
import { explainError } from "./errors";
import { ago, domainOf, normaliseWebsite, pct } from "./format";
import { matchPath } from "./router";
import { slugify } from "./data";

describe("explaining database refusals", () => {
  it("turns every rule the database enforces into a sentence", () => {
    for (const code of RULE_CODES) {
      const e = explainError({ message: "raw", hint: code, code: "P0001" });
      expect(e.code).toBe(code);
      expect(e.message).not.toBe("raw");
      expect(e.message.length).toBeGreaterThan(10);
    }
  });

  it("recognises permission and duplicate errors, and never hides unknown ones", () => {
    expect(explainError({ message: "new row violates row-level security policy", code: "42501" }).code).toBe("TEBOS_PERMISSION_DENIED");
    expect(explainError({ message: "dup", code: "23505" }).message).toBe("That already exists.");
    expect(explainError(new Error("network down")).message).toBe("network down");
    expect(explainError(undefined).message).toMatch(/Nothing was changed/);
  });
});

describe("website input", () => {
  it("accepts bare domains and full URLs, rejects the rest", () => {
    expect(normaliseWebsite("mmupiandclay.co.za")).toBe("https://mmupiandclay.co.za/");
    expect(normaliseWebsite("  http://Example.com/about#x ")).toBe("http://example.com/about");
    expect(normaliseWebsite("localhost")).toBeNull();
    expect(normaliseWebsite("javascript:alert(1)")).toBeNull();
    expect(normaliseWebsite("ftp://example.com")).toBeNull();
    expect(normaliseWebsite("")).toBeNull();
  });

  it("derives the business domain without www", () => {
    expect(domainOf("https://www.Acme.co.za/contact")).toBe("acme.co.za");
    expect(domainOf("not a url")).toBeNull();
  });
});

describe("routing", () => {
  it("matches patterns and extracts parameters", () => {
    expect(matchPath("/scans/:id", "/scans/abc-123")).toEqual({ id: "abc-123" });
    expect(matchPath("/scans/:id", "/scans")).toBeNull();
    expect(matchPath("/", "/")).toEqual({});
    expect(matchPath("/actions", "/scans")).toBeNull();
  });
});

describe("display", () => {
  it("formats honestly", () => {
    expect(pct(0.784)).toBe("78%");
    expect(pct(null)).toBe("—");
    expect(ago(null)).toBe("never");
    expect(ago(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 min ago");
    expect(slugify("Tidy Enterprise (SA)")).toBe("tidy-enterprise-sa");
  });

  it("describes audit events in plain words", () => {
    expect(describeEvent("actions.transition", { status: "awaiting_approval" })).toBe("Action → awaiting approval");
    expect(describeEvent("approvals.insert", { status: "pending" })).toBe("Approval created (pending)");
    expect(describeEvent("action_runs.update", {})).toBe("Run updated");
  });
});
