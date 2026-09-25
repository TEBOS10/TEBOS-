import { describe, expect, it } from "vitest";
import { validateProposals, type EvidenceForReasoning, type FindingsInput, type ProposedFinding } from "../../src/intelligence/findings";
import { prepareReviewRequest, REVIEW_SYSTEM_PROMPT, reviewChannels, reviewCoverage, reviewFingerprint } from "../../src/intelligence/review";
import type { ReasoningProvider, StructuredRequest } from "../../src/intelligence/provider";
import { IntelligenceWorker, type ClaimedAnalysis, type IntelligenceStore, type RunFinish } from "../../src/intelligence/worker";
import type { AcceptedFinding } from "../../src/intelligence/findings";

const base = { missingDescription: null, contentLocation: null, confidence: 0.95 } as const;
const system = (id: string, fact: string, retrievedAt = "2026-09-25T12:00:00.000Z"): EvidenceForReasoning => ({
  ...base, id, sourceId: "src-bame", sourceUri: "bame-ops:conn-1", state: "acquired", fact, excerpt: null,
  sourceType: "connected_system", sourceReliability: 0.95, retrievedAt, question: null,
});
const said = (id: string, question: string, fact: string): EvidenceForReasoning => ({
  ...base, id, sourceId: "src-interview", sourceUri: "interview:iv-1", state: "user_supplied", fact, excerpt: fact, confidence: null,
  sourceType: "user_statement", sourceReliability: 0.6, retrievedAt: "2026-09-25T10:00:00.000Z", question,
});
const web = (id: string, fact: string): EvidenceForReasoning => ({
  ...base, id, sourceId: "src-web", sourceUri: "https://bame.example/", state: "acquired", fact, excerpt: "<p>…</p>", confidence: 0.9,
  sourceType: "public_web", sourceReliability: 0.7, retrievedAt: "2026-09-24T10:00:00.000Z", question: null,
});

const evidence = [
  web("w1", "Home page offers brand and media services"),
  said("i1", "How do teams know what 'done' looks like?", "Finance and sales work from memory; only PR and tech have checklists."),
  system("s1", "Deliverable checklists exist for pr 21, tech 33; none are defined for finance, production, sales."),
  system("s2", "2 leads are not assigned to any department; the oldest has waited 6 days."),
];
const input = (ev = evidence): FindingsInput => ({
  business: { name: "BAME", website: "https://bame.example/", industry: "Marketing" },
  objective: null,
  userContext: [],
  evidence: ev,
  scanCoverage: reviewCoverage(reviewChannels(ev)),
  pagesRead: 3,
  mode: "review",
});
const proposal = (over: Partial<ProposedFinding>): ProposedFinding => ({
  title: "Finance, sales and production have no deliverable checklists",
  statement: "BAME defines no deliverable checklists for finance, production or sales; the operations lead says those teams work from memory.",
  kind: "interpretation",
  category: "missing_capability",
  impact_hypothesis: "Work in those departments may be finished inconsistently.",
  supporting_evidence: [],
  contradicting_evidence: [],
  missing_information: [],
  ...over,
});

describe("business review request", () => {
  const { request, refs } = prepareReviewRequest(input());
  const refOf = (id: string) => [...refs].find(([, e]) => e.id === id)![0];

  it("puts measured figures first, then what people said, then the website, each labelled by channel", () => {
    expect([...refs.values()].map((e) => e.id)).toEqual(["s1", "s2", "i1", "w1"]);
    expect(request.prompt).toContain(`${refOf("s1")} [CONNECTED SYSTEM, measured 2026-09-25] bame-ops:conn-1: fact="Deliverable checklists`);
    expect(request.prompt).toContain(`${refOf("i1")} [INTERVIEW, asked "How do teams know what 'done' looks like?"]`);
    expect(request.prompt).toContain(`${refOf("w1")} [WEBSITE]`);
    expect(request.prompt).toContain("Channels with evidence: connected systems, interviews/statements, website");
    expect(request.prompt).not.toMatch(/src-bame|src-interview/); // no database ids reach the model
  });

  it("keeps the system prompt fixed so it caches, and tells the model where absence can be observed", () => {
    expect(request.system).toBe(REVIEW_SYSTEM_PROMPT);
    expect(REVIEW_SYSTEM_PROMPT).toContain("Something is absent only if a connected-system figure records it");
  });

  it("measures coverage as the share of channels TEBOS has evidence from", () => {
    expect(reviewCoverage(reviewChannels(evidence))).toBe(1);
    expect(reviewCoverage(reviewChannels([evidence[2]!]))).toBeCloseTo(1 / 3);
  });
});

