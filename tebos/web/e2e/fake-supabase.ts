// A network-level stand-in for the Supabase HTTP API, for interface tests.
// It answers the real supabase-js client's PostgREST requests from in-memory
// fixture tables (eq / in / is filters, order, limit, counts, single-object
// reads, inserts and updates). It does NOT reproduce the database's rules —
// those are tested against real Postgres in the core package — but it can be
// told to refuse a write the way the database would, so the interface's
// handling of refusals can be checked.
import type { Page, Route } from "@playwright/test";
import { fixtureTables, USER_ID } from "./fixtures";

export const FAKE_URL = "https://fixture.supabase.test";

export interface Refusal {
  table: string;
  method: "POST" | "PATCH";
  hint: string;
  message: string;
}

export interface FakeSupabase {
  tables: ReturnType<typeof fixtureTables>;
  writes: Array<{ method: string; table: string; body: unknown }>;
  refuse: (r: Refusal | null) => void;
}

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v.replace(/^"(.*)"$/, "$1");
}

function matches(row: Record<string, unknown>, params: URLSearchParams): boolean {
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
  }
  return true;
}

function order(rows: Array<Record<string, unknown>>, spec: string | null) {
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

export async function installFakeSupabase(page: Page, opts: { signedIn?: boolean } = {}): Promise<FakeSupabase> {
  const tables = fixtureTables();
  const writes: FakeSupabase["writes"] = [];
  let refusal: Refusal | null = null;

  if (opts.signedIn !== false) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ sub: USER_ID, exp, role: "authenticated" })).toString("base64url");
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
      refresh_token: "fixture",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      user: { id: USER_ID, email: "operator@fixture.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    };
    await page.addInitScript((s) => localStorage.setItem("sb-fixture-auth-token", s), JSON.stringify(session));
  }

  // external fonts are irrelevant to behaviour
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  await page.route(`${FAKE_URL}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });

    if (url.pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({}) });
    }

    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, headers, body: "{}" });
    const [, rpc, name] = m;
    if (rpc) return route.fulfill({ status: 200, headers, body: JSON.stringify(crypto.randomUUID()) });

    const table = (tables[name!] ??= []);
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const prefer = req.headers()["prefer"] ?? "";

    if (req.method() === "POST" || req.method() === "PATCH") {
      const body = req.postDataJSON();
      writes.push({ method: req.method(), table: name!, body });
      if (refusal && refusal.table === name && refusal.method === req.method()) {
        return route.fulfill({ status: 400, headers, body: JSON.stringify({ code: "P0001", message: refusal.message, hint: refusal.hint, details: null }) });
      }
      let result: Array<Record<string, unknown>>;
      if (req.method() === "POST") {
        const now = new Date().toISOString();
        result = (Array.isArray(body) ? body : [body]).map((r: Record<string, unknown>) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, status: r.status ?? defaultStatus(name!), ...r }));
        table.push(...result);
      } else {
        result = table.filter((r) => matches(r, url.searchParams));
        for (const r of result) Object.assign(r, body, { updated_at: new Date().toISOString() });
      }
      const out = wantsObject ? result[0] : result;
      return route.fulfill({ status: 201, headers, body: JSON.stringify(out ?? null) });
    }

    let rows = order(table.filter((r) => matches(r, url.searchParams)), url.searchParams.get("order"));
    const total = rows.length;
    const limit = url.searchParams.get("limit");
    if (limit) rows = rows.slice(0, Number(limit));
    const range = { "content-range": `0-${Math.max(0, rows.length - 1)}/${prefer.includes("count=exact") ? total : "*"}` };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...headers, ...range }, body: "" });
    if (wantsObject) {
      if (rows.length !== 1) return route.fulfill({ status: 406, headers, body: JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null }) });
      return route.fulfill({ status: 200, headers: { ...headers, ...range }, body: JSON.stringify(rows[0]) });
    }
    return route.fulfill({ status: 200, headers: { ...headers, ...range }, body: JSON.stringify(rows) });
  });

  return { tables, writes, refuse: (r) => (refusal = r) };
}

function defaultStatus(table: string): string | undefined {
  return { scans: "queued", actions: "proposed", approvals: "pending", action_runs: "queued", findings: "draft" }[table];
}
