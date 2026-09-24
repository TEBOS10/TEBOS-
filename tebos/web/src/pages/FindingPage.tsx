import { approvalPolicy, effectiveRiskTier, type RiskTier } from "@core/risk";
import { FileSearch, Lightbulb, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Card, ConfidencePanel, Empty, ErrorNote, Field, Loading, PageHeader, StatusBadge } from "../components/ui";
import { capabilities as loadCapabilities, getFinding, proposeAction, type Capability, type Finding } from "../lib/data";
import { RISK_LABEL, statusLabel, when } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { EvidenceItem } from "./ScanPage";

export function FindingPage({ id }: { id: string }) {
  const org = useOrg();
  const q = useQuery(() => getFinding(org.db, id), [id]);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} title="Couldn't load this finding" />;
  if (!q.data) return <PageHeader title="Finding not found">It doesn't exist, or it belongs to another organisation.</PageHeader>;
  const { finding, business, links, evidence, sources, actions } = q.data;

  const byRelation = (rel: string) =>
    links.filter((l) => l.relation === rel).map((l) => evidence.find((e) => e.id === l.evidence_id)).filter((e): e is NonNullable<typeof e> => !!e);
  const supporting = byRelation("supports");
  const contradicting = byRelation("contradicts");
  const sourceUri = (sourceId: string) => sources.find((s) => s.id === sourceId)?.uri ?? null;
  const adjustments = ((finding.confidence_components ?? {}) as { adjustments?: string[] }).adjustments ?? [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow={
          <>
            <Link to={`/businesses/${business.id}`}>{business.name}</Link> · Finding
          </>
        }
        title={finding.title}
      >
        <StatusBadge status={finding.kind} />
        <Badge>{statusLabel(finding.category)}</Badge>
        {finding.status !== "active" && <StatusBadge status={finding.status} />}
        <span>Recorded {when(finding.created_at)}</span>
      </PageHeader>

      {finding.kind === "hypothesis" && (
        <div className="note note-warn">
          <Lightbulb size={16} aria-hidden />
          <div>
            <strong>Hypothesis.</strong> This goes beyond what the evidence directly shows. Confirm it before acting on it with confidence.
          </div>
        </div>
      )}

      <div className="grid grid-main">
        <div className="stack">
          <Card title="Finding">
            <p style={{ fontSize: 15 }}>{finding.statement}</p>
            {finding.impact_hypothesis && (
              <p className="muted" style={{ marginTop: 10 }}>
                <strong>Why it could matter:</strong> {finding.impact_hypothesis}
              </p>
            )}
          </Card>

          <Card title="Why did TEBOS say this?" subtitle="The evidence this finding rests on">
            <div className="chain">
              {supporting.map((e) => (
                <div className="chain-step" key={e.id}>
                  <span className="chain-dot" aria-hidden>
                    <FileSearch size={14} />
                  </span>
                  <EvidenceItem e={e} sourceUri={sourceUri(e.source_id)} />
                </div>
              ))}
              {supporting.length === 0 && <Empty>No supporting evidence is linked. An active finding can't exist without it, so this one is not active.</Empty>}
            </div>
            {contradicting.length > 0 && (
              <>
                <h3 className="card-title" style={{ margin: "16px 0 8px" }}>
                  Evidence that cuts against it
                </h3>
                <div className="chain">
                  {contradicting.map((e) => (
                    <EvidenceItem key={e.id} e={e} sourceUri={sourceUri(e.source_id)} />
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title="Actions from this finding">
            {actions.length === 0 ? (
              <Empty>None yet.</Empty>
            ) : (
              <ul className="list">
                {actions.map((a) => (
                  <li key={a.id}>
                    <div className="list-main">
                      <Link to={`/actions/${a.id}`} className="list-title">
                        {a.title}
                      </Link>
                      <span className="list-meta">{RISK_LABEL[a.risk_tier]}</span>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
            {finding.status === "active" && org.can("action.propose") && <ProposeAction finding={finding} />}
          </Card>
        </div>

        <div className="stack">
          <Card title="Confidence">
            <ConfidencePanel score={finding.confidence} components={finding.confidence_components} />
          </Card>
          <Card title="What's missing" subtitle="What would make this more certain">
            {finding.missing_information.length === 0 ? (
              <Empty>Nothing recorded.</Empty>
            ) : (
              <ul className="limits" style={{ color: "var(--ink-soft)" }}>
                {finding.missing_information.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Card>
          {adjustments.length > 0 && (
            <Card title="Checks TEBOS applied" subtitle="Changes made to the model's proposal before it was stored">
              <ul className="limits" style={{ color: "var(--ink-soft)" }}>
                {adjustments.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Card>
          )}
          {finding.scan_id && (
            <Card>
              <Link to={`/scans/${finding.scan_id}`} className="row">
                <Search size={14} aria-hidden /> View the scan this came from
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposeAction({ finding }: { finding: Finding }) {
  const org = useOrg();
  const caps = useQuery(() => loadCapabilities(org.db), []);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [evidenceRequirement, setEvidenceRequirement] = useState("");
  const [capabilityKey, setCapabilityKey] = useState("");
  const [tier, setTier] = useState<RiskTier>(1);
  const [priority, setPriority] = useState(3);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const capability: Capability | undefined = caps.data?.find((c) => c.key === capabilityKey);
  const minTier = (capability?.default_risk_tier ?? 0) as RiskTier;
  const riskTier = effectiveRiskTier(tier, minTier);
  const policy = useMemo(() => approvalPolicy(riskTier), [riskTier]);

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Propose an action
        </button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const action = await proposeAction(org.db, finding, org.userId, {
        title: title.trim(),
        objective: objective.trim(),
        expectedOutcome: expectedOutcome.trim(),
        capabilityKey: capabilityKey || null,
        riskTier,
        approvalRequired: policy.required,
        priority,
        evidenceRequirement: evidenceRequirement.trim(),
      });
      navigate(`/actions/${action.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} style={{ marginTop: 14 }}>
      <Field label="Action">
        <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add a structured enquiry form" />
      </Field>
      <Field label="Objective">
        <textarea className="input" required value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What should change, and why" />
      </Field>
      <Field label="Expected outcome" hint="How you'd know it worked, ideally measurable.">
        <input className="input" value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} />
      </Field>
      <div className="form-row">
        <Field label="Capability required">
          <select className="input" value={capabilityKey} onChange={(e) => setCapabilityKey(e.target.value)}>
            <option value="">None — done by a person</option>
            {caps.data?.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} (tier {c.default_risk_tier})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Risk tier" hint={minTier > 0 ? `This capability is at least tier ${minTier}.` : undefined}>
          <select className="input" value={riskTier} onChange={(e) => setTier(Number(e.target.value) as RiskTier)}>
            {[0, 1, 2, 3].map((t) => (
              <option key={t} value={t} disabled={t < minTier}>
                {RISK_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Priority">
          <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
                {p === 1 ? " (highest)" : p === 5 ? " (lowest)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Verified when" hint="What must be true to call it done.">
          <input className="input" value={evidenceRequirement} onChange={(e) => setEvidenceRequirement(e.target.value)} />
        </Field>
      </div>
      <div className={`note ${policy.required ? "note-warn" : "note-info"}`}>
        {policy.required
          ? `${RISK_LABEL[riskTier]}: needs approval before it runs${policy.separateApprover ? ", from someone other than the requester" : ""}. Each approval covers one execution.`
          : `${RISK_LABEL[riskTier]}: can run within your permissions without approval.`}
      </div>
      <ErrorNote error={error} title="The action wasn't created" />
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create proposed action"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
