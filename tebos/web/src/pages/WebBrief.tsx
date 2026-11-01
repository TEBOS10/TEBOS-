// The client's website brief (spec §5; migration web_delivery_intake): written by the client in their own account,
// submitted once it holds what TEBOS needs to start, then fixed until TEBOS reopens it with a reason. Contact details
// are not asked for: they run through the client's TEBOS account. The database refuses personal details and secrets.
import { useState } from "react";
import {
  INTAKE_REQUIRED, intakeMissing, LAUNCH_FEATURES, PRIMARY_OBJECTIVES, VISUAL_DIRECTIONS, type IntakeAnswers, type VisualDirection,
} from "@core/web-delivery";
import { Badge, Card, ErrorNote, Field } from "../components/ui";
import { useSignedIn } from "../lib/session";
import { lines, reopenIntake, saveIntake, type ProjectFile } from "../lib/webDeliveryData";

export function BriefForm({ f, canWrite, onDone }: { f: ProjectFile; canWrite: boolean; onDone: () => void }) {
  const { db } = useSignedIn();
  const saved = (f.intake?.answers ?? {}) as IntakeAnswers;
  const [a, setA] = useState<IntakeAnswers>(saved);
  const [pages, setPages] = useState((saved.pages ?? []).join("\n"));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (f.intake?.status === "submitted") return <BriefSummary f={f} />;
  const current: IntakeAnswers = { ...a, pages: lines(pages) };
  const missing = intakeMissing(current);
  const text = (k: keyof IntakeAnswers) => ({ value: (a[k] as string | undefined) ?? "", onChange: (e: { target: { value: string } }) => setA({ ...a, [k]: e.target.value }) });
  async function save(submit: boolean) {
    setBusy(true); setError(null); setNote(null);
    try {
      await saveIntake(db, f.project, f.intake, current, submit);
      setNote(submit ? "Submitted. TEBOS writes your scope from it next." : "Saved as a draft.");
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (!canWrite) return <Card title="Your brief"><p className="muted">Your organisation's admin or an operator fills in the brief.</p></Card>;
  return (
    <Card title="Your brief" subtitle="Tell TEBOS what the website is for. Save as you go; submit when it's complete. Please don't include personal phone numbers, emails or passwords.">
      {f.intake?.reopen_reason && <p className="note" role="note"><strong>TEBOS asked:</strong> {f.intake.reopen_reason}</p>}
      <form className="form" aria-label="Your brief" onSubmit={(e) => { e.preventDefault(); void save(true); }}>
        <h3 className="web-brief-h">Your business</h3>
        <Field label="Business name"><input className="input" {...text("business_name")} /></Field>
        <Field label="Industry"><input className="input" {...text("industry")} /></Field>
        <Field label="Where your customers are"><input className="input" placeholder="e.g. Johannesburg North" {...text("target_market")} /></Field>
        <Field label="Your current website, if any"><input className="input" type="url" placeholder="https://" {...text("existing_website")} /></Field>
        <h3 className="web-brief-h">What it's for</h3>
        <Field label="Main goal">
          <select className="input" value={a.objective ?? ""} onChange={(e) => setA({ ...a, objective: e.target.value })}>
            <option value="">Choose one</option>
            {Object.entries(PRIMARY_OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Who it's for"><textarea className="input" rows={2} {...text("audience")} /></Field>
        <Field label="What visitors should do first"><input className="input" placeholder="e.g. Request a call-out" {...text("first_action")} /></Field>
        <Field label="The biggest problem today"><textarea className="input" rows={2} {...text("current_problem")} /></Field>
        <Field label="How you'll know it works"><input className="input" placeholder="e.g. Ten bookings a month" {...text("success_measure")} /></Field>
        <Field label="Websites you like, and why"><textarea className="input" rows={2} {...text("references")} /></Field>
        <h3 className="web-brief-h">Pages and features</h3>
        <Field label="Pages" hint="One per line."><textarea className="input" rows={3} value={pages} onChange={(e) => setPages(e.target.value)} /></Field>
        <fieldset className="web-checks">
          <legend>Needed at launch</legend>
          {Object.entries(LAUNCH_FEATURES).map(([k, v]) => (
            <label key={k}><input type="checkbox" checked={(a.launch_features ?? []).includes(k)}
              onChange={(e) => setA({ ...a, launch_features: e.target.checked ? [...(a.launch_features ?? []), k] : (a.launch_features ?? []).filter((x) => x !== k) })} /> {v}</label>
          ))}
        </fieldset>
        <Field label="What can wait for later"><textarea className="input" rows={2} {...text("later_features")} /></Field>
        <h3 className="web-brief-h">Look and feel</h3>
        <Field label="Visual direction">
          <select className="input" value={a.visual_direction ?? ""} onChange={(e) => setA({ ...a, visual_direction: e.target.value as VisualDirection })}>
            <option value="">Choose one</option>
            {Object.entries(VISUAL_DIRECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Your brand colours"><input className="input" {...text("brand_colours")} /></Field>
        <Field label="Styles you dislike"><input className="input" {...text("dislikes")} /></Field>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={a.has_logo ?? false} onChange={(e) => setA({ ...a, has_logo: e.target.checked })} /> We have a logo</label>
        <h3 className="web-brief-h">Content and timing</h3>
        <Field label="What content you have ready" hint="Text, photos, prices, FAQs. TEBOS lists anything still needed."><textarea className="input" rows={2} {...text("content_notes")} /></Field>
        <Field label="Target launch date"><input className="input" type="date" {...text("launch_date")} /></Field>
        <Field label="Monthly running costs you're comfortable with" hint="Hosting, domain and any paid services you'd pay for. Nothing is set up without your approval."><input className="input" {...text("recurring_budget")} /></Field>
        <Field label="Who approves for you" hint="A role, e.g. the owner."><input className="input" {...text("approver_role")} /></Field>
        <fieldset className="web-checks">
          <legend>Confirmations</legend>
          <label><input type="checkbox" checked={a.confirmations?.rights ?? false} onChange={(e) => setA({ ...a, confirmations: { ...a.confirmations, rights: e.target.checked } })} /> We hold the rights to the logos, photos, fonts and text we send</label>
          <label><input type="checkbox" checked={a.confirmations?.privacy ?? false} onChange={(e) => setA({ ...a, confirmations: { ...a.confirmations, privacy: e.target.checked } })} /> Anything the site collects from visitors has a stated purpose</label>
        </fieldset>
        {missing.length > 0 && <p className="muted" data-testid="brief-missing">Still needed to submit: {missing.map((m) => INTAKE_REQUIRED[m]).join("; ")}.</p>}
        <ErrorNote error={error} title="Not saved" />
        {note && <p role="status">{note}</p>}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => void save(false)}>Save as a draft</button>
          <button className="btn btn-primary" disabled={busy || missing.length > 0}>Submit the brief</button>
        </div>
      </form>
    </Card>
  );
}

export function BriefSummary({ f, onReopen }: { f: ProjectFile; onReopen?: () => void }) {
  const { db } = useSignedIn();
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!f.intake) return <Card title="The client's brief"><p className="muted">The client hasn't started their brief yet. They fill it in under Your website.</p></Card>;
  const a = f.intake.answers as IntakeAnswers;
  const row = (label: string, v: string | undefined) => v ? <><dt>{label}</dt><dd>{v}</dd></> : null;
  return (
    <Card title={onReopen ? "The client's brief" : "Your brief"} actions={<Badge tone={f.intake.status === "submitted" ? "good" : "neutral"}>{f.intake.status === "submitted" ? `Submitted${f.intake.submitted_at ? ` ${f.intake.submitted_at.slice(0, 10)}` : ""}` : "Draft"}</Badge>}>
      <dl className="web-scope" data-testid="brief-summary">
        {row("Business", a.business_name)}
        {row("Goal", a.objective ? PRIMARY_OBJECTIVES[a.objective as keyof typeof PRIMARY_OBJECTIVES] : undefined)}
        {row("For", a.audience)}
        {row("First action", a.first_action)}
        {row("Success", a.success_measure)}
        {row("Pages", a.pages?.join(", "))}
        {row("At launch", a.launch_features?.map((k) => LAUNCH_FEATURES[k as keyof typeof LAUNCH_FEATURES] ?? k).join(", "))}
        {row("Later", a.later_features)}
        {row("Look", a.visual_direction ? VISUAL_DIRECTIONS[a.visual_direction] : undefined)}
        {row("Likes", a.references)}
        {row("Dislikes", a.dislikes)}
        {row("Content ready", a.content_notes)}
        {row("Launch", a.launch_date)}
        {row("Running costs", a.recurring_budget)}
      </dl>
      {onReopen && f.intake.status === "submitted" && (asking ? (
        <form className="form" aria-label="Reopen the brief" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try { await reopenIntake(db, f.intake!.id, reason); onReopen(); } catch (err) { setError(err); }
        }}>
          <Field label="What the client should add or change"><textarea className="input" rows={2} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <ErrorNote error={error} title="Not reopened" />
          <button className="btn btn-primary">Reopen for the client</button>
        </form>
      ) : <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setAsking(true)}>Ask the client to change it</button>)}
    </Card>
  );
}
