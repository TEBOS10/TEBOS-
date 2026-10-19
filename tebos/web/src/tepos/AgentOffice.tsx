// The Real Estate Job portal: the agent's office, slice 1 (ROADMAP priority 3). Every listing, buyer and seller
// with its next step and date, and what is overdue. Kept in the private organisation, opened only after two-step
// sign-in. No personal details until the agency's principal allows them: people are references (B-001, S-001).
import {
  agenda, checkContact, checkListing, CLOSED_CONTACT, CLOSED_LISTING, CONTACT_ROLES, CONTACT_STAGES, DEALS, dueText,
  LISTING_STAGES, MANDATES, SOURCES, WHEN, type Contact, type ContactRole, type ContactStage, type Deal, type Listing,
  type ListingStage, type Mandate, type Source, type When,
} from "@core/agent";
import { money } from "@core/property";
import type { Check } from "@core/rules";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ErrorNote, Loading } from "../components/ui";
import { Link } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { checklistSummary, DealDocuments, FfcPath } from "./AgentCompliance";
import {
  deleteContact, deleteListing, listContacts, listDealItems, listListings, saveContact, saveListing, type ContactRow, type ListingRow,
} from "./agentData";

const today = () => new Date().toISOString().slice(0, 10);
const WHEN_TONE: Record<When, string> = { overdue: "red", today: "amber", this_week: "", later: "" };

const toListing = (r: ListingRow): Listing => ({
  id: r.id, ref: r.ref, label: r.label, deal: r.deal as Deal, stage: r.stage as ListingStage, price: r.price === null ? null : Number(r.price),
  mandate: r.mandate as Mandate | null, mandateEndsOn: r.mandate_ends_on, nextStep: r.next_step, nextStepOn: r.next_step_on, outcome: r.outcome, note: r.note,
});
const toContact = (r: ContactRow): Contact => ({
  id: r.id, ref: r.ref, role: r.role as ContactRole, label: r.label, listingId: r.listing_id, source: r.source as Source | null,
  stage: r.stage as ContactStage, nextStep: r.next_step, nextStepOn: r.next_step_on, outcome: r.outcome, note: r.note,
});

function Tag({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`pra-tag ${tone}`}>{children}</span>;
}

export function AgentOffice() {
  const org = useOrg();
  const mine = org.organisations.find((o) => o.organisation.private);
  let body: ReactNode;
  if (!org.organisation.private) {
    body = (
      <section className="pra-card" data-testid="agent-private-only">
        <p className="pra-text">The agent's office lives in your private organisation{mine ? `, ${mine.organisation.name}` : ""}.</p>
        {mine && <div className="pra-actions"><button className="pra-btn primary" onClick={() => org.switchOrganisation(mine.organisation.id)}>Open {mine.organisation.name}</button></div>}
      </section>
    );
  } else if (!org.twoStep) {
    body = (
      <section className="pra-card" data-testid="two-step-required">
        <p className="pra-text">These records open only after you sign in with your password and a code from your authenticator app.</p>
        <div className="pra-actions"><Link to="/account" className="pra-btn primary">Set up two-step sign-in</Link></div>
      </section>
    );
  } else {
    body = <Office />;
  }
  return (
    <div className="pra">
      <header className="pra-top">
        <div>
          <div className="pra-eyebrow"><Link to="/">TEPOS</Link> / Real Estate Job · only you</div>
          <h1>Real Estate Job</h1>
          <p className="pra-sub">Every listing, buyer and seller with its next step and date. Nothing open is left without one. Until your agency's principal agrees, no names, phone numbers or email addresses are kept here: people are references (B-001, S-001), and their details stay in the agency's system.</p>
        </div>
      </header>
      {body}
    </div>
  );
}

type Editing = { kind: "listing"; item: Listing | null } | { kind: "contact"; item: Contact | null; role?: ContactRole } | null;

