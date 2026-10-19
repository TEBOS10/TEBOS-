// The agent's office, slice 2: each deal's documents against the agency's own checklist, and the FFC path.
// On the founder's condition, nothing here stores, edits, signs or sends a legal document: it records which
// documents a deal has, where the agency keeps them (PropCtrl, Doxit, the agency file) and what is missing or due.
import {
  DEAL_GROUPS, ITEM_STATUSES, PPRA_CANDIDATE_STEPS, SOURCES_OF_RULES, STEP_STATUSES, checkDealItem, checkFfcStep, dealChecklist,
  type ChecklistRow, type DealItem, type FfcStep, type ItemStatus, type Listing, type StepStatus,
} from "@core/agent";
import type { Check } from "@core/rules";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorNote, Loading } from "../components/ui";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { addFfcSteps, deleteFfcStep, listFfcSteps, saveDealItem, saveFfcStep, type DealItemRow, type FfcStepRow } from "./agentData";

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_TONE: Record<ItemStatus, string> = { missing: "red", requested: "amber", received: "", checked: "green", not_applicable: "" };

export const toDealItem = (r: DealItemRow): DealItem => ({
  item: r.item, status: r.status as ItemStatus, dueOn: r.due_on, receivedOn: r.received_on, keptIn: r.kept_in, reason: r.reason, note: r.note,
});
const toStep = (r: FfcStepRow): FfcStep => ({
  id: r.id, position: r.position, title: r.title, source: r.source, status: r.status as StepStatus, dueOn: r.due_on, doneOn: r.done_on, evidence: r.evidence, note: r.note,
});

/** "12 of 36 in", for the listings table. */
export function checklistSummary(rows: DealItemRow[]): string {
  const c = dealChecklist(rows.map(toDealItem), today());
  return `${c.inHand} of ${c.applicable} in${c.overdue.length ? `, ${c.overdue.length} overdue` : ""}`;
}

async function attempt(check: Check | null, f: () => Promise<unknown>, setError: (e: unknown) => void) {
  setError(null);
  if (check && !check.ok) {
    setError(new Error(check.reason));
    return false;
  }
  try {
    await f();
    return true;
  } catch (e) {
    setError(e);
    return false;
  }
}

