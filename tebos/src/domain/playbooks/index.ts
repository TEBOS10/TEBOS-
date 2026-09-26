import { marketingAgencyPlaybook } from "./marketing-agency";
import type { Playbook } from "./types";

export * from "./types";
export { marketingAgencyPlaybook };

export const PLAYBOOKS: readonly Playbook[] = [marketingAgencyPlaybook];

export function playbook(key: string, version?: number): Playbook | null {
  return PLAYBOOKS.find((p) => p.key === key && (version === undefined || p.version === version)) ?? null;
}
