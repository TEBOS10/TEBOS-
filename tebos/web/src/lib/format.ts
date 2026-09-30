// Display helpers. Labels say exactly what a state means; nothing is rounded
// up into a better-sounding word ("partial" stays "partial").
export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export const STATUS_TONE: Record<string, Tone> = {
  completed: "good", verified: "good", acquired: "good", active: "good", approved: "good", succeeded: "good", connected: "good",
  partial: "warn", partially_acquired: "warn", awaiting_approval: "warn", pending: "warn", blocked: "warn", degraded: "warn",
  draft: "neutral", proposed: "neutral", ready: "info", queued: "info", running: "info", configured: "neutral", skipped: "neutral",
  failed: "bad", unavailable: "bad", rejected: "bad", expired: "bad", authentication_required: "bad",
  cancelled: "neutral", dismissed: "neutral", superseded: "neutral", consumed: "neutral", revoked: "neutral", disabled: "neutral",
  interpretation: "info", hypothesis: "warn",
  achieved: "good", missed: "bad", retired: "neutral",
};

export const statusLabel = (s: string) => s.replace(/_/g, " ");

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A calendar date ("2026-10-15") as "15 Oct 2026", with no time: billing dates are days, not moments. */
export function day(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const pct = (n: number | string | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(Number(n) * 100)}%`);

export const RISK_LABEL: Record<number, string> = {
  0: "Tier 0 · Read",
  1: "Tier 1 · Internal",
  2: "Tier 2 · External",
  3: "Tier 3 · Consequential",
};

/** "https://www.Example.com/x" -> "example.com" */
export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Accepts "example.com" or a full URL; returns a normalised https URL or null. */
export function normaliseWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
