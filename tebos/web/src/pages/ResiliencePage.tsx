// Strategic Resilience, slice 1: financial resilience, in the founder's private organisation. Money items are
// stored, checked and audited (redacted) by the database; the runway and the income breakdown are computed by
// @core/resilience from what is recorded, and say "Not established" when an amount is unknown.
import { money } from "@core/property";
import {
  CADENCES, checkMoneyItem, ENTITIES, MONEY_BASES, MONEY_KINDS, RELIABILITY, resilience, runwayText, STREAMS,
  type Cadence, type Entity, type Figure, type MoneyBasis, type MoneyItem, type MoneyKind, type Reliability, type RunwayResult, type Stream,
} from "@core/resilience";
import type { Check } from "@core/rules";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ErrorNote, Loading } from "../components/ui";
import { createPrivateOrganisation, deleteMoneyItem, listMoneyItems, saveMoneyItem, type MoneyItemRow } from "../lib/data";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

const today = () => new Date().toISOString().slice(0, 10);
const BASIS_TONE: Record<MoneyBasis, string> = { verified: "green", stated: "amber", estimated: "" };
const KIND_ORDER: MoneyKind[] = ["essential_cost", "income", "reserve", "debt", "other_cost", "commitment"];

export const toMoneyItem = (r: MoneyItemRow): MoneyItem => ({
  id: r.id, entity: r.entity as Entity, kind: r.kind as MoneyKind, label: r.label, amount: r.amount === null ? null : Number(r.amount),
  cadence: r.cadence as Cadence | null, stream: r.stream as Stream | null, reliability: r.reliability as Reliability | null,
  liquid: r.liquid, basis: r.basis as MoneyBasis, evidenceRef: r.evidence_ref, dueOn: r.due_on, asOf: r.as_of, note: r.note,
});

function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`pra-tag ${tone}`}>{children}</span>;
}

/** Tidy Capital's portal in TEPOS: the reserve. Also at /resilience. */
export function ResiliencePage({ title = "Tidy Capital" }: { title?: string }) {
  const org = useOrg();
  if (!org.organisation.private) return <div className="pra"><PrivateOrganisation /></div>;
  if (!org.twoStep) return <div className="pra"><TwoStepRequired /></div>;
  return <div className="pra"><Money title={title} /></div>;
}

/** The database opens these records only in a session that passed two-step sign-in. */
function TwoStepRequired() {
  const org = useOrg();
  return (
    <>
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow">TEPOS · {org.organisation.name} · only you</div>
          <h1>Two-step sign-in is needed</h1>
          <p className="pra-sub">These records open only after you sign in with your password and a code from your authenticator app. A stolen password alone opens nothing here.</p>
        </div>
      </header>
      <section className="pra-card" data-testid="two-step-required">
        <p className="pra-text">Turn on two-step sign-in on your account page. If it is already on, sign out and sign in again with your code.</p>
        <div className="pra-actions"><Link to="/account" className="pra-btn primary">Set up two-step sign-in</Link></div>
      </section>
    </>
  );
}

