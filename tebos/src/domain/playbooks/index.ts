import { marketingAgencyPlaybook } from "./marketing-agency";
import { smallBusinessPlaybook } from "./small-business";
import type { Playbook } from "./types";

export * from "./types";
export { marketingAgencyPlaybook, smallBusinessPlaybook };

export const PLAYBOOKS: readonly Playbook[] = [marketingAgencyPlaybook, smallBusinessPlaybook];

export function playbook(key: string, version?: number): Playbook | null {
  return PLAYBOOKS.find((p) => p.key === key && (version === undefined || p.version === version)) ?? null;
}

/** The written diagnostic a new client gets: their industry's playbook when there is one, otherwise the general one. */
export function playbookForIndustry(industry: string | null | undefined): Playbook {
  return industry === "marketing-agency" ? marketingAgencyPlaybook : smallBusinessPlaybook;
}
