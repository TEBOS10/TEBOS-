// A client's delivery plan: the dated steps TEBOS owes them, what "done"
// means for each, and what was done. The maintainer closes steps here with a
// note; everyone else reads it.
import { useState } from "react";
import { checkCompletion, isOverdue } from "@core/delivery";
import { closeDeliveryStep, type DeliveryTask } from "../lib/data";
import { when } from "../lib/format";
import { Badge, ErrorNote, Field } from "./ui";
import type { Db } from "../lib/supabase";

export function DeliveryStatus({ task }: { task: DeliveryTask }) {
  if (task.status === "done") return <Badge tone={task.closed_at && task.closed_at <= task.due_at ? "good" : "info"}>{task.closed_at && task.closed_at <= task.due_at ? "done on time" : "done late"}</Badge>;
  if (task.status === "skipped") return <Badge tone="neutral">skipped</Badge>;
  return isOverdue({ status: "open", dueAt: task.due_at }) ? <Badge tone="bad">overdue</Badge> : <Badge tone="warn">open</Badge>;
}

export function DeliveryStep({ task, db, canClose, onChanged, client }: { task: DeliveryTask; db?: Db; canClose: boolean; onChanged?: () => void; client?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  async function close(status: "done" | "skipped") {
    const check = checkCompletion(status, note);
    if (!check.ok) return setError(new Error(check.reason));
    setError(null);
    try {
      await closeDeliveryStep(db!, task.id, status, note);
      setOpen(false);
      onChanged?.();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <li style={{ flexDirection: "column", alignItems: "stretch" }} data-testid="delivery-step">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="list-main">
          <span className="list-title">{client ? `${client} · ` : ""}{task.title}</span>
          <span className="list-meta">Due {when(task.due_at)} · Done means: {task.done_means}</span>
          {task.note && <span className="list-meta">{task.status === "done" ? "Done" : "Skipped"} {when(task.closed_at)}: {task.note}</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <DeliveryStatus task={task} />
          {canClose && task.status === "open" && !open && <button className="btn btn-sm" onClick={() => setOpen(true)}>Close step</button>}
        </div>
      </div>
      {open && (
        <div className="form" style={{ marginTop: 8 }}>
          <Field label="What was done (or why it was skipped)">
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote error={error} title="Not closed" />
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={() => close("done")}>Mark done</button>
            <button className="btn btn-sm" onClick={() => close("skipped")}>Skip</button>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}
