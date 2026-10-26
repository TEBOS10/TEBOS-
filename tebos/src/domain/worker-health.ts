// The worker's heartbeat, as the founder sees it (migration worker_heartbeat). The database decides the state from
// its own clock; this mirrors the thresholds so the interface and the tests say the same thing.

export const WORKER_STATES = ["running", "late", "stopped", "never"] as const;
export type WorkerState = (typeof WORKER_STATES)[number];

/** A beat within this many minutes is running; within LATE_MINUTES, late; older, stopped. */
export const RUNNING_MINUTES = 30;
export const LATE_MINUTES = 120;

export function workerState(minutesSince: number | null): WorkerState {
  if (minutesSince === null) return "never";
  if (minutesSince <= RUNNING_MINUTES) return "running";
  if (minutesSince <= LATE_MINUTES) return "late";
  return "stopped";
}

export function sinceLabel(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** What the founder reads. Never claims anything ran when the database has no beat. */
export function workerSummary(s: { state: WorkerState; minutesSince: number | null; lastPassErrors: number }): string {
  switch (s.state) {
    case "never":
      return "No worker has reported in yet. Nothing runs on its own: no syncs, briefs or reminders.";
    case "running":
      return s.lastPassErrors > 0
        ? `Running (last pass ${sinceLabel(s.minutesSince!)}), but ${s.lastPassErrors} step${s.lastPassErrors === 1 ? "" : "s"} failed in it.`
        : `Running: last pass ${sinceLabel(s.minutesSince!)}.`;
    case "late":
      return `Late: the last pass was ${sinceLabel(s.minutesSince!)}. It should run every 15 minutes.`;
    case "stopped":
      return `Stopped: the last pass was ${sinceLabel(s.minutesSince!)}. Nothing runs on its own until it's back.`;
  }
}
