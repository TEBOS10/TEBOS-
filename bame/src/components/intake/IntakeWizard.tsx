"use client";

import { useEffect, useMemo, useState } from "react";
import { INTAKE_SECTIONS, type IntakeField } from "@/lib/intake-schema";

const STORAGE_KEY = "bame_intake_draft_v1";

const CONTACT_TYPE_OPTIONS = [
  { value: "athlete", label: "An athlete" },
  { value: "event", label: "A sports event organiser" },
];

type Values = Record<string, string | boolean>;

function Field({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const base =
    "w-full rounded-lg border border-[var(--bame-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--bame-accent)]";

  if (field.name === "contact_type") {
    return (
      <div className={field.full ? "md:col-span-2" : ""}>
        <span className="mb-2 block text-sm font-medium">
          {field.label} {field.required && <span className="text-[var(--bame-accent)]">*</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange("contact_type", opt.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                value === opt.value
                  ? "bg-[var(--bame-accent)] text-[#1a1608]"
                  : "text-[var(--bame-muted)] ring-1 ring-[var(--bame-line)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className={`flex items-start gap-2 text-sm ${field.full ? "md:col-span-2" : ""}`}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.name, e.target.checked)}
          className="mt-0.5"
        />
        <span>
          {field.label} {field.required && <span className="text-[var(--bame-accent)]">*</span>}
        </span>
      </label>
    );
  }

  return (
    <label className={`flex flex-col gap-1 text-sm ${field.full ? "md:col-span-2" : ""}`}>
      <span>
        {field.label} {field.required && <span className="text-[var(--bame-accent)]">*</span>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          rows={3}
          className={base}
          placeholder={field.placeholder}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          className={base}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">Select</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          className={base}
          placeholder={field.placeholder}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      )}
      {field.help && <span className="text-xs text-[var(--bame-muted)]">{field.help}</span>}
    </label>
  );
}

export default function IntakeWizard({ initialValues }: { initialValues: Values }) {
  const [values, setValues] = useState<Values>(initialValues);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time draft restore from localStorage on mount
      if (saved) setValues((v) => ({ ...JSON.parse(saved), ...v }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      // ignore
    }
  }, [values]);

  const visibleSections = useMemo(
    () => INTAKE_SECTIONS.filter((s) => !s.showIf || s.showIf(values)),
    [values],
  );
  const section = visibleSections[step];
  const progress = Math.round(((step + 1) / visibleSections.length) * 100);

  function onChange(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function validateSection(): string | null {
    for (const f of section.fields) {
      if (f.required && !values[f.name]) {
        return `Please complete "${f.label}" before continuing.`;
      }
    }
    return null;
  }

  function next() {
    const err = validateSection();
    if (err) {
      setStatus({ kind: "error", message: err });
      return;
    }
    setStatus({ kind: "idle" });
    setStep((s) => Math.min(s + 1, visibleSections.length - 1));
  }

  function back() {
    setStatus({ kind: "idle" });
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    const err = validateSection();
    if (err) {
      setStatus({ kind: "error", message: err });
      return;
    }
    setSubmitting(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Submission failed.");
      localStorage.removeItem(STORAGE_KEY);
      setStatus({ kind: "success", message: `Diagnostic received. Reference: ${json.id}.` });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  }

  if (status.kind === "success") {
    return (
      <div className="rounded-2xl border border-[var(--bame-line)] bg-[var(--bame-panel)] p-8 text-center">
        <p className="bame-eyebrow">Diagnostic submitted</p>
        <h2 className="mt-3 text-2xl">Thank you — BAME has your context.</h2>
        <p className="mt-3 text-sm text-[var(--bame-muted)]">{status.message}</p>
        <p className="mt-3 text-sm text-[var(--bame-muted)]">
          This does not constitute final approval of any commercial, legal, sponsorship or representation
          arrangement. A BAME administrator will follow up with a reasoned recommendation.
        </p>
      </div>
    );
  }

  if (!section) return null;

  return (
    <div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--bame-line)]">
        <div className="h-full bg-[var(--bame-accent)] transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="bame-eyebrow">
        Step {step + 1} of {visibleSections.length}
      </p>
      <h2 className="mt-2 text-2xl">{section.title}</h2>
      {section.description && <p className="mt-2 text-sm text-[var(--bame-muted)]">{section.description}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {section.fields.map((f) => (
          <Field key={f.name} field={f} value={values[f.name]} onChange={onChange} />
        ))}
      </div>

      {status.kind === "error" && <p className="mt-4 text-sm text-red-400">{status.message}</p>}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="rounded-full px-5 py-2.5 text-sm font-medium ring-1 ring-[var(--bame-line)] disabled:opacity-40"
        >
          Back
        </button>
        {step < visibleSections.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-[var(--bame-accent)] px-6 py-2.5 text-sm font-semibold text-[#1a1608]"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-full bg-[var(--bame-accent)] px-6 py-2.5 text-sm font-semibold text-[#1a1608] disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit diagnostic"}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-[var(--bame-muted)]">Your progress saves automatically on this device.</p>
    </div>
  );
}