describe("business review validation", () => {
  const { refs } = prepareReviewRequest(input());
  const refOf = (id: string) => [...refs].find(([, e]) => e.id === id)![0];
  const run = (p: ProposedFinding) => validateProposals({ findings: [p] }, refs, input());

  it("keeps an absence as an interpretation when a connected system measured it, and says where", () => {
    const { accepted } = run(proposal({ supporting_evidence: [refOf("s1"), refOf("i1")] }));
    expect(accepted[0]!.kind).toBe("interpretation");
    expect(accepted[0]!.missingInformation).toContain("Measured in bame-ops:conn-1 only; anything kept outside it is not counted");
    expect(accepted[0]!.confidenceComponents).toMatchObject({ method: "findings.review.v1" });
  });

  it("does not accept an absence backed only by what someone said, or by an unrelated figure", () => {
    const onlySaid = run(proposal({ supporting_evidence: [refOf("i1")] })).accepted[0]!;
    expect(onlySaid.kind).toBe("hypothesis");
    expect(onlySaid.missingInformation).toContain("Absence not verified: no connected system records it; confirm with the business");
    expect(onlySaid.confidence).toBeLessThanOrEqual(0.5);

    // A figure that states no absence doesn't make the claim measured.
    const positive = [system("s3", "BAME has 4 leads in total, 4 in the last 30 days.")];
    const p = prepareReviewRequest(input(positive));
    const unrelated = validateProposals({ findings: [proposal({ supporting_evidence: ["E1"] })] }, p.refs, input(positive)).accepted[0]!;
    expect(unrelated.kind).toBe("hypothesis");
  });

  it("weights confidence by each source's recorded reliability: a measured figure beats a statement", () => {
    const [fig, stmt] = [
      run(proposal({ title: "Leads wait", statement: "Two leads have waited up to 6 days for a department.", supporting_evidence: [refOf("s2")] })).accepted[0]!,
      run(proposal({ title: "Teams work from memory", statement: "Finance and sales work from memory.", supporting_evidence: [refOf("i1")] })).accepted[0]!,
    ];
    expect(fig.confidence).toBeGreaterThan(stmt.confidence);
  });

  it("treats a figure older than 30 days as dated", () => {
    const old = [system("s1", "2 leads are waiting.", "2026-07-01T00:00:00.000Z")];
    const fresh = [system("s1", "2 leads are waiting.", new Date().toISOString())];
    const score = (ev: EvidenceForReasoning[]) =>
      validateProposals({ findings: [proposal({ title: "Leads wait", statement: "Two leads are waiting.", supporting_evidence: ["E1"] })] }, prepareReviewRequest(input(ev)).refs, input(ev)).accepted[0]!.confidence;
    expect(score(old)).toBeLessThan(score(fresh));
  });
});

describe("review fingerprint", () => {
  it("ignores when a figure was re-recorded, but changes when a figure, answer or page changes", () => {
    const f = reviewFingerprint(evidence);
    expect(reviewFingerprint([...evidence].reverse())).toBe(f);
    expect(reviewFingerprint(evidence.map((e) => ({ ...e, id: `${e.id}-again`, retrievedAt: "2026-09-26T12:00:00.000Z" })))).toBe(f);
    expect(reviewFingerprint([...evidence.slice(0, 3), system("s2", "Every lead is assigned to a department.")])).not.toBe(f);
    expect(reviewFingerprint([...evidence, said("i2", "Who approves invoices?", "The owner, weekly.")])).not.toBe(f);
  });
});

describe("intelligence worker: business reviews", () => {
  class ReviewStore implements IntelligenceStore {
    reviews: ClaimedAnalysis[] = [{ runId: "run-r", scanId: null, orgId: "org", businessId: "biz" }];
    lastFingerprint: string | null = null;
    saved: AcceptedFinding[] = [];
    finish: RunFinish | null = null;
    async claimNextScan() { return null; }
    async loadInput(): Promise<FindingsInput> { throw new Error("not a scan"); }
    async claimNextReview() { return this.reviews.shift() ?? null; }
    async loadReviewInput() { return { input: input(), lastFingerprint: this.lastFingerprint }; }
    async saveFindings(_c: ClaimedAnalysis, f: AcceptedFinding[]) { this.saved.push(...f); return f.map((_, i) => `f-${i}`); }
    async recordToolCall() {}
    async finishRun(_c: ClaimedAnalysis, f: RunFinish) { this.finish = f; }
  }
  const provider = (findings: unknown[]): ReasoningProvider & { requests: StructuredRequest[] } => {
    const requests: StructuredRequest[] = [];
    return { name: "fake", requests, async structured(r) { requests.push(r); return { value: { findings }, provider: "fake", model: "m", usage: { inputTokens: 1, outputTokens: 1 } }; } };
  };

  it("reviews a business when no scan is waiting, and records the evidence fingerprint", async () => {
    const store = new ReviewStore();
    const { refs } = prepareReviewRequest(input());
    const s1 = [...refs].find(([, e]) => e.id === "s1")![0];
    const p = provider([proposal({ supporting_evidence: [s1] })]);
    const report = await new IntelligenceWorker(store, p, { workerId: "w" }).runOnce();
    expect(report).toMatchObject({ kind: "review", scanId: null, businessId: "biz", status: "succeeded", findings: 1 });
    expect(p.requests[0]!.system).toBe(REVIEW_SYSTEM_PROMPT);
    expect(store.saved[0]!.supporting.map((e) => e.id)).toEqual(["s1"]);
    expect(store.finish!.output.fingerprint).toBe(reviewFingerprint(evidence));
  });

  it("makes no model call when nothing changed since the last review", async () => {
    const store = new ReviewStore();
    store.lastFingerprint = reviewFingerprint(evidence);
    const p = provider([]);
    const report = await new IntelligenceWorker(store, p, { workerId: "w" }).runOnce();
    expect(p.requests).toHaveLength(0);
    expect(report).toMatchObject({ kind: "review", status: "succeeded", findings: 0 });
    expect(store.finish!.output).toMatchObject({ unchanged: true, fingerprint: store.lastFingerprint });
  });

  it("does nothing when the store has no reviews to offer", async () => {
    const store = new ReviewStore();
    store.reviews = [];
    expect(await new IntelligenceWorker(store, provider([]), { workerId: "w" }).runOnce()).toBeNull();
  });
});
