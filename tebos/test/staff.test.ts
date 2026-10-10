import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canDraftContent, canReadPlaybook, canSeePipeline, PLAYBOOK_DEPARTMENTS, STAFF_ROLES } from "../src/domain/staff";

const marketer = { admin: false, roles: ["marketing"] };
const rep = { admin: false, roles: ["sales"] };
const admin = { admin: true, roles: [] };
const nobody = { admin: false, roles: [] };

describe("departments", () => {
  it("marketing reads its own playbook, not the sales one", () => {
    expect(canReadPlaybook("marketing", marketer)).toBe(true);
    expect(canReadPlaybook("sales", marketer)).toBe(false);
  });
  it("sales reads both playbooks; admins read everything", () => {
    expect(canReadPlaybook("sales", rep) && canReadPlaybook("marketing", rep)).toBe(true);
    expect(canReadPlaybook("sales", admin) && canReadPlaybook("marketing", admin)).toBe(true);
  });
  it("marketing drafts content but never sees the pipeline", () => {
    expect(canDraftContent(marketer)).toBe(true);
    expect(canSeePipeline(marketer)).toBe(false);
    expect(canSeePipeline(rep)).toBe(true);
  });
  it("someone with no staff role gets nothing", () => {
    expect(canDraftContent(nobody) || canSeePipeline(nobody) || canReadPlaybook("marketing", nobody)).toBe(false);
  });
  it("matches the roles and departments the database allows", () => {
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const file = readdirSync(dir).find((f) => f.endsWith("_marketing_role.sql"))!;
    const sql = readFileSync(new URL(file, dir), "utf8");
    const roles = sql.match(/platform_staff_role_check\s+check \(role in \(([^)]*)\)\)/)![1]!.match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1));
    expect(roles).toEqual([...STAFF_ROLES]);
    const depts = sql.match(/department in \(([^)]*)\)/)![1]!.match(/'([a-z]+)'/g)!.map((s) => s.slice(1, -1));
    expect(depts).toEqual([...PLAYBOOK_DEPARTMENTS]);
  });
});