/** One deal's documents, grouped as on the agency's checklist. */
export function DealDocuments({ listing, rows, onChanged, onClose }: { listing: Listing; rows: DealItemRow[]; onChanged: () => void; onClose: () => void }) {
  const c = useMemo(() => dealChecklist(rows.map(toDealItem), today()), [rows]);
  const ids = useMemo(() => new Map(rows.map((r) => [r.item, r.id])), [rows]);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="pra-card" aria-label={`Documents for ${listing.ref}`} data-testid="deal-documents">
      <div className="pra-head">
        <div>
          <h2>{listing.ref}: documents</h2>
          <p>From the agency's Property Check list. This records where each document is and what's missing; the documents themselves stay in the agency's systems, untouched.</p>
        </div>
        <button className="pra-btn" onClick={onClose}>Close</button>
      </div>
      <p className="pra-text" data-testid="deal-documents-summary"><strong>{c.inHand} of {c.applicable}</strong> in hand{c.overdue.length ? `, ${c.overdue.length} overdue` : ""}.</p>
      {c.groups.map(({ group, rows: groupRows }) => (
        <div key={group}>
          <h3 className="pra-h3">{DEAL_GROUPS[group]}</h3>
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid={`documents-${group}`}>
              <tbody>{groupRows.map((r) => (
                editing === r.key
                  ? <tr key={r.key}><td colSpan={4}><ItemForm row={r} listing={listing} id={ids.get(r.key) ?? null} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} /></td></tr>
                  : <tr key={r.key}>
                      <td>{r.label}<br /><small className="pra-note">{SOURCES_OF_RULES[r.source]}</small></td>
                      <td><span className={`pra-tag ${r.overdue ? "red" : STATUS_TONE[r.entry.status]}`}>{ITEM_STATUSES[r.entry.status]}{r.overdue ? ", overdue" : ""}</span></td>
                      <td><small className="pra-note">{detail(r)}</small></td>
                      <td><button className="pra-btn" aria-label={`Update ${r.label}`} onClick={() => setEditing(r.key)}>Update</button></td>
                    </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function detail(r: ChecklistRow): string {
  const e = r.entry;
  if (e.status === "not_applicable") return e.reason ?? "";
  const parts = [e.receivedOn && `received ${e.receivedOn}`, e.keptIn && `kept in ${e.keptIn}`, e.dueOn && (e.status === "missing" || e.status === "requested") && `due ${e.dueOn}`];
  return parts.filter(Boolean).join(" · ");
}

function ItemForm({ row, listing, id, onDone, onCancel }: { row: ChecklistRow; listing: Listing; id: string | null; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const e = row.entry;
  const [status, setStatus] = useState<ItemStatus>(e.status);
  const [dueOn, setDueOn] = useState(e.dueOn ?? "");
  const [receivedOn, setReceivedOn] = useState(e.receivedOn ?? today());
  const [keptIn, setKeptIn] = useState(e.keptIn ?? "");
  const [reason, setReason] = useState(e.reason ?? "");
  const [note, setNote] = useState(e.note ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inHand = status === "received" || status === "checked";
  const draft: DealItem = {
    item: row.key, status, dueOn: !inHand && status !== "not_applicable" ? dueOn || null : null, receivedOn: inHand ? receivedOn || null : null,
    keptIn: keptIn.trim() || null, reason: status === "not_applicable" ? reason.trim() || null : null, note: note.trim() || null,
  };
  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const ok = await attempt(checkDealItem(draft), () => saveDealItem(org.db, id, {
      org_id: org.organisation.id, listing_id: listing.id, item: draft.item, status: draft.status, due_on: draft.dueOn, received_on: draft.receivedOn,
      kept_in: draft.keptIn, reason: draft.reason, note: draft.note,
    }), setError);
    setBusy(false);
    if (ok) onDone();
  }
  return (
    <form onSubmit={save} aria-label={`Update ${row.label}`} className="pra-fields">
      <label className="pra-field">Status<select value={status} onChange={(ev) => setStatus(ev.target.value as ItemStatus)}>{Object.entries(ITEM_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {inHand && <label className="pra-field">Received on<input type="date" value={receivedOn} onChange={(ev) => setReceivedOn(ev.target.value)} /></label>}
      {!inHand && status !== "not_applicable" && <label className="pra-field">Due by<input type="date" value={dueOn} onChange={(ev) => setDueOn(ev.target.value)} /></label>}
      {status !== "not_applicable" && <label className="pra-field">Kept in<input value={keptIn} onChange={(ev) => setKeptIn(ev.target.value)} placeholder="e.g. PropCtrl, Doxit, agency file" /></label>}
      {status === "not_applicable" && <label className="pra-field pra-full">Why it doesn't apply<input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. no gas installation; buyer is a natural person" /></label>}
      <label className="pra-field pra-full">Note<input value={note} onChange={(ev) => setNote(ev.target.value)} /></label>
      <div className="pra-full"><ErrorNote error={error} title="Not saved" /></div>
      <div className="pra-actions pra-full">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** The path to the Fidelity Fund Certificate: only steps that name their source. */
export function FfcPath() {
  const org = useOrg();
  const q = useQuery(() => listFfcSteps(org.db, org.organisation.id), [org.organisation.id]);
  const steps = useMemo(() => (q.data ?? []).map(toStep), [q.data]);
  const [editing, setEditing] = useState<FfcStep | "new" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const done = steps.filter((s) => s.status === "done").length;
  const missingPpra = PPRA_CANDIDATE_STEPS.filter((p) => !steps.some((s) => s.source === p.source));

  async function addPpra() {
    const start = steps.reduce((m, s) => Math.max(m, s.position), 0);
    if (await attempt(null, () => addFfcSteps(org.db, missingPpra.map((p, i) => ({
      org_id: org.organisation.id, position: start + i + 1, title: p.title, source: p.source, status: "to_do", due_on: null, done_on: null, evidence: null, note: null,
    }))), setError)) q.reload();
  }

  return (
    <section className="pra-card" aria-label="FFC path" data-testid="ffc-path">
      <div className="pra-head">
        <div>
          <h2>Your path to the Fidelity Fund Certificate</h2>
          <p>Each step says where the requirement comes from. Steps beyond the PPRA's application form are added only once the PPRA or your principal confirms them.</p>
        </div>
        <button className="pra-btn" onClick={() => setEditing("new")}>Add a step</button>
      </div>
      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error ?? error} title="The FFC path didn't load or save" />
      {q.data && missingPpra.length > 0 && (
        <div className="pra-actions">
          <button className="pra-btn primary" onClick={() => void addPpra()}>Add the PPRA's candidate registration steps ({missingPpra.length})</button>
        </div>
      )}
      {editing && <StepForm step={editing === "new" ? null : editing} position={steps.length + 1} onDone={() => { setEditing(null); q.reload(); }} onCancel={() => setEditing(null)} />}
      {steps.length > 0 && <p className="pra-text"><strong>{done} of {steps.length}</strong> done.</p>}
      {steps.length > 0 && (
        <div className="pra-table-wrap">
          <table className="pra-table" data-testid="ffc-steps">
            <tbody>{steps.map((s) => (
              <tr key={s.id}>
                <td>{s.title}<br /><small className="pra-note">Source: {s.source}</small></td>
                <td><span className={`pra-tag ${s.status === "done" ? "green" : s.status === "in_progress" ? "amber" : ""}`}>{STEP_STATUSES[s.status]}</span></td>
                <td><small className="pra-note">{s.status === "done" ? `${s.doneOn} · proof: ${s.evidence}` : s.dueOn ? `due ${s.dueOn}` : ""}</small></td>
                <td><button className="pra-btn" aria-label={`Update ${s.title}`} onClick={() => setEditing(s)}>Update</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StepForm({ step, position, onDone, onCancel }: { step: FfcStep | null; position: number; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const [title, setTitle] = useState(step?.title ?? "");
  const [source, setSource] = useState(step?.source ?? "");
  const [status, setStatus] = useState<StepStatus>(step?.status ?? "to_do");
  const [dueOn, setDueOn] = useState(step?.dueOn ?? "");
  const [doneOn, setDoneOn] = useState(step?.doneOn ?? today());
  const [evidence, setEvidence] = useState(step?.evidence ?? "");
  const [note, setNote] = useState(step?.note ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const draft = {
    title: title.trim(), source: source.trim(), status, dueOn: dueOn || null, doneOn: status === "done" ? doneOn || null : null,
    evidence: evidence.trim() || null, note: note.trim() || null,
  };
  async function save(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const ok = await attempt(checkFfcStep(draft), () => saveFfcStep(org.db, step?.id ?? null, {
      org_id: org.organisation.id, position: step?.position ?? position, title: draft.title, source: draft.source, status: draft.status,
      due_on: draft.dueOn, done_on: draft.doneOn, evidence: draft.evidence, note: draft.note,
    }), setError);
    setBusy(false);
    if (ok) onDone();
  }
  return (
    <form className="pra-fields" onSubmit={save} aria-label={step ? "Update step" : "Add a step"}>
      <label className="pra-field pra-full">Step<input value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Pass the PDE exam" /></label>
      <label className="pra-field pra-full">Where this requirement comes from<input value={source} onChange={(ev) => setSource(ev.target.value)} placeholder="e.g. confirmed by the principal, 20 Oct; the PPRA website" /></label>
      <label className="pra-field">Status<select value={status} onChange={(ev) => setStatus(ev.target.value as StepStatus)}>{Object.entries(STEP_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {status === "done"
        ? <label className="pra-field">Done on<input type="date" value={doneOn} onChange={(ev) => setDoneOn(ev.target.value)} /></label>
        : <label className="pra-field">Due by<input type="date" value={dueOn} onChange={(ev) => setDueOn(ev.target.value)} /></label>}
      <label className="pra-field pra-full">Where the proof is kept<input value={evidence} onChange={(ev) => setEvidence(ev.target.value)} placeholder="e.g. PPRA portal confirmation, agency file" /></label>
      <label className="pra-field pra-full">Note<input value={note} onChange={(ev) => setNote(ev.target.value)} /></label>
      <div className="pra-full"><ErrorNote error={error} title="Not saved" /></div>
      <div className="pra-actions pra-full">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
        {step && <button type="button" className="pra-btn" disabled={busy} onClick={() => void attempt(null, () => deleteFfcStep(org.db, step.id), setError).then((ok) => ok && onDone())}>Delete</button>}
      </div>
    </form>
  );
}
