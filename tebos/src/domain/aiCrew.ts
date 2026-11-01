// AI crew (ADR 0020; migration 20261102170000_ai_crew.sql): a business's roles run by AI agents in teams with day and
// night shifts, overseen by people. Agents draft; a person who is an admin approves; a person sends. Agents never
// shoot, and social work is only for shoots whose customer agreed to publishing at intake. The database enforces
// every rule; test/schema-parity.test.ts keeps these in step.
import type { AiTaskStatus } from "./states";

export const AI_TEAMS = { bookings: "Bookings", admin: "Admin", social: "Social" } as const;
export type AiTeam = keyof typeof AI_TEAMS;
export const AI_SHIFTS = { day: "Day (06:00 to 18:00)", night: "Night (18:00 to 06:00)" } as const;
export type AiShift = keyof typeof AI_SHIFTS;
/** Day starts at 06:00 and night at 18:00, South African time. */
export const DAY_STARTS = 6;
export const NIGHT_STARTS = 18;
export const AI_PROVIDERS = ["xai", "anthropic", "gateway"] as const;

export const AI_WORK = {
  reply_enquiry: { team: "bookings", label: "Reply to a booking request" },
  call_sheet: { team: "bookings", label: "Call sheet" },
  balance_reminder: { team: "admin", label: "Balance reminder" },
  caption: { team: "social", label: "Caption for a post" },
} as const satisfies Record<string, { team: AiTeam; label: string }>;
export type AiWork = keyof typeof AI_WORK;

export const AI_TASK_LABEL: Record<AiTaskStatus, string> = {
  queued: "Waiting for an agent",
  drafted: "Draft ready for review",
  approved: "Approved: send it",
  rejected: "Rejected",
  sent: "Sent",
  cancelled: "Cancelled",
};

/** The shift on duty at an instant, by South African time (UTC+2, no daylight saving). */
export function shiftAt(at: Date): AiShift {
  const hour = (at.getUTCHours() + 2) % 24;
  return hour >= DAY_STARTS && hour < NIGHT_STARTS ? "day" : "night";
}

export interface CrewAgent { id: string; name: string; team: AiTeam; shift: AiShift; status: "active" | "paused" }

/** Which agent takes a piece of work now: an active agent of the work's team on the current shift, the first by name;
 *  if none is on shift, any active agent of the team (work never waits a whole shift); null if the team has none. */
export function pickAgent(agents: CrewAgent[], work: AiWork, at: Date): CrewAgent | null {
  const team = AI_WORK[work].team;
  const active = agents.filter((a) => a.team === team && a.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  return active.find((a) => a.shift === shiftAt(at)) ?? active[0] ?? null;
}

/** Gaps in a roster: each team should have someone on each shift. */
export function rosterGaps(agents: CrewAgent[]): Array<{ team: AiTeam; shift: AiShift }> {
  const gaps: Array<{ team: AiTeam; shift: AiShift }> = [];
  for (const team of Object.keys(AI_TEAMS) as AiTeam[]) {
    for (const shift of Object.keys(AI_SHIFTS) as AiShift[]) {
      if (!agents.some((a) => a.team === team && a.shift === shift && a.status === "active")) gaps.push({ team, shift });
    }
  }
  return gaps;
}
