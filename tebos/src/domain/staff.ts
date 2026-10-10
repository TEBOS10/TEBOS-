// TEBOS's own departments: staff roles and who reads which playbook. Mirrors
// the checks and policies in the marketing_role migration; the database
// enforces them, this lets the interface say the same thing.

export const STAFF_ROLES = ["sales", "maintainer", "marketing"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PLAYBOOK_DEPARTMENTS = ["sales", "marketing"] as const;
export type PlaybookDepartment = (typeof PLAYBOOK_DEPARTMENTS)[number];

/** Who reads each department's playbook (platform admins read every one). */
export const PLAYBOOK_READERS: Record<PlaybookDepartment, readonly StaffRole[]> = {
  sales: ["sales", "maintainer"],
  marketing: ["sales", "maintainer", "marketing"],
};

/** Who drafts marketing and PR content. */
export const CONTENT_AUTHORS: readonly StaffRole[] = ["sales", "maintainer", "marketing"];

export interface StaffRoles {
  admin: boolean;
  roles: readonly string[];
}

export function canReadPlaybook(dept: PlaybookDepartment, me: StaffRoles): boolean {
  return me.admin || PLAYBOOK_READERS[dept].some((r) => me.roles.includes(r));
}

export function canDraftContent(me: StaffRoles): boolean {
  return me.admin || CONTENT_AUTHORS.some((r) => me.roles.includes(r));
}

/** The pipeline (leads, clients, contracts) is for sales and maintainers only. */
export function canSeePipeline(me: StaffRoles): boolean {
  return me.admin || me.roles.includes("sales") || me.roles.includes("maintainer");
}
