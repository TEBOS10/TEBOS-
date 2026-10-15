// The founder's inbox on Ask TEBOS: what is waiting on a decision, and what has
// gone wrong. Pure, so it can be tested. Alerts come only from records: failed
// runs (grouped by their reported reason, so one cause reads as one alert) and
// active objectives past their date. Nothing is raised that a record doesn't show.

export interface FailedRun { agent_role: string; error_detail: string | null; started_at: string }
export interface DueObjective { id: string; title: string; due_on: string; business_id: string; businessName: string | null }

export interface Alert {
  key: string;
  title: string;
  detail: string;
  count: number;
  at: string;
  link: string | null;
}

const ROLE: Record<string, string> = {
  business_intelligence: "Business reviews",
  acquisition: "Website reading",
  interview: "Interviews",
};

export function alertsFrom(failed: FailedRun[], overdue: DueObjective[]): Alert[] {
  const byReason = new Map<string, Alert>();
  for (const r of failed) {
    const reason = r.error_detail?.trim() || "It stopped without saying why.";
    const key = `run:${r.agent_role}:${reason}`;
    const a = byReason.get(key);
    if (a) {
      a.count += 1;
      if (r.started_at > a.at) a.at = r.started_at;
    } else {
      byReason.set(key, { key, title: `${ROLE[r.agent_role] ?? r.agent_role} failed`, detail: reason, count: 1, at: r.started_at, link: "/system" });
    }
  }
  const runs = [...byReason.values()].sort((a, b) => b.at.localeCompare(a.at));
  const late = overdue
    .slice()
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .map((o): Alert => ({
      key: `objective:${o.id}`,
      title: `"${o.title}" is past its date`,
      detail: `Due ${o.due_on}${o.businessName ? ` for ${o.businessName}` : ""}. Mark it achieved from a measured reading, or missed.`,
      count: 1,
      at: o.due_on,
      link: `/businesses/${o.business_id}/board`,
    }));
  return [...runs, ...late];
}
