export const DEPARTMENTS = ["sales", "production", "pr", "finance", "tech", "admin"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: "Sales",
  production: "Production",
  pr: "PR",
  finance: "Finance",
  tech: "Technology",
  admin: "Administration",
};

export interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  department: Department;
  is_admin: boolean;
}
