// Minimal robots.txt support. Public reading is automatic, but TEBOS reads
// politely: a path the site disallows for generic crawlers is recorded as a
// "blocked" target with the reason, never silently skipped or fetched anyway.

export interface RobotsRules {
  /** Where the rules came from — "none" when robots.txt was unavailable. */
  origin: "robots.txt" | "none";
  allow: string[];
  disallow: string[];
}

export const NO_ROBOTS: RobotsRules = { origin: "none", allow: [], disallow: [] };

/** Parse the group that applies to our agent: a TEBOS-specific group if present, else "*". */
export function parseRobots(text: string, agentToken = "tebos"): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    if (key === "disallow" && value) current.disallow.push(value);
  }

  const specific = groups.find((g) => g.agents.some((a) => a === agentToken.toLowerCase()));
  const generic = groups.find((g) => g.agents.includes("*"));
  const group = specific ?? generic;
  return group ? { origin: "robots.txt", allow: group.allow, disallow: group.disallow } : { ...NO_ROBOTS, origin: "robots.txt" };
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith("$");
  const pattern = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; Allow wins ties (RFC 9309). */
export function isAllowed(rules: RobotsRules, url: string): boolean {
  const u = new URL(url);
  const path = u.pathname + u.search;
  let best: { length: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [rules.disallow, false],
    [rules.allow, true],
  ] as const) {
    for (const rule of list) {
      if (!ruleMatches(rule, path)) continue;
      if (!best || rule.length > best.length || (rule.length === best.length && allow)) best = { length: rule.length, allow };
    }
  }
  return best?.allow ?? true;
}
