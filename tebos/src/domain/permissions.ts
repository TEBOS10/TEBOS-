// Roles and permissions (dossier §34). Row-level security in
// supabase/migrations/20260924184652_rls.sql (+ _hardening) is the enforcement point; this
// matrix lets the application explain and pre-check what a role may do.

export const ORG_ROLES = ["org_admin", "operator", "approver", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = [
  "org.read",
  "org.manage_members",
  "business.write",
  "scan.run",
  "evidence.record",
  "finding.write",
  "action.propose",
  "action.transition",
  "approval.request",
  "approval.decide",
  "connection.manage",
  "credential.read_metadata",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR: Permission[] = [
  "org.read",
  "business.write",
  "scan.run",
  "evidence.record",
  "finding.write",
  "action.propose",
  "action.transition",
  "approval.request",
  "credential.read_metadata",
];

export const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  org_admin: new Set(PERMISSIONS),
  operator: new Set(OPERATOR),
  approver: new Set<Permission>(["org.read", "approval.decide"]),
  viewer: new Set<Permission>(["org.read"]),
};

export function can(role: OrgRole | null | undefined, permission: Permission): boolean {
  return role != null && ROLE_PERMISSIONS[role].has(permission);
}
