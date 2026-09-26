// The intelligence worker: turns evidence into findings. Two kinds of analysis:
//   scan    — one finished website scan's evidence
//   review  — everything held about a business across channels (review.ts),
//             run when interview answers or connected-system figures change
//
//   claim a completed/partial scan that has no findings run yet (else a business due a review)
//   -> assemble the minimum context: business, objective, user context, evidence
//   -> ask the reasoning provider for proposed findings
//   -> validate deterministically (citations, absence claims, confidence)
//   -> store accepted findings with their evidence links; record what was rejected and why
//
// No evidence, no model call: a scan with nothing obtained produces no
// findings and costs nothing.

import { ReasoningError, type ReasoningProvider } from "./provider";
import { prepareFindingsRequest, validateProposals, type AcceptedFinding, type FindingsInput, type RejectedFinding } from "./findings";
import { prepareReviewRequest, reviewFingerprint } from "./review";

export interface ClaimedAnalysis {
  kind?: "scan" | "review";
  runId: string;
  /** Null for a business review. */
  scanId: string | null;
  orgId: string;
  businessId: string;
}

export interface ReviewInput {
  input: FindingsInput;
  /** Fingerprint of the evidence the last successful review read, if any. */
  lastFingerprint: string | null;
}

export interface RunFinish {
  status: "succeeded" | "failed";
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  output: Record<string, unknown>;
  errorDetail: string | null;
}

export interface IntelligenceStore {
  /** Atomically claim a finished scan by creating its business_intelligence run. */
  claimNextScan(workerId: string): Promise<ClaimedAnalysis | null>;
  loadInput(claim: ClaimedAnalysis): Promise<FindingsInput>;
  /** Atomically claim a business due a review (new statements or connected-system figures since the last one). */
  claimNextReview?(workerId: string): Promise<ClaimedAnalysis | null>;
  loadReviewInput?(claim: ClaimedAnalysis): Promise<ReviewInput>;
  /** For a review, also supersedes the previous reviews' findings that nothing depends on. */
  saveFindings(claim: ClaimedAnalysis, findings: AcceptedFinding[]): Promise<string[]>;
  recordToolCall(
    claim: ClaimedAnalysis,
    call: { status: "succeeded" | "failed"; inputSummary: Record<string, unknown>; outputSummary: Record<string, unknown> | null; errorDetail: string | null; latencyMs: number },
  ): Promise<void>;
  finishRun(claim: ClaimedAnalysis, finish: RunFinish): Promise<void>;
}

export interface AnalysisReport {
  kind: "scan" | "review";
  businessId: string;
  scanId: string | null;
  runId: string;
  status: "succeeded" | "failed";
  findings: number;
  rejected: RejectedFinding[];
  detail: string | null;
}

export class IntelligenceWorker {
  constructor(
    private readonly store: IntelligenceStore,
    private readonly provider: ReasoningProvider,
    private readonly options: { workerId: string; log?: (e: Record<string, unknown>) => void },
  ) {}

  private log(e: Record<string, unknown>) {
    this.options.log?.(e);
  }

  async runOnce(): Promise<AnalysisReport | null> {
    const scan = await this.store.claimNextScan(this.options.workerId);
    if (scan) return this.analyse({ ...scan, kind: "scan" });
    const review = this.store.claimNextReview ? await this.store.claimNextReview(this.options.workerId) : null;
    return review ? this.analyse({ ...review, kind: "review" }) : null;
  }

