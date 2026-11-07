// Channel referrals (ADR 0025): someone met through the agency who needs help it doesn't give, referred to Real Estate
// Assist or Tidy Enterprise. The record proves the boundaries were kept: the person agreed, Real Estate Assist's
// written arrangement exists, and someone from the agency's book reaches Tidy Enterprise only with the agency's written
// permission. Nothing is sent from here; the founder makes the introduction and records it.
import {
  CLOSED_REFERRAL, CONSENT_LABEL, DESTINATION_LABEL, FEE_LABEL, REFERRAL_STATUS_LABEL, referralGaps, referralSummary,
  type ConsentMethod, type FeeTerms, type ReferralDestination, type ReferralDraft,
} from "@core/referrals";
import { canTransition, type ChannelReferralStatus } from "@core/states";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorNote } from "../components/ui";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { listReferrals, saveReferral, type ContactRow, type ReferralRow } from "./agentData";

const today = () => new Date().toISOString().slice(0, 10);
const STATUSES = Object.keys(REFERRAL_STATUS_LABEL) as ChannelReferralStatus[];

export function Referrals({ contacts }: { contacts: ContactRow[] }) {
  const org = useOrg();
  const q = useQuery(() => listReferrals(org.db, org.organisation.id), [org.organisation.id]);
  const [editing, setEditing] = useState<ReferralRow | "new" | null>(null);
  const rows = q.data ?? [];
  const summary = useMemo(() => referralSummary(rows.map((r) => ({ destination: r.destination as ReferralDestination, status: r.status as ChannelReferralStatus }))), [rows]);
  const refOf = useMemo(() => new Map(contacts.map((c) => [c.id, c.ref])), [contacts]);
  const done = () => { setEditing(null); q.reload(); };

  return (
    <section className="pra-card" aria-label="Referrals" data-testid="referrals">
      <div className="pra-head">
        <div>
          <h2>Referrals</h2>
          <p>When someone needs help the agency doesn't give. Nobody is introduced until they agree, and someone from the agency's book goes to Tidy Enterprise only with the agency's written permission. You make the introduction; this keeps the record.</p>
        </div>
        <button className="pra-btn" onClick={() => setEditing("new")}>Add a referral</button>
      </div>
      <div className="pra-metrics" aria-label="Referrals by destination">
        {summary.map((s) => (
          <div key={s.destination} className="pra-card" data-testid={`referrals-${s.destination}`}>
            <div className="pra-label">{DESTINATION_LABEL[s.destination]}</div>
            <div className="pra-value">{s.open}</div>
            <div className="pra-note">open · {s.introduced} introduced · {s.accepted} accepted · {s.resolved} resolved</div>
          </div>
        ))}
      </div>
      <ErrorNote error={q.error} title="Couldn't load referrals" />
      {editing && <ReferralForm item={editing === "new" ? null : editing} contacts={contacts} onDone={done} onCancel={() => setEditing(null)} />}
      {rows.length === 0 ? (q.data && <p className="pra-empty">No referrals yet.</p>) : (
        <div className="pra-table-wrap">
          <table className="pra-table" data-testid="referral-list">
            <thead><tr><th>Referral</th><th>To</th><th>Status</th><th>Next step</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.ref}</strong> {r.problem}<br /><small className="pra-note">{r.contact_id ? `From ${refOf.get(r.contact_id) ?? "a contact"}` : r.via_agency ? "Through the agency" : "Your own lead"}</small></td>
                <td>{DESTINATION_LABEL[r.destination as ReferralDestination]}</td>
                <td><span className="pra-tag">{REFERRAL_STATUS_LABEL[r.status as ChannelReferralStatus]}</span></td>
                <td>{r.next_step ? <>{r.next_step}<br /><small className="pra-note">{r.next_step_on}</small></> : <small className="pra-note">{r.outcome}</small>}</td>
                <td><button className="pra-btn" onClick={() => setEditing(r)}>Update</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReferralForm({ item, contacts, onDone, onCancel }: { item: ReferralRow | null; contacts: ContactRow[]; onDone: () => void; onCancel: () => void }) {
  const org = useOrg();
  const from = (item?.status ?? null) as ChannelReferralStatus | null;
  const [destination, setDestination] = useState<ReferralDestination>((item?.destination as ReferralDestination) ?? "real_estate_assist");
  const [contactId, setContactId] = useState(item?.contact_id ?? "");
  const [viaAgency, setViaAgency] = useState(item?.via_agency ?? true);
  const [problem, setProblem] = useState(item?.problem ?? "");
  const [status, setStatus] = useState<ChannelReferralStatus>(from ?? "identified");
  const [consentOn, setConsentOn] = useState(item?.consent_on ?? "");
  const [consentHow, setConsentHow] = useState<ConsentMethod | "">((item?.consent_how as ConsentMethod) ?? "");
  const [agencyRef, setAgencyRef] = useState(item?.agency_permission_ref ?? "");
  const [partnerRef, setPartnerRef] = useState(item?.partner_terms_ref ?? "");
  const [fee, setFee] = useState<FeeTerms>((item?.fee_terms as FeeTerms) ?? "not_agreed");
  const [feeRef, setFeeRef] = useState(item?.fee_terms_ref ?? "");
  const [nextStep, setNextStep] = useState(item?.next_step ?? "");
  const [nextStepOn, setNextStepOn] = useState(item?.next_step_on ?? today());
  const [outcome, setOutcome] = useState(item?.outcome ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const closed = CLOSED_REFERRAL.includes(status);
  const consentFixed = !!from && from !== "identified";
  const choices = from ? STATUSES.filter((s) => s === from || canTransition("channel_referral", from, s)) : (["identified"] as ChannelReferralStatus[]);
  const via = contactId ? true : viaAgency;
  const opt = (s: string) => (s.trim() ? s.trim() : null);

  const draft: ReferralDraft = {
    destination, via_agency: via, contact_id: contactId || null, problem: problem.trim(), status,
    consent_on: consentOn || null, consent_how: consentHow || null, agency_permission_ref: opt(agencyRef), partner_terms_ref: opt(partnerRef),
    fee_terms: fee, fee_terms_ref: opt(feeRef), next_step: closed ? null : opt(nextStep), next_step_on: closed ? null : nextStepOn || null,
    outcome: opt(outcome),
  };
  const gaps = referralGaps(draft, today());

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (gaps.length) return setError(new Error(gaps[0]));
    setBusy(true);
    try {
      await saveReferral(org.db, item?.id ?? null, { ...draft, org_id: org.organisation.id, note: opt(note) });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pra-card" onSubmit={save} aria-label={item ? `Update ${item.ref}` : "Add a referral"}>
      <div className="pra-head"><div><h2>{item ? `${item.ref}: ${item.problem}` : "Add a referral"}</h2><p>Describe the need, not the person. No names, numbers or email addresses.</p></div></div>
      <div className="pra-fields">
        <label className="pra-field">To<select value={destination} disabled={!!item} onChange={(e) => setDestination(e.target.value as ReferralDestination)}>
          {Object.entries(DESTINATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="pra-field">From<select value={contactId} disabled={!!item} onChange={(e) => setContactId(e.target.value)}>
          <option value="">No contact in this office</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.ref} {c.label}</option>)}</select></label>
        {!contactId && (
          <label className="pra-field"><span><input type="checkbox" checked={!viaAgency} disabled={!!item} onChange={(e) => setViaAgency(!e.target.checked)} /> My own lead, not met through the agency</span></label>
        )}
        <label className="pra-field pra-full">What they need<input value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Tenant two months in arrears; landlord wants specialist help" /></label>
        <label className="pra-field">Status<select value={status} onChange={(e) => setStatus(e.target.value as ChannelReferralStatus)}>
          {choices.map((s) => <option key={s} value={s}>{REFERRAL_STATUS_LABEL[s]}</option>)}</select></label>
        <label className="pra-field">They agreed on<input type="date" value={consentOn} max={today()} disabled={consentFixed} onChange={(e) => setConsentOn(e.target.value)} /></label>
        <label className="pra-field">How<select value={consentHow} disabled={consentFixed} onChange={(e) => setConsentHow(e.target.value as ConsentMethod | "")}>
          <option value="">Not yet</option>{Object.entries(CONSENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {destination === "real_estate_assist" && (
          <label className="pra-field pra-full">Real Estate Assist's written referral arrangement (where it is)<input value={partnerRef} onChange={(e) => setPartnerRef(e.target.value)} placeholder="e.g. Referral letter signed 3 Nov, in the vault" /></label>
        )}
        {destination === "tidy_enterprise" && via && (
          <label className="pra-field pra-full">The agency's written permission (where it is)<input value={agencyRef} onChange={(e) => setAgencyRef(e.target.value)} placeholder="e.g. Principal's email of 6 Nov" /></label>
        )}
        <label className="pra-field">Fee<select value={fee} onChange={(e) => setFee(e.target.value as FeeTerms)}>
          {Object.entries(FEE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {fee === "agreed_in_writing" && <label className="pra-field">Where it is written<input value={feeRef} onChange={(e) => setFeeRef(e.target.value)} /></label>}
        {closed ? (
          <label className="pra-field pra-full">How it ended<textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></label>
        ) : (
          <>
            <label className="pra-field pra-full">Next step<input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="e.g. Ask if they'd like an introduction" /></label>
            <label className="pra-field">By<input type="date" value={nextStepOn} onChange={(e) => setNextStepOn(e.target.value)} /></label>
          </>
        )}
        <label className="pra-field pra-full">Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {gaps.length > 0 && <ul className="pra-checks" data-testid="referral-gaps">{gaps.map((g) => <li key={g} className="pra-check">{g}</li>)}</ul>}
      <ErrorNote error={error} title="Not saved" />
      <div className="pra-actions">
        <button className="pra-btn primary" disabled={busy}>Save</button>
        <button type="button" className="pra-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
