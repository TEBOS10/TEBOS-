import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { explainError } from "../lib/errors";
import { pct, STATUS_TONE, statusLabel, type Tone } from "../lib/format";

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{statusLabel(status)}</Badge>;
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {children && <div className="page-lead">{children}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={16} aria-hidden /> {label}…
    </div>
  );
}

export function ErrorNote({ error, title = "This couldn't be completed" }: { error: unknown; title?: string }) {
  if (!error) return null;
  const e = explainError(error);
  return (
    <div className="note note-bad" role="alert">
      <AlertTriangle size={16} aria-hidden />
      <div>
        <strong>{title}.</strong> {e.message}
        {e.detail && e.detail !== e.message && <div className="note-detail mono">{e.detail}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

const COMPONENT_LABELS: Record<string, string> = {
  coverage: "Coverage",
  sourceReliability: "Source reliability",
  recency: "Recency",
  corroboration: "Corroboration",
  extractionQuality: "Extraction quality",
  contradiction: "Contradiction",
};

/** Confidence is shown with what it is made of and what limits it — never as a bare score. */
export function ConfidencePanel({ score, components }: { score: number | string | null; components: unknown }) {
  const c = (components ?? {}) as Record<string, unknown>;
  const limiting = Array.isArray(c.limitingFactors) ? (c.limitingFactors as Array<{ component: string; explanation: string }>) : [];
  const parts = Object.keys(COMPONENT_LABELS).filter((k) => typeof c[k] === "number");
  return (
    <div className="confidence">
      <div className="confidence-head">
        <span className="confidence-score">{pct(score)}</span>
        <span className="muted">confidence in the evidence — not a score of the business</span>
      </div>
      {parts.length > 0 && (
        <dl className="confidence-parts">
          {parts.map((k) => (
            <div key={k}>
              <dt>{COMPONENT_LABELS[k]}</dt>
              <dd>
                <span className="bar" aria-hidden>
                  <span style={{ width: `${Math.round(Number(c[k]) * 100)}%` }} className={k === "contradiction" ? "bar-bad" : ""} />
                </span>
                <span className="mono">{pct(c[k] as number)}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {limiting.length > 0 && (
        <ul className="limits">
          {limiting.map((l) => (
            <li key={l.component}>{l.explanation}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
