// The maintainer's queue, for the clients they look after (all clients, for
// admins): what TEBOS noticed in each client's live records (objectives
// slipping or unmeasured, connections broken, findings and approvals
// waiting), then the delivery steps owed, overdue first.
import { isOverdue } from "@core/delivery";
import { useState } from "react";
import { DeliveryStep } from "../components/DeliveryPlan";
import { Badge, Card, Empty, ErrorNote, Field, Loading, PageHeader } from "../components/ui";
import { closeSignal, deliveryQueue, maintainerSignals, type DeliveryTask, type MaintainerItem } from "../lib/data";
import { ago } from "../lib/format";
import { Link } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

export function DeliveryQueuePage() {
  return <StaffOnly title="Maintainer queue">{(a) => (!a.maintainer ? <PageHeader title="Maintainer queue">For TEBOS's maintainers.</PageHeader> : <Queue />)}</StaffOnly>;
}

function Queue() {
  const { db } = useSignedIn();
  const q = useQuery(() => deliveryQueue(db), []);
  const s = useQuery(() => maintainerSignals(db), []);
  const nameOf = (id: string) => q.data?.clients.find((c) => c.id === id)?.business ?? "Client";
  const orgName = (id: string) => s.data?.orgs.find((o) => o.id === id)?.name ?? "Client";
  const open = (q.data?.tasks ?? []).filter((t) => t.status === "open");
  const overdue = open.filter((t) => isOverdue({ status: "open", dueAt: t.due_at }));
  const upcoming = open.filter((t) => !overdue.includes(t));
  const recent = (q.data?.tasks ?? []).filter((t) => t.status !== "open").sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")).slice(0, 10);
  const signals = [...(s.data?.items ?? [])].sort((a, b) => (a.severity === b.severity ? a.raised_at.localeCompare(b.raised_at) : a.severity === "high" ? -1 : 1));
  const list = (tasks: DeliveryTask[]) => (
    <ul className="list">
      {tasks.map((t) => <DeliveryStep key={t.id} task={t} db={db} canClose onChanged={q.reload} client={nameOf(t.opportunity_id)} />)}
    </ul>
  );
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title="Maintainer queue">
        What needs you on the clients you look after. TEBOS checks each client's records every hour and raises what's slipping;
        an item clears itself when the problem does, or you close it with a note. Below, the delivery steps each client is owed.
      </PageHeader>

      <Card title={`Needs attention · ${signals.length}`} subtitle="Raised by TEBOS from each client's live records. High first.">
        {s.error ? <ErrorNote error={s.error} title="Couldn't load signals" /> : !s.data ? <Loading /> : signals.length === 0 ? (
          <Empty>Nothing slipping on your clients right now.</Empty>
        ) : (
          <ul className="list" data-testid="signals">
            {signals.map((i) => <SignalItem key={i.id} item={i} client={orgName(i.org_id)} onChanged={s.reload} />)}
          </ul>
        )}
      </Card>

      {q.error ? <ErrorNote error={q.error} title="Couldn't load delivery" /> : !q.data ? <Loading /> : open.length === 0 && recent.length === 0 ? (
        <Card title="Delivery"><Empty>No client delivery yet. Each client's plan appears here when they're onboarded.</Empty></Card>
      ) : (
        <>
          {overdue.length > 0 && <Card title={`Delivery overdue · ${overdue.length}`} subtitle="Do these first, or skip them with a reason.">{list(overdue)}</Card>}
          <Card title={`Delivery coming up · ${upcoming.length}`}>{upcoming.length ? list(upcoming) : <Empty>Nothing else open.</Empty>}</Card>
          {recent.length > 0 && <Card title="Recently closed">{list(recent)}</Card>}
        </>
      )}
    </div>
  );
}

function SignalItem({ item: i, client, onChanged }: { item: MaintainerItem; client: string; onChanged: () => void }) {
  const { db } = useSignedIn();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function close(status: "done" | "dismissed") {
    if (note.trim().length < 3) return setError(new Error(status === "done" ? "Say what you did" : "Say why it doesn't need action"));
    setError(null);
    try {
      await closeSignal(db, i.id, status, note);
      onChanged();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }} data-testid="signal">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="list-main">
          <span className="list-title">{client} · {i.title}</span>
          <span className="list-meta">{i.detail} Raised {ago(i.raised_at)}.</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Badge tone={i.severity === "high" ? "bad" : "warn"}>{i.severity}</Badge>
          {!open && <button className="btn btn-sm" onClick={() => setOpen(true)}>Close</button>}
        </div>
      </div>
      {open && (
        <div className="form" style={{ marginTop: 8 }}>
          <Field label="What you did, or why it doesn't need action">
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote error={error} title="Not closed" />
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={() => close("done")}>Done</button>
            <button className="btn btn-sm" onClick={() => close("dismissed")} title="Not raised again for two weeks">Dismiss</button>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}
