// The intelligence worker: turns a finished scan's evidence into findings.
//
//   claim a completed/partial scan that has no findings run yet
//   -> assemble the minimum context: business, objective, user context, evidence
//   -> ask the reasoning provider for proposed findings
//   -> validate deterministically (citations, absence claims, confidence)
//   -> store accepted findings with their evidence links; record what was rejected and why
//
// No evidence, no model call: a scan with nothing obtained produces no
// findings and costs nothing.

import { ReasoningError, type ReasoningProvider } from "./provider";
import { prepareFindingsRequest, validateProposals, type AcceptedFinding, type FindingsInput, type RejectedFinding } from "./findings";

export interface ClaimedAnalysis {
  runId: string;
  scanId: string;
  orgId: string;
  businessId: string;
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
  saveFindings(claim: ClaimedAnalysis, findings: AcceptedFinding[]): Promise<string[]>;
  recordToolCall(
    claim: ClaimedAnalysis,
    call: { status: "succeeded" | "failed"; inputSummary: Record<string, unknown>; outputSummary: Record<string, unknown> | null; errorDetail: string | null; latencyMs: number },
  ): Promise<void>;
  finishRun(claim: ClaimedAnalysis, finish: RunFinish): Promise<void>;
}

export interface AnalysisReport {
  scanId: string;
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
    const claim = await this.store.claimNextScan(this.options.workerId);
    if (!claim) return null;
    this.log({ event: "analysis.started", scanId: claim.scanId, runId: claim.runId });

    let input: FindingsInput;
    try {
      input = await this.store.loadInput(claim);
    } catch (err) {
      return this.fail(claim, null, null, `Could not load the scan's evidence: ${(err as Error).message}`);
    }

    const obtained = input.evidence.filter((e) => e.fact !== null).length;
    if (obtained === 0) {
      const detail = "The scan holds no obtained evidence, so there is nothing to interpret";
      await this.store.finishRun(claim, { status: "succeeded", provider: null, model: null, tokensIn: 0, tokensOut: 0, output: { findings: 0, detail }, errorDetail: null });
      return { scanId: claim.scanId, runId: claim.runId, status: "succeeded", findings: 0, rejected: [], detail };
    }

    const prepared = prepareFindingsRequest(input);
    const started = Date.now();
    let response;
    try {
      response = await this.provider.structured(prepared.request);
    } catch (err) {
      const detail = err instanceof ReasoningError ? `${err.kind}: ${err.message}` : `Reasoning failed: ${(err as Error).message}`;
      await this.store.recordToolCall(claim, {
        status: "failed",
        inputSummary: { provider: this.provider.name, evidenceItems: prepared.refs.size, evidenceOmitted: prepared.omitted },
        outputSummary: null,
        errorDetail: detail,
        latencyMs: Date.now() - started,
      });
      return this.fail(claim, null, null, detail);
    }

    const { accepted, rejected } = validateProposals(response.value, prepared.refs, input);
    await this.store.recordToolCall(claim, {
      status: "succeeded",
      inputSummary: { provider: response.provider, model: response.model, evidenceItems: prepared.refs.size, evidenceOmitted: prepared.omitted },
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
    this.log({ event: "analysis.finished", scanId: claim.scanId, findings: ids.length, rejected: rejected.length, model: response.model });
    return { scanId: claim.scanId, runId: claim.runId, status: "succeeded", findings: ids.length, rejected, detail: null };
  }

  private async fail(
    claim: ClaimedAnalysis,
    model: string | null,
    usage: { inputTokens: number; outputTokens: number } | null,
    detail: string,
  ): Promise<AnalysisReport> {
    this.log({ event: "analysis.failed", scanId: claim.scanId, detail });
    await this.store.finishRun(claim, {
      status: "failed",
      provider: model ? this.provider.name : null,
      model,
      tokensIn: usage?.inputTokens ?? null,
      tokensOut: usage?.outputTokens ?? null,
      output: { findings: 0 },
      errorDetail: detail,
    });
    return { scanId: claim.scanId, runId: claim.runId, status: "failed", findings: 0, rejected: [], detail };
  }
}