  private async analyse(claim: ClaimedAnalysis & { kind: "scan" | "review" }): Promise<AnalysisReport> {
    const isReview = claim.kind === "review";
    this.log({ event: "analysis.started", kind: claim.kind, scanId: claim.scanId, businessId: claim.businessId, runId: claim.runId });
    const report = (status: "succeeded" | "failed", findings: number, rejected: RejectedFinding[], detail: string | null): AnalysisReport =>
      ({ kind: claim.kind, businessId: claim.businessId, scanId: claim.scanId, runId: claim.runId, status, findings, rejected, detail });

    let input: FindingsInput;
    let fingerprint: string | null = null;
    try {
      if (isReview) {
        const loaded = await this.store.loadReviewInput!(claim);
        input = { ...loaded.input, mode: "review" };
        fingerprint = reviewFingerprint(input.evidence);
        if (fingerprint === loaded.lastFingerprint) {
          const detail = "Nothing new since the last review: the evidence it would read is unchanged";
          await this.store.finishRun(claim, { status: "succeeded", provider: null, model: null, tokensIn: 0, tokensOut: 0, output: { findings: 0, detail, fingerprint, unchanged: true }, errorDetail: null });
          return report("succeeded", 0, [], detail);
        }
      } else {
        input = await this.store.loadInput(claim);
      }
    } catch (err) {
      return this.fail(claim, null, null, `Could not load the ${isReview ? "business's" : "scan's"} evidence: ${(err as Error).message}`);
    }

    const obtained = input.evidence.filter((e) => e.fact !== null).length;
    if (obtained === 0) {
      const detail = `The ${isReview ? "business" : "scan"} holds no obtained evidence, so there is nothing to interpret`;
      await this.store.finishRun(claim, { status: "succeeded", provider: null, model: null, tokensIn: 0, tokensOut: 0, output: { findings: 0, detail, ...(fingerprint ? { fingerprint } : {}) }, errorDetail: null });
      return report("succeeded", 0, [], detail);
    }

    const prepared = isReview ? prepareReviewRequest(input) : prepareFindingsRequest(input);
    const started = Date.now();
    let response;
    try {
      response = await this.provider.structured(prepared.request);
    } catch (err) {
      const detail = err instanceof ReasoningError ? `${err.kind}: ${err.message}` : `Reasoning failed: ${(err as Error).message}`;
      await this.store.recordToolCall(claim, {
        status: "failed",
        inputSummary: { provider: this.provider.name, analysis: claim.kind, evidenceItems: prepared.refs.size, evidenceOmitted: prepared.omitted },
        outputSummary: null,
        errorDetail: detail,
        latencyMs: Date.now() - started,
      });
      return this.fail(claim, null, null, detail);
    }

    const { accepted, rejected } = validateProposals(response.value, prepared.refs, input);
    await this.store.recordToolCall(claim, {
      status: "succeeded",
      inputSummary: { provider: response.provider, model: response.model, analysis: claim.kind, evidenceItems: prepared.refs.size, evidenceOmitted: prepared.omitted },
      outputSummary: { proposed: accepted.length + rejected.length, accepted: accepted.length, rejected: rejected.length },
      errorDetail: null,
      latencyMs: Date.now() - started,
    });

    let ids: string[];
    try {
      ids = await this.store.saveFindings(claim, accepted);
    } catch (err) {
      return this.fail(claim, response.model, response.usage, `Findings were rejected by the database: ${(err as Error).message}`);
    }

    const output = {
      findings: ids.length,
      findingIds: ids,
      rejected,
      adjustments: accepted.flatMap((f) => f.adjustments.map((a) => `${f.title}: ${a}`)),
      evidenceOmitted: prepared.omitted,
      ...(fingerprint ? { fingerprint } : {}),
    };
    await this.store.finishRun(claim, {
      status: "succeeded",
      provider: response.provider,
      model: response.model,
      tokensIn: response.usage.inputTokens,
      tokensOut: response.usage.outputTokens,
      output,
      errorDetail: null,
    });
    this.log({ event: "analysis.finished", kind: claim.kind, scanId: claim.scanId, businessId: claim.businessId, findings: ids.length, rejected: rejected.length, model: response.model });
    return report("succeeded", ids.length, rejected, null);
  }

  private async fail(
    claim: ClaimedAnalysis,
    model: string | null,
    usage: { inputTokens: number; outputTokens: number } | null,
    detail: string,
  ): Promise<AnalysisReport> {
    this.log({ event: "analysis.failed", kind: claim.kind ?? "scan", scanId: claim.scanId, businessId: claim.businessId, detail });
    await this.store.finishRun(claim, {
      status: "failed",
      provider: model ? this.provider.name : null,
      model,
      tokensIn: usage?.inputTokens ?? null,
      tokensOut: usage?.outputTokens ?? null,
      output: { findings: 0 },
      errorDetail: detail,
    });
    return { kind: claim.kind ?? "scan", businessId: claim.businessId, scanId: claim.scanId, runId: claim.runId, status: "failed", findings: 0, rejected: [], detail };
  }
}