/** Resilience records live only in a private organisation: switch to it, or create it. */
function PrivateOrganisation() {
  const org = useOrg();
  const mine = org.organisations.find((o) => o.organisation.private);
  const [name, setName] = useState("IREKUN");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const slug = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "private"}-${Math.random().toString(36).slice(2, 6)}`;
      const id = await createPrivateOrganisation(org.db, name.trim(), slug);
      org.switchOrganisation(id as string);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow">TEPOS</div>
          <h1>Your private organisation</h1>
          <p className="pra-sub">Resilience records live only in a private organisation. You are its one member, and the database refuses anyone else, including invitations.</p>
        </div>
      </header>
      <section className="pra-card">
        {mine ? (
          <>
            <p className="pra-text">You are looking at {org.organisation.name}. Your private organisation is {mine.organisation.name}.</p>
            <div className="pra-actions"><button className="pra-btn primary" onClick={() => org.switchOrganisation(mine.organisation.id)}>Open {mine.organisation.name}</button></div>
          </>
        ) : (
          <form onSubmit={create} aria-label="Create your private organisation" className="pra-fields">
            <label className="pra-field">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="pra-actions pra-full"><button className="pra-btn primary" disabled={busy || !name.trim()}>Create private organisation</button></div>
            <div className="pra-full"><ErrorNote error={error} title="It wasn't created" /></div>
          </form>
        )}
      </section>
    </>
  );
}

function Money({ title }: { title: string }) {
  const org = useOrg();
  const q = useQuery(() => listMoneyItems(org.db, org.organisation.id), [org.organisation.id]);
  const [scope, setScope] = useState<Entity | "all">("all");
  const [editing, setEditing] = useState<MoneyItem | "new" | null>(null);
  const items = useMemo(() => (q.data ?? []).map(toMoneyItem), [q.data]);
  const r = useMemo(() => resilience(items, today(), scope), [items, scope]);
  const shown = scope === "all" ? items : items.filter((i) => i.entity === scope);

  return (
    <>
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow">TEPOS · {org.organisation.name} · only you</div>
          <h1>{title}</h1>
          <p className="pra-sub">The reserve: every income stream, and how many months the money lasts. Runway counts only reliable income; speculative income, trading and expected lump sums are shown but never counted as cash. An unknown amount stays unknown.</p>
        </div>
        <div className="pra-actions">
          <label className="pra-field">Show
            <select value={scope} onChange={(e) => setScope(e.target.value as Entity | "all")} aria-label="Show">
              <option value="all">Everything</option>
              {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="pra-btn primary" onClick={() => setEditing("new")}>Add an item</button>
        </div>
      </header>

      {q.loading && !q.data && <Loading />}
      <ErrorNote error={q.error} title="Couldn't load the records" />

      {editing && <ItemForm item={editing === "new" ? null : editing} defaultEntity={scope === "all" ? "personal" : scope} onDone={() => { setEditing(null); q.reload(); }} onCancel={() => setEditing(null)} />}

      <section className="pra-two">
        <Runway title="Base: reliable income continues" r={r.base} testId="runway-base" />
        <Runway title="Downside: all income stops" r={r.downside} testId="runway-downside" />
      </section>

      <section className="pra-metrics" aria-label="Money figures">
        <Stat label="Essential costs a month" f={r.essentialCosts} />
        <Stat label="Reliable income a month" f={r.reliableIncome} />
        <Stat label="Available now" f={r.available} />
        <Stat label="Speculative income a month (not counted)" f={r.speculativeIncome} />
      </section>

      {r.flags.length > 0 && (
        <section className="pra-card" aria-label="Flags">
          <h2>Needs attention</h2>
          <ul className="pra-checks" data-testid="money-flags">
            {r.flags.map((f) => <li key={f.text} className="pra-check"><span>{f.text}</span><Tag tone={f.level === "warning" ? "amber" : ""}>{f.level === "warning" ? "Check" : "Note"}</Tag></li>)}
          </ul>
        </section>
      )}

      <section className="pra-two">
        <div className="pra-card" aria-label="Income by stream">
          <h2>Income by stream</h2>
          <p className="pra-note">Monthly equivalents. Lump sums at face value, expected but not yet received.</p>
          {r.byStream.length === 0 ? <p className="pra-empty">No income recorded.</p> : (
            <div className="res-bars" data-testid="by-stream">
              {r.byStream.map((s) => {
                const total = Math.max(1, ...r.byStream.map((x) => x.reliable + x.speculative));
                return (
                  <div key={s.stream} className="res-bar-row">
                    <div className="res-bar-label"><span>{STREAMS[s.stream]}</span>
                      <small>{money(s.reliable)} reliable · {money(s.speculative)} speculative{s.lumpSums ? ` · ${money(s.lumpSums)} expected lump sums` : ""}{s.unknown ? ` · ${s.unknown} unknown` : ""}</small></div>
                    <div className="res-bar"><div className="reliable" style={{ width: `${(100 * s.reliable) / total}%` }} /><div className="speculative" style={{ width: `${(100 * s.speculative) / total}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="pra-card" aria-label="Income by cadence">
          <h2>Income by how often it pays</h2>
          {r.byCadence.length === 0 ? <p className="pra-empty">No income recorded.</p> : (
            <table className="pra-table" data-testid="by-cadence">
              <thead><tr><th>Cadence</th><th>Reliable / month</th><th>Speculative / month</th><th>Unknown</th></tr></thead>
              <tbody>{r.byCadence.map((c) => (
                <tr key={c.cadence}><td>{CADENCES[c.cadence]}{c.cadence === "lump_sum" ? " (face value)" : ""}</td><td>{money(c.reliable)}</td><td>{money(c.speculative)}</td><td>{c.unknown || ""}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>

      <section className="pra-card" aria-label="Records">
        <div className="pra-head"><div><h2>Records</h2><p>Changes are audited: who changed which fields, and when. The audit trail never keeps the amounts, so a deleted record is really gone.</p></div></div>
        {shown.length === 0 && q.data && <p className="pra-empty">Nothing recorded{scope === "all" ? "" : ` for ${ENTITIES[scope]}`} yet. Start with your essential monthly costs and the cash you can reach within a week.</p>}
        {KIND_ORDER.filter((k) => shown.some((i) => i.kind === k)).map((k) => (
          <div key={k}>
            <h3 className="pra-h3">{MONEY_KINDS[k]}</h3>
            <div className="pra-table-wrap">
              <table className="pra-table" data-testid={`items-${k}`}>
                <tbody>{shown.filter((i) => i.kind === k).map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.label}</strong><br /><small className="pra-note">{ENTITIES[i.entity]}{i.stream ? ` · ${STREAMS[i.stream]}` : ""}{i.dueOn ? ` · due ${i.dueOn}` : ""} · as of {i.asOf}</small></td>
                    <td>{i.amount === null ? <Tag tone="amber">Unknown</Tag> : money(i.amount)}{i.cadence ? ` ${CADENCES[i.cadence].toLowerCase()}` : ""}</td>
                    <td>{i.reliability && <Tag tone={i.reliability === "reliable" ? "green" : ""}>{RELIABILITY[i.reliability]}</Tag>} {i.liquid !== null && <Tag>{i.liquid ? "Liquid" : "Not liquid"}</Tag>} <Tag tone={BASIS_TONE[i.basis]}>{MONEY_BASES[i.basis]}</Tag></td>
                    <td><button className="pra-btn" onClick={() => setEditing(i)}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Runway({ title, r, testId }: { title: string; r: RunwayResult; testId: string }) {
  return (
    <div className="pra-card" data-testid={testId}>
      <div className="pra-label">{title}</div>
      <div className="pra-value">{runwayText(r)}</div>
      {r.state === "not_established"
        ? <p className="pra-note">Missing: {r.missing.join(", ")}</p>
        : r.basis && <div><Tag tone={BASIS_TONE[r.basis]}>As strong as its weakest input: {MONEY_BASES[r.basis].toLowerCase()}</Tag></div>}
    </div>
  );
}

function Stat({ label, f }: { label: string; f: Figure }) {
  return (
    <div className="pra-card">
      <div className="pra-label">{label}</div>
      <div className="pra-value">{f.value === null ? (f.missing.length ? "Not established" : "—") : money(f.value)}</div>
      <div className="pra-note">{f.value === null && f.missing.length ? `Unknown: ${f.missing.join(", ")}` : f.formula}</div>
    </div>
  );
}

function ItemForm({ item, defaultEntity, onDone, onCancel }: { item: MoneyItem | null; defaultEntity: Entity; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const [kind, setKind] = useState<MoneyKind>(item?.kind ?? "essential_cost");
  const [entity, setEntity] = useState<Entity>(item?.entity ?? defaultEntity);
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item?.amount === null || item === null ? "" : String(item.amount));
  const [cadence, setCadence] = useState<Cadence>(item?.cadence ?? "monthly");
  const [stream, setStream] = useState<Stream>(item?.stream ?? "other");
  const [reliability, setReliability] = useState<Reliability>(item?.reliability ?? "speculative");
  const [liquid, setLiquid] = useState(item?.liquid ?? true);
  const [basis, setBasis] = useState<MoneyBasis>(item?.basis ?? "stated");
  const [evidenceRef, setEvidenceRef] = useState(item?.evidenceRef ?? "");
  const [dueOn, setDueOn] = useState(item?.dueOn ?? "");
  const [asOf, setAsOf] = useState(item?.asOf ?? today());
  const [note, setNote] = useState(item?.note ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const flows = kind === "income" || kind === "essential_cost" || kind === "other_cost";
  const draft: Omit<MoneyItem, "id"> = {
    entity, kind, label: label.trim(), amount: amount.trim() === "" ? null : Number(amount),
    cadence: flows ? cadence : null, stream: kind === "income" ? stream : null, reliability: kind === "income" ? reliability : null,
    liquid: kind === "reserve" ? liquid : null, basis, evidenceRef: evidenceRef.trim() || null, dueOn: dueOn || null, asOf, note: note.trim() || null,
  };

  async function run(check: Check | null, f: () => Promise<unknown>) {
    setError(null);
    if (check && !check.ok) return setError(new Error(check.reason));
    setBusy(true);
    try {
      await f();
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(checkMoneyItem(draft), () => saveMoneyItem(org.db, item?.id ?? null, {
      org_id: org.organisation.id, entity: draft.entity, kind: draft.kind, label: draft.label, amount: draft.amount, cadence: draft.cadence,
      stream: draft.stream, reliability: draft.reliability, liquid: draft.liquid, basis: draft.basis, evidence_ref: draft.evidenceRef,
      due_on: draft.dueOn, as_of: draft.asOf, note: draft.note,
    }));
  };

  return (
    <form className="pra-card" onSubmit={save} aria-label={item ? "Edit item" : "Add an item"}>
      <div className="pra-head"><div><h2>{item ? `Edit: ${item.label}` : "Add an item"}</h2><p>Never type a password, PIN, key or token here: they are refused. Leave the amount blank if you don't know it yet.</p></div></div>
      <div className="pra-fields">
        <label className="pra-field">What it is<select value={kind} onChange={(e) => setKind(e.target.value as MoneyKind)} disabled={!!item}>{Object.entries(MONEY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Belongs to<select value={entity} onChange={(e) => setEntity(e.target.value as Entity)}>{Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field pra-full">Name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Rent, TEBOS hosting, Savings account" /></label>
        <label className="pra-field">Amount (rand)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Unknown" /></label>
        {flows && <label className="pra-field">How often<select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>{Object.entries(CADENCES).filter(([k]) => kind === "income" || k !== "lump_sum").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        {kind === "income" && <label className="pra-field">Stream<select value={stream} onChange={(e) => setStream(e.target.value as Stream)}>{Object.entries(STREAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        {kind === "income" && <label className="pra-field">Reliability<select value={reliability} onChange={(e) => setReliability(e.target.value as Reliability)}>{Object.entries(RELIABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        {kind === "reserve" && <label className="pra-field">Usable within a week?<select value={liquid ? "yes" : "no"} onChange={(e) => setLiquid(e.target.value === "yes")}><option value="yes">Yes (liquid)</option><option value="no">No</option></select></label>}
        <label className="pra-field">Basis<select value={basis} onChange={(e) => setBasis(e.target.value as MoneyBasis)}>{Object.entries(MONEY_BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Document (for verified)<input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} placeholder="e.g. FNB statement, Sep 2026" /></label>
        {(kind === "debt" || kind === "commitment" || kind === "income") && <label className="pra-field">Due on<input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></label>}
        <label className="pra-field">As of<input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        <label className="pra-field pra-full">Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <ErrorNote error={error} title="Not saved" />
      <div className="pra-actions">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
        {item && <button type="button" className="pra-btn" disabled={busy} onClick={() => void run(null, () => deleteMoneyItem(org.db, item.id))}>Delete</button>}
      </div>
    </form>
  );
}
