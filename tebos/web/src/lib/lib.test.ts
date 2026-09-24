import { describe, expect, it } from "vitest";
import { RULE_CODES } from "@core/rules";
import { describeEvent } from "../pages/ActionPage";
import { explainError } from "./errors";
import { ago, domainOf, normaliseWebsite, pct } from "./format";
import { matchPath } from "./router";
import { csvCell, toCsv } from "./csv";
import { inviteLink, slugify } from "./data";
import { findingsCsv } from "../pages/ReportPage";

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

describe("CSV export", () => {
  it("neutralises cells a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+27 82 000 0000")).toBe("'+27 82 000 0000");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
  });
  it("leaves real numbers and ordinary text alone, and quotes separators", () => {
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(0.46)).toBe("0.46");
    expect(csvCell(null)).toBe("");
    expect(csvCell("Order on WhatsApp")).toBe("Order on WhatsApp");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("labels each finding for what it is and lists the evidence it rests on", () => {
    const csv = findingsCsv({
      activeFindings: [{ id: "f1", kind: "hypothesis", category: "sales", title: "=cmd", statement: "s", impact_hypothesis: null, confidence: 0.4, missing_information: ["a", "b"] }] as never,
      links: [
        { finding_id: "f1", evidence_id: "e1", relation: "supports" },
        { finding_id: "f1", evidence_id: "e2", relation: "contradicts" },
      ] as never,
    });
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toContain("label");
    expect(row).toBe("f1,hypothesis,sales,'=cmd,s,,0.4,e1,e2,a; b");
    expect(toCsv(["a"], [])).toBe("a\r\n");
  });
});

describe("invitation links", () => {
  it("carries the token in the path, encoded", () => {
    expect(inviteLink("abc+def/1", "https://tebos.example")).toBe("https://tebos.example/invite/abc%2Bdef%2F1");
    expect(matchPath("/invite/:token", "/invite/abc%2Bdef%2F1")).toEqual({ token: "abc+def/1" });
  });
});
