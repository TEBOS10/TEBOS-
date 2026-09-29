// The maintainer's queue: every open delivery step for the clients they look
// after (all clients, for admins), soonest first, with overdue ones on top.
import { isOverdue } from "@core/delivery";
import { DeliveryStep } from "../components/DeliveryPlan";
import { Card, Empty, ErrorNote, Loading, PageHeader } from "../components/ui";
import { deliveryQueue, type DeliveryTask } from "../lib/data";
import { Link } from "../lib/router";
import { useSignedIn } from "../lib/session";
import { useQuery } from "../lib/useQuery";
import { StaffOnly } from "./PipelinePage";

export function DeliveryQueuePage() {
  return <StaffOnly title="Delivery queue">{(a) => (!a.maintainer ? <PageHeader title="Delivery queue">For TEBOS's maintainers.</PageHeader> : <Queue />)}</StaffOnly>;
}

function Queue() {
  const { db } = useSignedIn();
  const q = useQuery(() => deliveryQueue(db), []);
  const nameOf = (id: string) => q.data?.clients.find((c) => c.id === id)?.business ?? "Client";
  const open = (q.data?.tasks ?? []).filter((t) => t.status === "open");
  const overdue = open.filter((t) => isOverdue({ status: "open", dueAt: t.due_at }));
  const upcoming = open.filter((t) => !overdue.includes(t));
  const recent = (q.data?.tasks ?? []).filter((t) => t.status !== "open").sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")).slice(0, 10);
  const list = (tasks: DeliveryTask[]) => (
    <ul className="list">
      {tasks.map((t) => <DeliveryStep key={t.id} task={t} db={db} canClose onChanged={q.reload} client={nameOf(t.opportunity_id)} />)}
    </ul>
  );
  return (
    <div className="stack">
      <PageHeader eyebrow={<Link to="/pipeline">Client pipeline</Link>} title="Delivery queue">
        What TEBOS owes each client you look after, and by when. Close each step with a note of what was done. The client
        sees their plan too, and overdue steps count on TEBOS's own board.
      </PageHeader>
      {q.error ? <ErrorNote error={q.error} title="Couldn't load the queue" /> : !q.data ? <Loading /> : open.length === 0 && recent.length === 0 ? (
        <Card><Empty>No client delivery yet. Each client's plan appears here when they're onboarded.</Empty></Card>
      ) : (
        <>
          {overdue.length > 0 && <Card title={`Overdue · ${overdue.length}`} subtitle="Do these first, or skip them with a reason.">{list(overdue)}</Card>}
          <Card title={`Coming up · ${upcoming.length}`}>{upcoming.length ? list(upcoming) : <Empty>Nothing else open.</Empty>}</Card>
          {recent.length > 0 && <Card title="Recently closed">{list(recent)}</Card>}
        </>
      )}
    </div>
  );
}
