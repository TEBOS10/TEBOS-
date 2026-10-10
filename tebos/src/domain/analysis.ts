// Whether TEBOS's analysis is running, read from its own recorded runs. Mirrors
// the worker's rules (src/intelligence/worker.ts): a run that failed because the
// reasoning service refused TEBOS's set-up or was down is marked providerFault,
// and the stage pauses. What clients read never names the service behind it.

export type ProviderFault = "misconfigured" | "provider_unavailable";

/** The neutral words stored on a run that failed through no fault of the business. */
export const PROVIDER_FAULT_DETAIL: Record<ProviderFault, string> = {
  misconfigured: "Analysis is paused: TEBOS's reasoning service refused its set-up. Nothing about this business caused it; TEBOS's team has to fix it.",
  provider_unavailable: "Analysis is paused: TEBOS's reasoning service was briefly unavailable. TEBOS tries again on its own.",
};

export interface AnalysisRun {
  agent_role: string;
  status: string;
  started_at: string;
  output_summary: unknown;
  error_detail?: string | null;
}

export function isProviderFault(run: AnalysisRun): boolean {
  const out = run.output_summary as { providerFault?: unknown } | null;
  return run.status === "failed" && out?.providerFault === true;
}

/**
 * Analysis is paused when the latest analysis run failed through a provider
 * fault. Returns when that started (the first fault in the current streak), or
 * null when the latest run isn't one.
 */
export function analysisPausedSince(runs: AnalysisRun[]): string | null {
  const analysis = runs
    .filter((r) => r.agent_role === "business_intelligence")
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  let since: string | null = null;
  for (const r of analysis) {
    if (!isProviderFault(r)) break;
    since = r.started_at;
  }
  return since;
}

/**
 * What to show for a run's failure. A provider fault always shows the neutral
 * words, including runs recorded before they were stored that way.
 */
export function runDetail(run: AnalysisRun): string | null {
  if (!isProviderFault(run)) return run.error_detail ?? null;
  const out = run.output_summary as { fault?: unknown };
  const fault: ProviderFault =
    out.fault === "provider_unavailable" || out.fault === "misconfigured" ? out.fault
    : run.error_detail?.startsWith("provider_unavailable") ? "provider_unavailable" : "misconfigured";
  return PROVIDER_FAULT_DETAIL[fault];
}
