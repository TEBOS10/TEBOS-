// REEDS worker: takes a person's request from "received" to a verified report.
// One unit of work per call, most advanced first so requests finish quickly:
//
//   verify   a task whose executor finished: its verifier checks it independently
//   run      a queued task: its executor runs (retried within its attempts)
//   close    a running request with no work left: report it (every task verified)
//            or fail it (naming the task that failed); never "completed" otherwise
//   plan     a received request: its tasks, each with an acceptance test
//
// Nothing here creates work of its own accord: a request comes from a signed-in person, or is a weekly signal
// brief that a person set up as a standing request (the database enforces both), and a brief never asks for
// more work, so work never delegates more work.

import { composeReport, externalLine, isRequestKind, planRequest, reportLine, taskSpec, type CheckResult, type ExternalAsk, type ExternalResult, type RequestKind, type TaskSpec, type WorkReport } from "../domain/work";
import type { CheckInput, Verification } from "./checks";

export interface ReceivedRequest {
  id: string;
  orgId: string;
  kind: string;
  requestedBy: string;
  /** Set for an external task: what the person asked for. */
  ask?: ExternalAsk;
}

export interface ClaimedTask {
  id: string;
  requestId: string;
  key: string;
  executor: string;
  input: CheckInput;
  attempts: number;
  maxAttempts: number;
  result?: CheckResult;
}

export interface ClosableRequest {
  id: string;
  kind: string;
  tasks: Array<{ key: string; title?: string; status: string; result: CheckResult | null; error: string | null; verification: Verification | null }>;
}

export interface WorkStore {
  nextReceived(): Promise<ReceivedRequest | null>;
  isPlatformAdmin(userId: string): Promise<boolean>;
  /** Insert the tasks and move the request to planned, then running. */
  plan(requestId: string, orgId: string, tasks: TaskSpec[], asOf: string): Promise<void>;
  failRequest(requestId: string, detail: string): Promise<void>;
  /** A task whose executor finished, waiting for its verifier. */
  nextDone(): Promise<ClaimedTask | null>;
  /** Claim a queued task of a running request and mark it running (counts an attempt). */
  claimQueued(): Promise<ClaimedTask | null>;
  finishTask(taskId: string, result: CheckResult): Promise<void>;
  /** Back to queued when attempts remain; failed (with the error) when they don't. */
  taskError(task: ClaimedTask, error: string): Promise<"retry" | "failed">;
  recordVerification(taskId: string, verification: Verification): Promise<void>;
  /** A running request none of whose tasks is queued, running or waiting for verification. */
  nextClosable(): Promise<ClosableRequest | null>;
  complete(requestId: string, report: WorkReport): Promise<void>;
  run(executor: string, input: CheckInput): Promise<CheckResult>;
  verify(executor: string, input: CheckInput, result: CheckResult): Promise<Verification>;
  /**
   * File one weekly signal brief that a person set up as a standing request and that is due (none in the last
   * six days). The database decides whether it may be filed; returns the new request, or null.
   */
  fileDueBrief(): Promise<string | null>;
}

export type WorkReportEvent =
  | { step: "plan"; requestId: string; tasks: number }
  | { step: "run"; taskId: string; outcome: "done" | "retry" | "failed"; detail?: string }
  | { step: "verify"; taskId: string; ok: boolean }
  | { step: "close"; requestId: string; outcome: "completed" | "failed" }
  | { step: "file"; requestId: string };