function Office() {
  const org = useOrg();
  const lq = useQuery(() => listListings(org.db, org.organisation.id), [org.organisation.id]);
  const cq = useQuery(() => listContacts(org.db, org.organisation.id), [org.organisation.id]);
  const dq = useQuery(() => listDealItems(org.db, org.organisation.id), [org.organisation.id]);
  const [documentsFor, setDocumentsFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [showClosed, setShowClosed] = useState(false);
  const listings = useMemo(() => (lq.data ?? []).map(toListing), [lq.data]);
  const contacts = useMemo(() => (cq.data ?? []).map(toContact), [cq.data]);
  const a = useMemo(() => agenda(listings, contacts, today()), [listings, contacts]);
  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);
  const reload = () => { setEditing(null); lq.reload(); cq.reload(); };
  const edit = (kind: "listing" | "contact", id: string) => {
    if (kind === "listing") setEditing({ kind, item: listings.find((l) => l.id === id) ?? null });
    else setEditing({ kind, item: contacts.find((c) => c.id === id) ?? null });
  };
  const shownListings = showClosed ? listings : listings.filter((l) => !CLOSED_LISTING.includes(l.stage));
  const shownContacts = showClosed ? contacts : contacts.filter((c) => !CLOSED_CONTACT.includes(c.stage));
  const closedCount = listings.length - a.openListings + contacts.length - a.openContacts;

  return (
    <>
      <div className="pra-actions">
        <button className="pra-btn primary" onClick={() => setEditing({ kind: "listing", item: null })}>Add a listing</button>
        <button className="pra-btn" onClick={() => setEditing({ kind: "contact", item: null, role: "buyer" })}>Add a buyer</button>
        <button className="pra-btn" onClick={() => setEditing({ kind: "contact", item: null, role: "seller" })}>Add a seller</button>
      </div>

      {(lq.loading && !lq.data) || (cq.loading && !cq.data) ? <Loading /> : null}
      <ErrorNote error={lq.error ?? cq.error} title="Couldn't load the office" />

      {editing?.kind === "listing" && <ListingForm item={editing.item} onDone={reload} onCancel={() => setEditing(null)} />}
      {editing?.kind === "contact" && <ContactForm item={editing.item} role={editing.role ?? "buyer"} listings={listings} onDone={reload} onCancel={() => setEditing(null)} />}

      <section className="pra-metrics" aria-label="Next steps">
        {(["overdue", "today", "this_week"] as When[]).map((w) => (
          <div key={w} className="pra-card" data-testid={`count-${w}`}><div className="pra-label">{WHEN[w]}</div><div className="pra-value">{a.counts[w]}</div></div>
        ))}
        <div className="pra-card"><div className="pra-label">Open</div><div className="pra-value">{a.openListings + a.openContacts}</div><div className="pra-note">{a.openListings} listings · {a.openContacts} people</div></div>
      </section>

      {a.mandatesEnding.length > 0 && (
        <section className="pra-card" aria-label="Mandates ending">
          <h2>Mandates ending</h2>
          <ul className="pra-checks" data-testid="mandates-ending">
            {a.mandatesEnding.map((m) => (
              <li key={m.id} className="pra-check"><span><strong>{m.ref}</strong> {m.label}: {m.days < 0 ? `ended ${m.endsOn}` : `ends ${m.endsOn}`}</span><Tag tone={m.days < 0 ? "red" : "amber"}>{dueText(m.days)}</Tag></li>
            ))}
          </ul>
        </section>
      )}

      <section className="pra-card" aria-label="Agenda">
        <div className="pra-head"><div><h2>Next steps</h2><p>Every open listing and person, soonest first.</p></div></div>
        {a.items.length === 0 && lq.data && cq.data ? <p className="pra-empty">Nothing open yet. Add a listing or a buyer to start.</p> : (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="agenda">
              <tbody>{a.items.map((i) => (
                <tr key={`${i.kind}-${i.id}`}>
                  <td><Tag tone={WHEN_TONE[i.when]}>{dueText(i.days)}</Tag></td>
                  <td><strong>{i.ref}</strong> {i.label}</td>
                  <td>{i.nextStep}<br /><small className="pra-note">{i.nextStepOn}</small></td>
                  <td><button className="pra-btn" onClick={() => edit(i.kind, i.id)}>Update</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {documentsFor && byId.get(documentsFor) && (
        <DealDocuments listing={byId.get(documentsFor)!} rows={(dq.data ?? []).filter((r) => r.listing_id === documentsFor)}
          onChanged={dq.reload} onClose={() => setDocumentsFor(null)} />
      )}

      <section className="pra-card" aria-label="Listings">
        <div className="pra-head"><div><h2>Listings</h2><p>Changes are audited: who changed which fields, and when, never the content.</p></div>
          {closedCount > 0 && <label className="pra-field"><span><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ({closedCount})</span></label>}
        </div>
        {shownListings.length === 0 ? <p className="pra-empty">No {showClosed ? "" : "open "}listings.</p> : (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="listings">
              <thead><tr><th>Listing</th><th>Stage</th><th>Price</th><th>Next step</th><th>Documents</th><th /></tr></thead>
              <tbody>{shownListings.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.ref}</strong> {l.label}<br /><small className="pra-note">{DEALS[l.deal]}{l.mandate ? ` · ${MANDATES[l.mandate]} mandate` : ""}{l.mandateEndsOn ? ` to ${l.mandateEndsOn}` : ""}</small></td>
                  <td><Tag>{LISTING_STAGES[l.stage]}</Tag></td>
                  <td>{l.price === null ? <Tag tone="amber">Unknown</Tag> : `${money(l.price)}${l.deal === "rental" ? " a month" : ""}`}</td>
                  <td>{l.nextStep ? <>{l.nextStep}<br /><small className="pra-note">{l.nextStepOn}</small></> : <small className="pra-note">{l.outcome}</small>}</td>
                  <td><button className="pra-btn" aria-label={`Documents for ${l.ref}`} onClick={() => setDocumentsFor(l.id)}>{checklistSummary((dq.data ?? []).filter((r) => r.listing_id === l.id))}</button></td>
                  <td><button className="pra-btn" onClick={() => setEditing({ kind: "listing", item: l })}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pra-card" aria-label="People">
        <div className="pra-head"><div><h2>Buyers, sellers, tenants and landlords</h2><p>References only. Their names and contact details stay in the agency's system.</p></div></div>
        {shownContacts.length === 0 ? <p className="pra-empty">No {showClosed ? "" : "open "}people.</p> : (
          <div className="pra-table-wrap">
            <table className="pra-table" data-testid="contacts">
              <thead><tr><th>Who</th><th>Stage</th><th>Listing</th><th>Next step</th><th /></tr></thead>
              <tbody>{shownContacts.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.ref}</strong> {c.label}<br /><small className="pra-note">{CONTACT_ROLES[c.role]}{c.source ? ` · ${SOURCES[c.source]}` : ""}</small></td>
                  <td><Tag>{CONTACT_STAGES[c.stage]}</Tag></td>
                  <td>{c.listingId ? byId.get(c.listingId)?.ref ?? "" : ""}</td>
                  <td>{c.nextStep ? <>{c.nextStep}<br /><small className="pra-note">{c.nextStepOn}</small></> : <small className="pra-note">{c.outcome}</small>}</td>
                  <td><button className="pra-btn" onClick={() => setEditing({ kind: "contact", item: c })}>Edit</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <FfcPath />
    </>
  );
}

function useSave(onDone: () => void) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
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
  return { error, busy, run };
}

function ListingForm({ item, onDone, onCancel }: { item: Listing | null; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const [label, setLabel] = useState(item?.label ?? "");
  const [deal, setDeal] = useState<Deal>(item?.deal ?? "sale");
  const [stage, setStage] = useState<ListingStage>(item?.stage ?? "prospect");
  const [price, setPrice] = useState(item?.price === null || !item ? "" : String(item.price));
  const [mandate, setMandate] = useState<Mandate | "">(item?.mandate ?? "");
  const [mandateEndsOn, setMandateEndsOn] = useState(item?.mandateEndsOn ?? "");
  const [nextStep, setNextStep] = useState(item?.nextStep ?? "");
  const [nextStepOn, setNextStepOn] = useState(item?.nextStepOn ?? today());
  const [outcome, setOutcome] = useState(item?.outcome ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const { error, busy, run } = useSave(onDone);
  const closed = CLOSED_LISTING.includes(stage);

  const draft: Omit<Listing, "id" | "ref"> = {
    label: label.trim(), deal, stage, price: price.trim() === "" ? null : Number(price.replace(/[\s,]/g, "")), mandate: mandate || null,
    mandateEndsOn: mandateEndsOn || null, nextStep: closed ? null : nextStep.trim() || null, nextStepOn: closed ? null : nextStepOn || null,
    outcome: outcome.trim() || null, note: note.trim() || null,
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(checkListing(draft), () => saveListing(org.db, item?.id ?? null, {
      org_id: org.organisation.id, label: draft.label, deal: draft.deal, stage: draft.stage, price: draft.price, mandate: draft.mandate,
      mandate_ends_on: draft.mandateEndsOn, next_step: draft.nextStep, next_step_on: draft.nextStepOn, outcome: draft.outcome, note: draft.note,
    }));
  };

  return (
    <form className="pra-card" onSubmit={save} aria-label={item ? "Edit listing" : "Add a listing"}>
      <div className="pra-head"><div><h2>{item ? `${item.ref}: ${item.label}` : "Add a listing"}</h2><p>Describe the property, not the owner. No names, numbers or email addresses.</p></div></div>
      <div className="pra-fields">
        <label className="pra-field pra-full">Property<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 3-bed house, Erf 512 Northcliff" /></label>
        <label className="pra-field">Sale or rental<select value={deal} onChange={(e) => setDeal(e.target.value as Deal)}>{Object.entries(DEALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Stage<select value={stage} onChange={(e) => setStage(e.target.value as ListingStage)}>{Object.entries(LISTING_STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">{deal === "rental" ? "Rent a month (rand)" : "Asking price (rand)"}<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Unknown" /></label>
        <label className="pra-field">Mandate<select value={mandate} onChange={(e) => setMandate(e.target.value as Mandate | "")}><option value="">None yet</option>{Object.entries(MANDATES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Mandate ends<input type="date" value={mandateEndsOn} onChange={(e) => setMandateEndsOn(e.target.value)} /></label>
        {closed ? (
          <label className="pra-field pra-full">How it ended<textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Registered on 12 Dec; owner chose another agency" /></label>
        ) : (
          <>
            <label className="pra-field pra-full">Next step<input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Present the valuation" /></label>
            <label className="pra-field">By<input type="date" value={nextStepOn} onChange={(e) => setNextStepOn(e.target.value)} /></label>
          </>
        )}
        <label className="pra-field pra-full">Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <ErrorNote error={error} title="Not saved" />
      <div className="pra-actions">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
        {item && <button type="button" className="pra-btn" disabled={busy} onClick={() => void run(null, () => deleteListing(org.db, item.id))}>Delete</button>}
      </div>
    </form>
  );
}

function ContactForm({ item, role: newRole, listings, onDone, onCancel }: { item: Contact | null; role: ContactRole; listings: Listing[]; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const [role, setRole] = useState<ContactRole>(item?.role ?? newRole);
  const [label, setLabel] = useState(item?.label ?? "");
  const [listingId, setListingId] = useState(item?.listingId ?? "");
  const [source, setSource] = useState<Source | "">(item?.source ?? "");
  const [stage, setStage] = useState<ContactStage>(item?.stage ?? "new");
  const [nextStep, setNextStep] = useState(item?.nextStep ?? "");
  const [nextStepOn, setNextStepOn] = useState(item?.nextStepOn ?? today());
  const [outcome, setOutcome] = useState(item?.outcome ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const { error, busy, run } = useSave(onDone);
  const closed = CLOSED_CONTACT.includes(stage);

  const draft: Omit<Contact, "id" | "ref"> = {
    role, label: label.trim(), listingId: listingId || null, source: source || null, stage,
    nextStep: closed ? null : nextStep.trim() || null, nextStepOn: closed ? null : nextStepOn || null, outcome: outcome.trim() || null, note: note.trim() || null,
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(checkContact(draft), () => saveContact(org.db, item?.id ?? null, {
      org_id: org.organisation.id, role: draft.role, label: draft.label, listing_id: draft.listingId, source: draft.source, stage: draft.stage,
      next_step: draft.nextStep, next_step_on: draft.nextStepOn, outcome: draft.outcome, note: draft.note,
    }));
  };

  return (
    <form className="pra-card" onSubmit={save} aria-label={item ? "Edit person" : `Add a ${CONTACT_ROLES[role].toLowerCase()}`}>
      <div className="pra-head"><div><h2>{item ? `${item.ref}: ${item.label}` : `Add a ${CONTACT_ROLES[role].toLowerCase()}`}</h2><p>Describe what they need, not who they are. Their name and number stay in the agency's system; this reference links to them.</p></div></div>
      <div className="pra-fields">
        <label className="pra-field">Role<select value={role} onChange={(e) => setRole(e.target.value as ContactRole)} disabled={!!item}>{Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">Stage<select value={stage} onChange={(e) => setStage(e.target.value as ContactStage)}>{Object.entries(CONTACT_STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field pra-full">Description<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. First-time buyer, budget about R1.2m, pre-approved" /></label>
        <label className="pra-field">Listing<select value={listingId} onChange={(e) => setListingId(e.target.value)}><option value="">None</option>{listings.map((l) => <option key={l.id} value={l.id}>{l.ref} {l.label}</option>)}</select></label>
        <label className="pra-field">Came from<select value={source} onChange={(e) => setSource(e.target.value as Source | "")}><option value="">Not recorded</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {closed ? (
          <label className="pra-field pra-full">How it ended<textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Bought L-002; went with another agent" /></label>
        ) : (
          <>
            <label className="pra-field pra-full">Next step<input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Book viewings" /></label>
            <label className="pra-field">By<input type="date" value={nextStepOn} onChange={(e) => setNextStepOn(e.target.value)} /></label>
          </>
        )}
        <label className="pra-field pra-full">Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <ErrorNote error={error} title="Not saved" />
      <div className="pra-actions">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
        {item && <button type="button" className="pra-btn" disabled={busy} onClick={() => void run(null, () => deleteContact(org.db, item.id))}>Delete</button>}
      </div>
    </form>
  );
}
