import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRIDGE_CLIENT_KINDS, BRIDGE_LIMITS, BRIDGE_SCOPES, BRIDGE_TOOLS, EXTERNAL_EXECUTORS, parseBearer, planRequest } from "../src";
import { hashToken } from "../src/bridge/server";

const migration = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261019090100_model_bridge.sql"), "utf8")
  .replace(/--[^\n]*/g, "");

describe("the bridge mirrors the database", () => {
  it("scopes", () => {
    const m = /scopes <@ array\[([^\]]+)\]/.exec(migration)!;
    expect(m[1]!.split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...BRIDGE_SCOPES]);
  });
  it("client kinds and executors", () => {
    expect(migration).toContain(`client_kind in (${BRIDGE_CLIENT_KINDS.map((k) => `'${k}'`).join(", ")})`);
    expect(migration).toContain(`task_executor in (${EXTERNAL_EXECUTORS.map((k) => `'${k}'`).join(", ")})`);
  });
  it("limits", () => {
    expect(migration).toContain(`interval '${BRIDGE_LIMITS.maxDays} days'`);
    expect(migration).toContain(`v_recent >= ${BRIDGE_LIMITS.callsPerMinute}`);
    expect(migration).toContain(`length(p_result::text) > ${BRIDGE_LIMITS.maxResultBytes}`);
    expect(migration).toContain(`interval '${BRIDGE_LIMITS.leaseHours} hours'`);
  });
  it("each tool's scope is checked by its function", () => {
    for (const t of Object.values(BRIDGE_TOOLS)) expect(migration).toContain(`'${t.name}', '${t.scope}')`);
  });
});

describe("reading a token", () => {
  const t = `tbk_${"a".repeat(64)}`;
  it("accepts only a well-formed bearer token", () => {
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer  ${t} `)).toBe(t);
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer("Bearer tbk_short")).toBeNull();
    expect(parseBearer(`Basic ${t}`)).toBeNull();
    expect(parseBearer([`Bearer ${t}`])).toBeNull();
  });
  it("is hashed the way the database hashes it", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("planning an external task", () => {
  it("is one task with the person's own title and acceptance test", () => {
    const [task, ...rest] = planRequest("external_task", { platformAdmin: false },
      { title: "Write the guide", acceptance: "The guide covers issuing and revoking.", executor: "external.coding_agent" });
    expect(rest).toHaveLength(0);
    expect(task).toMatchObject({ key: "external.work", title: "Write the guide", executor: "external.coding_agent" });
  });
  it("needs what was asked", () => {
    expect(() => planRequest("external_task", { platformAdmin: false })).toThrow();
  });
});
