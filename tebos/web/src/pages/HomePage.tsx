import { Activity, Building2, CheckSquare, Eye, FileSearch, Plug, ScanSearch, Stamp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ScanRow } from "../components/ScanRow";
import { Card, Empty, ErrorNote, Loading } from "../components/ui";
import { homeSummary, requestScan } from "../lib/data";
import { ago, normaliseWebsite } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { useOrg } from "../lib/session";
import { useQuery } from "../lib/useQuery";

export function HomePage() {
  const org = useOrg();
  const { db, organisation } = org;
  const summary = useQuery(() => homeSummary(db, organisation.id), [organisation.id], {
    pollMs: 8000,
    keepPolling: (d) => d.scans.some((s) => s.scan.status === "queued" || s.scan.status === "running"),
  });

  return (
    <div className="stack">
      {org.can("scan.run") ? <ScanBox /> : <ViewerHero />}
      {summary.loading && !summary.data && <Loading />}
      <ErrorNote error={summary.error} title="Couldn't load the command centre" />
      {summary.data && <Overview data={summary.data} />}
    </div>
  );
}

function ViewerHero() {
  return (
    <section className="hero">
      <p className="eyebrow">TEBOS business intelligence</p>
      <h1>What TEBOS is working on</h1>
      <p>You have view access. Ask an operator or admin to start a scan.</p>
    </section>
  );
}

function ScanBox() {
  const { db, organisation, userId } = useOrg();
  const [website, setWebsite] = useState("");
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const url = normaliseWebsite(website);
    if (!url) return setError(new Error("Enter a public website address, like example.com."));
    setBusy(true);
    setError(null);
    try {
      const { scan } = await requestScan(db, organisation.id, userId, { website: url, objective, context });
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="hero" onSubmit={submit}>
      <p className="eyebrow">TEBOS business intelligence</p>
      <h1>What do you want TEBOS to work on?</h1>
      <p>Give TEBOS a public business website. It gathers the evidence, understands the business, shows what matters, and prepares the next actions.</p>
      <div className="hero-form">
        <input aria-label="Business website URL" placeholder="Business website URL, e.g. mmupiandclay.co.za" value={website} onChange={(e) => setWebsite(e.target.value)} required />
        <button className="btn btn-accent" disabled={busy}>
          <ScanSearch size={16} aria-hidden /> {busy ? "Queuing…" : "Scan business"}
        </button>
      </div>
      {more ? (
        <div className="hero-extra">
          <textarea aria-label="Scan objective" placeholder="Objective (optional) — what should TEBOS focus on?" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
          <textarea aria-label="Business context" placeholder="Context (optional) — anything TEBOS should know. Stored as your statement, not as fact." rows={2} value={context} onChange={(e) => setContext(e.target.value)} />
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-ghost-dark btn-sm" onClick={() => setMore(true)}>
            Add objective or context
          </button>
        </div>
      )}
      <ErrorNote error={error} title="The scan wasn't queued" />
      <div className="hero-rules">
        <span>
          <Eye size={14} aria-hidden /> No approval for public reading
        </span>
        <span>
          <FileSearch size={14} aria-hidden /> Every conclusion is traceable
        </span>
      </div>
    </form>
  );
}

function Overview({ data }: { data: Awaited<ReturnType<typeof homeSummary>> }) {
  const lastAcquisition = data.runs.find((r) => r.agent_role === "acquisition");
  const lastAnalysis = data.runs.find((r) => r.agent_role === "business_intelligence");
  const queuedTooLong = data.scans.some((s) => s.scan.status === "queued" && Date.now() - new Date(s.scan.created_at).getTime() > 3 * 60_000);
  const connected = data.connections.filter((c) => c.status === "connected").length;

  return (
    <>
      <div className="grid grid-4">
        <Card>
          <div className="stat">
            <Building2 size={18} aria-hidden className="faint" />
            <span className="stat-value">{data.businessCount}</span>
            <span className="stat-label">Businesses</span>
            <span className="stat-sub">Persistent records created by real scan requests.</span>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <ScanSearch size={18} aria-hidden className="faint" />
            <span className="stat-value">{data.scans.length}</span>
            <span className="stat-label">Recent scans</span>
            <span className="stat-sub">Acquisition, evidence and findings records.</span>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <CheckSquare size={18} aria-hidden className="faint" />
            <span className="stat-value">{data.openActionCount}</span>
            <span className="stat-label">Open actions</span>
            <span className="stat-sub">
              {data.pendingApprovalCount > 0 ? (
                <Link to="/approvals">{data.pendingApprovalCount} awaiting approval</Link>
              ) : (
                "Evidence-backed next steps, not invented activity."
              )}
            </span>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <Activity size={18} aria-hidden className="faint" />
            <span className="stat-label">System health</span>
            <span className="stat-sub">
              Reading: {lastAcquisition ? `last ran ${ago(lastAcquisition.started_at)}` : "no activity recorded"}
            </span>
            <span className="stat-sub">
              Findings: {lastAnalysis ? `last ran ${ago(lastAnalysis.started_at)}${lastAnalysis.status === "failed" ? " (failed)" : ""}` : "no activity recorded"}
            </span>
            <span className="stat-sub">
              <Plug size={12} aria-hidden /> {connected} verified connection{connected === 1 ? "" : "s"}
            </span>
          </div>
        </Card>
      </div>

      {queuedTooLong && (
        <div className="note note-warn" role="status">
          <Stamp size={16} aria-hidden />
          <div>
            <strong>Scans are waiting.</strong> A scan has been queued for more than three minutes. The acquisition worker may not be running —
            check the Railway service.
          </div>
        </div>
      )}

      <div className="grid grid-main">
        <Card title="Latest scans" subtitle="What TEBOS read, and how much of it" actions={<Link to="/scans">View all</Link>}>
          {data.scans.length === 0 ? <Empty>No scans yet. Start with a business website above.</Empty> : <ul className="list">{data.scans.map((s) => <ScanRow key={s.scan.id} {...s} />)}</ul>}
        </Card>
        <div className="stack">
          <Card title="Recent businesses" actions={<Link to="/businesses">View all</Link>}>
            {data.businesses.length === 0 ? (
              <Empty>None yet.</Empty>
            ) : (
              <ul className="list">
                {data.businesses.map((b) => (
                  <li key={b.id}>
                    <div className="list-main">
                      <Link to={`/businesses/${b.id}`} className="list-title">
                        {b.name}
                      </Link>
                      <span className="list-meta">{b.website ?? "No website"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Operating rule">
            <p>
              <strong>Public reading is automatic.</strong>
            </p>
            <p className="muted" style={{ marginTop: 6 }}>
              TEBOS logs and traces public website reading without an approval queue. Approval is reserved for private access and consequential external
              actions. If a page can't be read, TEBOS keeps the partial evidence and says exactly what is missing.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
