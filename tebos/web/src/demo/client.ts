// An in-browser stand-in for the Supabase API, used only in demo mode. It
// answers the real supabase-js client's PostgREST requests from the demo's
// in-memory tables (eq / neq / is / in filters, order, limit, counts, single
// reads, inserts and updates), and mirrors the one database rule the demo
// walk-through relies on: an approval decision moves its action on.
// Nothing leaves the browser.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { Db } from "../lib/supabase";
import { DEMO_USER, DEMO_USER_ID, demoTables, type Tables } from "./data";

const DEMO_URL = "https://demo.tebos.invalid";
type Row = Record<string, unknown>;

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return decodeURIComponent(v).replace(/^"(.*)"$/, "$1");
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    const cell = row[key];
    if (op === "eq" && String(cell) !== String(parseValue(value))) return false;
    if (op === "neq" && String(cell) === String(parseValue(value))) return false;
    if (op === "is" && !(value === "null" ? cell === null || cell === undefined : cell === parseValue(value))) return false;
    if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map(parseValue).map(String);
      if (!list.includes(String(cell))) return false;
    }
    if (op === "gte" && !(String(cell) >= String(parseValue(value)))) return false;
    if (op === "lte" && !(String(cell) <= String(parseValue(value)))) return false;
  }
  return true;
}

function order(rows: Row[], spec: string | null) {
  if (!spec) return rows;
  const keys = spec.split(",").map((s) => {
    const [col, dir] = s.split(".");
    return { col: col!, desc: dir === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of keys) {
      const x = a[col] as string | number | null;
      const y = b[col] as string | number | null;
      if (x === y) continue;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x < y ? -1 : 1) * (desc ? -1 : 1);
    }
    return 0;
  });
}

const DEFAULT_STATUS: Record<string, string> = {
  scans: "queued", actions: "proposed", approvals: "pending", action_runs: "queued", findings: "draft", connection_instances: "configured",
};

// The database moves an action when its approval is requested or decided
// (migration approval_drives_action); the demo does the same.
function applyApproval(tables: Tables, approval: Row, inserted: boolean) {
  const action = tables.actions?.find((a) => a.id === approval.action_id);
  if (!action) return;
  if (inserted && approval.status === "pending" && action.status === "ready") action.status = "awaiting_approval";
  if (!inserted && action.status === "awaiting_approval") {
    if (approval.status === "approved") action.status = "approved";
    if (approval.status === "rejected") action.status = "ready";
  }
  action.updated_at = new Date().toISOString();
}

function answerRpc(tables: Tables, name: string, args: Record<string, unknown>): unknown {
  if (name === "submit_interview_answers") {
    const session = tables.interview_sessions?.find((x) => x.id === args.p_session);
    const answers = ((args.p_answers ?? []) as Array<{ answer: string }>).filter((a) => a.answer.trim());
    if (session) Object.assign(session, { status: "completed", extraction_status: "done" });
    return answers.length;
  }
  if (name === "create_invitation") return "demo-invitation";
  return crypto.randomUUID();
}

export function demoFetch(tables: Tables): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });
    const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text().then((t) => (t ? JSON.parse(t) : null));

    if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname === "/auth/v1/user") return json(DEMO_USER);
      return json({});
    }

    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!m) return json({ message: "Not found" }, 404);
    const [, rpc, name] = m;
    if (rpc) return json(answerRpc(tables, name!, body ?? {}));

    const table = (tables[name!] ??= []);
    const accept = req.headers.get("accept") ?? "";
    const wantsObject = accept.includes("vnd.pgrst.object");
    const prefer = req.headers.get("prefer") ?? "";

    if (req.method === "POST" || req.method === "PATCH") {
      const now = new Date().toISOString();
      let result: Row[];
      if (req.method === "POST") {
        result = (Array.isArray(body) ? body : [body]).map((r: Row) => ({
          id: crypto.randomUUID(), created_at: now, updated_at: now, status: r.status ?? DEFAULT_STATUS[name!], ...r,
        }));
        table.push(...result);
        if (name === "approvals") for (const r of result) applyApproval(tables, r, true);
      } else {
        result = table.filter((r) => matches(r, url.searchParams));
        for (const r of result) {
          Object.assign(r, body, { updated_at: now });
          if (name === "approvals" && body?.status) Object.assign(r, { decided_by: DEMO_USER_ID, decided_at: now });
          if (name === "approvals") applyApproval(tables, r, false);
        }
      }
      return json(wantsObject ? (result[0] ?? null) : result, 201);
    }
    if (req.method === "DELETE") return json(null, 204);

    let rows = order(table.filter((r) => matches(r, url.searchParams)), url.searchParams.get("order"));
    const total = rows.length;
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    const range = { "content-range": `0-${Math.max(0, rows.length - 1)}/${prefer.includes("count=exact") ? total : "*"}` };
    if (req.method === "HEAD") return new Response(null, { status: 200, headers: range });
    if (wantsObject) {
      if (rows.length !== 1) return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null }, 406);
      return json(rows[0], 200, range);
    }
    return json(rows, 200, range);
  };
}

/** A signed-in client whose every request is answered from the demo's tables. */
export function createDemoClient(): Db {
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const payload = btoa(JSON.stringify({ sub: DEMO_USER_ID, exp, role: "authenticated" })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const session = {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.demo`, refresh_token: "demo", token_type: "bearer", expires_in: 86_400, expires_at: exp, user: DEMO_USER,
  };
  const store = new Map<string, string>([["sb-demo-auth-token", JSON.stringify(session)]]);
  return createClient<Database>(DEMO_URL, "demo", {
    global: { fetch: demoFetch(demoTables()) },
    auth: {
      storageKey: "sb-demo-auth-token",
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
