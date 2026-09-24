// Confidence model (dossier §14).
//
// Confidence describes evidence quality, never business quality. The score
// is always returned with its components and the factors that limit it, so
// the interface can show *why* confidence is what it is. There is no opaque
// single "health score".

export interface ConfidenceInputs {
  /** 0..1 — how reliable the sources are (weighted by what they contribute). */
  sourceReliability: number;
  /** 0..1 — share of the intended scope actually covered by evidence. */
  coverage: number;
  /** 0..1 — how fresh the evidence is. */
  recency: number;
  /** 0..1 — how far independent sources agree. */
  corroboration: number;
  /** 0..1 — how cleanly content was extracted. */
  extractionQuality: number;
  /** 0..1 — how much of the evidence contradicts itself (penalty). */
  contradiction: number;
}

export type ConfidenceComponent = keyof ConfidenceInputs;

export interface Confidence {
  score: number; // 0..1, rounded to 3 dp
  components: ConfidenceInputs;
  limitingFactors: Array<{ component: ConfidenceComponent; value: number; explanation: string }>;
}

export const CONFIDENCE_WEIGHTS: Record<Exclude<ConfidenceComponent, "contradiction">, number> = {
  coverage: 0.3,
  sourceReliability: 0.25,
  extractionQuality: 0.2,
  corroboration: 0.15,
  recency: 0.1,
};

const EXPLANATIONS: Record<ConfidenceComponent, string> = {
  sourceReliability: "Sources are of limited reliability",
  coverage: "Evidence covers only part of the intended scope",
  recency: "Evidence is not recent",
  corroboration: "Few independent sources agree",
  extractionQuality: "Content was only partly extractable",
  contradiction: "Sources contradict each other",
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function scoreConfidence(raw: ConfidenceInputs): Confidence {
  const c: ConfidenceInputs = {
    sourceReliability: clamp01(raw.sourceReliability),
    coverage: clamp01(raw.coverage),
    recency: clamp01(raw.recency),
    corroboration: clamp01(raw.corroboration),
    extractionQuality: clamp01(raw.extractionQuality),
    contradiction: clamp01(raw.contradiction),
  };

  // No coverage means no evidence: confidence is zero regardless of the rest.
  let score = 0;
  if (c.coverage > 0) {
    for (const [k, w] of Object.entries(CONFIDENCE_WEIGHTS) as Array<[keyof typeof CONFIDENCE_WEIGHTS, number]>) {
      score += c[k] * w;
    }
    score *= 1 - c.contradiction;
  }

  const limitingFactors = (Object.keys(c) as ConfidenceComponent[])
    .filter((k) => (k === "contradiction" ? c[k] > 0.2 : c[k] < 0.5))
    .map((k) => ({ component: k, value: c[k], explanation: EXPLANATIONS[k] }));

  return { score: round3(score), components: c, limitingFactors };
}

export function formatConfidence(score: number | null | undefined): string {
  return score == null ? "confidence not assessed" : `confidence ${Math.round(clamp01(score) * 100)}%`;
}
