import { describe, expect, it } from "vitest";
import { assessFindingSupport, explainAction, type EvidenceGraph, type EvidenceNode } from "../src";

const ev = (id: string, state: EvidenceNode["state"], over: Partial<EvidenceNode> = {}): EvidenceNode => ({
  id,
  businessId: "b1",
  sourceId: "s1",
  state,
  fact: state === "unavailable" ? null : `fact ${id}`,
  missingDescription: state === "unavailable" ? "Contact page could not be acquired (HTTP 503)" : null,
  excerpt: null,
  retrievedAt: null,
  ...over,
});

const graph: EvidenceGraph = {
  sources: new Map([["s1", { id: "s1", sourceType: "public_web", uri: "https://example.co.za/" }]]),
  evidence: new Map([
    ["e1", ev("e1", "acquired")],
    ["e2", ev("e2", "unavailable")],
    ["e3", ev("e3", "stale")],
    ["e4", ev("e4", "acquired")],
  ]),
  findings: new Map([
    ["f1", { id: "f1", businessId: "b1", title: "No enquiry capture", kind: "interpretation", status: "active", confidence: 0.6, missingInformation: ["CRM usage"] }],
  ]),
  links: [
    { findingId: "f1", evidenceId: "e1", relation: "supports" },
    { findingId: "f1", evidenceId: "e2", relation: "supports" },
    { findingId: "f1", evidenceId: "e3", relation: "supports" },
    { findingId: "f1", evidenceId: "e4", relation: "contradicts" },
  ],
  actions: new Map([["a1", { id: "a1", findingId: "f1", title: "Add enquiry form" }]]),
};

describe("evidence graph", () => {
  it("explains an action back to its sources", () => {
    const x = explainAction(graph, "a1")!;
    expect(x.because?.support).toEqual({ ok: true });
    expect(x.because?.supporting.map((c) => c.evidence.id)).toEqual(["e1", "e3"]);
    expect(x.because?.supporting[0]?.source?.uri).toBe("https://example.co.za/");
    expect(x.because?.supporting[1]?.caveat).toBe("stale");
    expect(x.because?.contradicting.map((c) => c.evidence.id)).toEqual(["e4"]);
  });

  it("shows evidence that was never obtained and says what is missing", () => {
    const x = explainAction(graph, "a1")!.because!;
    expect(x.unobtained.map((c) => c.evidence.id)).toEqual(["e2"]);
    expect(x.missing).toEqual(["CRM usage", "Contact page could not be acquired (HTTP 503)"]);
  });

  it("does not count unobtained evidence or another business's evidence as support", () => {
    const f = { id: "f9", businessId: "b1" };
    expect(assessFindingSupport(f, [{ findingId: "f9", evidenceId: "e2", relation: "supports" }], graph.evidence)).toMatchObject({
      ok: false,
      code: "TEBOS_FINDING_UNSUPPORTED",
    });
    const foreign = new Map([["z", ev("z", "acquired", { businessId: "b2" })]]);
    expect(assessFindingSupport(f, [{ findingId: "f9", evidenceId: "z", relation: "supports" }], foreign)).toMatchObject({ ok: false });
  });
});