export class WorkWorker {
  constructor(
    private readonly store: WorkStore,
    private readonly log: (e: Record<string, unknown>) => void = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runOnce(): Promise<WorkReportEvent | null> {
    return (await this.verify()) ?? (await this.runTask()) ?? (await this.close()) ?? (await this.plan()) ?? (await this.file());
  }

  /** A standing weekly brief that is due becomes a request, filed for the person who set it up. */
  private async file(): Promise<WorkReportEvent | null> {
    const id = await this.store.fileDueBrief();
    if (!id) return null;
    this.log({ event: "reeds.filed_weekly_brief", requestId: id });
    return { step: "file", requestId: id };
  }

  private async plan(): Promise<WorkReportEvent | null> {
    const r = await this.store.nextReceived();
    if (!r) return null;
    if (!isRequestKind(r.kind)) {
      await this.store.failRequest(r.id, `TEBOS doesn't know how to handle a "${r.kind}" request yet.`);
      return { step: "close", requestId: r.id, outcome: "failed" };
    }
    if (r.kind === "external_task" && !r.ask) {
      await this.store.failRequest(r.id, "This external task has no title, acceptance test or AI client.");
      return { step: "close", requestId: r.id, outcome: "failed" };
    }
    const tasks = planRequest(r.kind, { platformAdmin: await this.store.isPlatformAdmin(r.requestedBy) }, r.ask);
    await this.store.plan(r.id, r.orgId, tasks, this.now().toISOString());
    this.log({ event: "reeds.planned", requestId: r.id, kind: r.kind, tasks: tasks.length });
    return { step: "plan", requestId: r.id, tasks: tasks.length };
  }

  private async runTask(): Promise<WorkReportEvent | null> {
    const t = await this.store.claimQueued();
    if (!t) return null;
    try {
      const result = await this.store.run(t.executor, t.input);
      await this.store.finishTask(t.id, result);
      return { step: "run", taskId: t.id, outcome: "done" };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const outcome = await this.store.taskError(t, detail.slice(0, 2000));
      this.log({ event: "reeds.task_error", taskId: t.id, executor: t.executor, attempt: t.attempts, outcome, detail });
      return { step: "run", taskId: t.id, outcome, detail };
    }
  }

  private async verify(): Promise<WorkReportEvent | null> {
    const t = await this.store.nextDone();
    if (!t || !t.result) return null;
    let v: Verification;
    try {
      v = await this.store.verify(t.executor, t.input, t.result);
    } catch (err) {
      v = { ok: false, recount: null, detail: `The verifier couldn't run: ${err instanceof Error ? err.message : String(err)}`.slice(0, 1000) };
    }
    await this.store.recordVerification(t.id, v);
    if (!v.ok) this.log({ event: "reeds.rejected", taskId: t.id, executor: t.executor, detail: v.detail });
    return { step: "verify", taskId: t.id, ok: v.ok };
  }

  private async close(): Promise<WorkReportEvent | null> {
    const r = await this.store.nextClosable();
    if (!r) return null;
    const bad = r.tasks.find((t) => t.status !== "verified");
    if (bad || r.tasks.length === 0 || !isRequestKind(r.kind)) {
      const why = !bad
        ? "The request had no checkable tasks."
        : bad.status === "rejected"
          ? `"${bad.title ?? taskSpec(bad.key)?.title ?? bad.key}" didn't pass its check: ${bad.verification?.detail ?? "no detail"}`
          : `"${bad.title ?? taskSpec(bad.key)?.title ?? bad.key}" ${bad.status === "failed" ? `failed: ${bad.error ?? "no detail"}` : `ended ${bad.status}`}`;
      await this.store.failRequest(r.id, why);
      this.log({ event: "reeds.failed", requestId: r.id, detail: why });
      return { step: "close", requestId: r.id, outcome: "failed" };
    }
    const lines = r.tasks.map((t) => {
      if (r.kind === "external_task") {
        return externalLine(t.title ?? "External task", t.result as unknown as ExternalResult, t.verification?.detail ?? null);
      }
      const spec = taskSpec(t.key);
      if (!spec || !t.result) throw new Error(`task ${t.key} has no spec or result`);
      return reportLine(spec, t.result);
    });
    await this.store.complete(r.id, composeReport(r.kind as RequestKind, lines));
    this.log({ event: "reeds.completed", requestId: r.id });
    return { step: "close", requestId: r.id, outcome: "completed" };
  }
}
