// A network-level stand-in for the Supabase HTTP API, for interface tests.
// It answers the real supabase-js client's PostgREST requests from in-memory
// fixture tables (eq / in / is filters, order, limit, counts, single-object
// reads, inserts and updates). It does NOT reproduce the database's rules —
// those are tested against real Postgres in the core package — but it can be
// told to refuse a write the way the database would, so the interface's
// handling of refusals can be checked.
import type { Page, Route } from "@playwright/test";
import { fixtureTables, ORG, USER_ID } from "./fixtures";

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
    // ISO dates and times compare correctly as strings
    if (op === "gte" && !(String(cell) >= String(parseValue(value)))) return false;
    if (op === "lt" && !(String(cell) < String(parseValue(value)))) return false;
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

/** An authenticator (TOTP factor) on the fixture account. */
export interface FakeFactor {
  id: string;
  friendly_name: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
}

/** The only code the fake accepts. */
export const GOOD_CODE = "123456";

const fixtureUser = (factors: FakeFactor[]) => ({
  id: USER_ID, email: "operator@fixture.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {},
  created_at: new Date().toISOString(), factors,
});

function fixtureSession(aal: "aal1" | "aal2" | undefined, factors: FakeFactor[]) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID, exp, role: "authenticated", ...(aal ? { aal } : {}) })).toString("base64url");
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: fixtureUser(factors),
  };
}

export const verifiedFactor = (friendly_name = "Phone"): FakeFactor => ({
  id: crypto.randomUUID(), friendly_name, factor_type: "totp", status: "verified", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

export async function installFakeSupabase(
  page: Page,
  opts: { signedIn?: boolean; aal?: "aal1" | "aal2"; factors?: FakeFactor[] } = {},
): Promise<FakeSupabase & { factors: FakeFactor[] }> {
  const tables = fixtureTables();
  const writes: FakeSupabase["writes"] = [];
  let refusal: Refusal | null = null;
  const factors: FakeFactor[] = opts.factors ?? [];
  const storedFiles = new Set<string>();

  if (opts.signedIn !== false) {
    const session = fixtureSession(opts.aal, factors);
    await page.addInitScript((s) => localStorage.setItem("sb-fixture-auth-token", s), JSON.stringify(session));
  }

  // external fonts are irrelevant to behaviour
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  await page.route(`${FAKE_URL}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });

    if (url.pathname.startsWith("/auth/v1/factors")) {
      // two-step sign-in: enrol, challenge, verify (only GOOD_CODE passes), remove
      writes.push({ method: req.method(), table: `auth${url.pathname.slice(8)}`, body: req.method() === "DELETE" ? null : req.postDataJSON() });
      const [, , , , id, step] = url.pathname.split("/");
      const now = new Date().toISOString();
      if (!id && req.method() === "POST") {
        const body = req.postDataJSON() as { friendly_name?: string };
        const f: FakeFactor = { id: crypto.randomUUID(), friendly_name: body.friendly_name ?? "", factor_type: "totp", status: "unverified", created_at: now, updated_at: now };
        factors.push(f);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ id: f.id, type: "totp", friendly_name: f.friendly_name,
          totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/TEBOS:fixture?secret=JBSWY3DPEHPK3PXP" } }) });
      }
      const f = factors.find((x) => x.id === id);
      if (!f) return route.fulfill({ status: 404, headers, body: JSON.stringify({ code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" }) });
      if (req.method() === "DELETE") {
        factors.splice(factors.indexOf(f), 1);
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ id: f.id }) });
      }
      if (step === "challenge") return route.fulfill({ status: 200, headers, body: JSON.stringify({ id: crypto.randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 }) });
      if (step === "verify") {
        const { code } = req.postDataJSON() as { code: string };
        if (code !== GOOD_CODE) return route.fulfill({ status: 422, headers, body: JSON.stringify({ code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" }) });
        f.status = "verified";
        return route.fulfill({ status: 200, headers, body: JSON.stringify(fixtureSession("aal2", factors)) });
      }
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      if (req.method() !== "GET") writes.push({ method: req.method(), table: `auth${url.pathname.slice(8)}${url.search}`, body: req.postDataJSON() });
      // Updating the user answers with the user, as Supabase does.
      if (url.pathname === "/auth/v1/token") return route.fulfill({ status: 200, headers, body: JSON.stringify(fixtureSession(factors.some((f) => f.status === "verified") ? "aal2" : undefined, factors)) });
      return route.fulfill({ status: 200, headers, body: JSON.stringify(url.pathname === "/auth/v1/user" ? fixtureUser(factors) : {}) });
    }

    if (url.pathname.startsWith("/storage/v1/object/")) {
      // the vault's bucket: upload once (never over a file), sign a link, serve the signed link
      const signing = url.pathname.startsWith("/storage/v1/object/sign/");
      // the path within the bucket, as the database records it
      const rest = decodeURIComponent(url.pathname.slice(`/storage/v1/object/${signing ? "sign/" : ""}`.length)).replace(/^tepos-vault\//, "");
      if (signing) {
        const path = rest;
        if (req.method() === "GET") return route.fulfill({ status: storedFiles.has(path) ? 200 : 404, headers: { "content-type": "application/pdf" }, body: "%PDF-1.4 fixture" });
        writes.push({ method: "SIGN", table: "storage", body: path });
        return route.fulfill({ status: 200, headers, body: JSON.stringify({ signedURL: `/object/sign/tepos-vault/${path}?token=fixture` }) });
      }
      writes.push({ method: "UPLOAD", table: "storage", body: rest });
      if (storedFiles.has(rest)) return route.fulfill({ status: 400, headers, body: JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }) });
      storedFiles.add(rest);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ Key: rest, Id: crypto.randomUUID() }) });
    }

    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, headers, body: "{}" });
    const [, rpc, name] = m;
    if (rpc) {
      const args = req.postDataJSON() ?? {};
      writes.push({ method: "RPC", table: name!, body: args });
      return route.fulfill({ status: 200, headers, body: JSON.stringify(answerRpc(tables, name!, args, storedFiles)) });
    }

    const table = (tables[name!] ??= []);
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const prefer = req.headers()["prefer"] ?? "";

    if (req.method() === "DELETE") {
      writes.push({ method: "DELETE", table: name!, body: Object.fromEntries(url.searchParams) });
      const gone = table.filter((r) => matches(r, url.searchParams));
      tables[name!] = table.filter((r) => !gone.includes(r));
      return route.fulfill({ status: 204, headers, body: "" });
    }

    if (req.method() === "POST" || req.method() === "PATCH") {
      const body = req.postDataJSON();
      writes.push({ method: req.method(), table: name!, body });
      if (refusal && refusal.table === name && refusal.method === req.method()) {
        return route.fulfill({ status: 400, headers, body: JSON.stringify({ code: "P0001", message: refusal.message, hint: refusal.hint, details: null }) });
      }
      let result: Array<Record<string, unknown>>;
      if (req.method() === "POST") {
        const now = new Date().toISOString();
        let incoming = (Array.isArray(body) ? body : [body]) as Array<Record<string, unknown>>;
        // an upsert that ignores duplicates, as the database does on its unique key
        const conflict = url.searchParams.get("on_conflict");
        if (conflict && prefer.includes("resolution=ignore-duplicates")) {
          const keys = conflict.split(",");
          incoming = incoming.filter((r) => !table.some((x) => keys.every((k) => x[k] === r[k])));
        }
        result = incoming.map((r: Record<string, unknown>) => ({ id: crypto.randomUUID(), created_at: now, updated_at: now, status: r.status ?? defaultStatus(name!), ...COLUMN_DEFAULTS[name!], ...r }));
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

  return { tables, writes, factors, refuse: (r) => (refusal = r) };
}

// The two invitation functions, answered from the fixture tables; any other RPC returns a fresh id.
function answerRpc(tables: FakeSupabase["tables"], name: string, args: Record<string, string>, storedFiles = new Set<string>()): unknown {
  const now = new Date().toISOString();
  if (name === "vault_confirm" || name === "vault_open") {
    // the vault: stored only when the file is there; an opening is logged before the path is handed back
    const t = tables as Record<string, Array<Record<string, unknown>>>;
    const doc = t.vault_documents?.find((d) => d.id === args.p_document);
    if (!doc || !storedFiles.has(String(doc.storage_path))) return null;
    if (name === "vault_confirm") return (doc.stored_at ??= now);
    (t.vault_reads ??= []).unshift({ id: crypto.randomUUID(), org_id: doc.org_id, document_id: doc.id, user_id: USER_ID, opened_at: now });
    return doc.storage_path;
  }
  if (name === "create_invitation") {
    (tables.invitations ??= []).unshift({ id: crypto.randomUUID(), org_id: args.p_org, email: args.p_email.toLowerCase(), role: args.p_role, status: "pending", invited_by: USER_ID, accepted_by: null, created_at: now, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), accepted_at: null });
    return "fixture-invitation-token";
  }
  if (name === "create_private_organisation") {
    const id = crypto.randomUUID();
    tables.organisations!.push({ id, name: args.p_name, slug: args.p_slug, private: true, created_at: now });
    tables.memberships!.push({ org_id: id, user_id: USER_ID, role: "org_admin", created_at: now });
    return id;
  }
  if (name === "accept_invitation") {
    if (args.p_token === "expired-token") return null;
    const invite = tables.invitations?.find((i) => i.status === "pending");
    if (!invite) return null;
    Object.assign(invite, { status: "accepted", accepted_by: USER_ID, accepted_at: now });
    tables.memberships!.push({ org_id: invite.org_id, user_id: USER_ID, role: invite.role, created_at: now });
    return invite.org_id;
  }
  if (name === "contract_for_token") {
    const c = (tables as Record<string, Array<Record<string, unknown>>>).contract_links?.find((x) => x.token === args.p_token);
    return c ? [{ title: c.title, body: c.body, body_hash: c.body_hash, business: c.business, status: c.status, expires_at: c.expires_at, accepted_at: c.accepted_at ?? null, accepted_name: c.accepted_name ?? null }] : [];
  }
  if (name === "accept_contract") {
    const c = (tables as Record<string, Array<Record<string, unknown>>>).contract_links?.find((x) => x.token === args.p_token);
    if (c) Object.assign(c, { status: "accepted", accepted_at: now, accepted_name: args.p_name });
    return now;
  }
  const t = tables as Record<string, Array<Record<string, unknown>>>;
  if (name === "issue_bridge_client") {
    const token = `tbk_${"0".repeat(64)}`;
    const id = crypto.randomUUID();
    const expires_at = new Date(Date.now() + Number(args.p_days ?? 30) * 864e5).toISOString();
    (t.bridge_clients ??= []).unshift({ id, org_id: args.p_org, name: args.p_name, client_kind: args.p_kind, token_hint: token.slice(0, 12),
      scopes: args.p_scopes, expires_at, created_by: USER_ID, created_at: now, revoked_at: null, revoked_by: null, last_used_at: null });
    return [{ client_id: id, token, expires_at }];
  }
  if (name === "revoke_bridge_client") {
    const c = t.bridge_clients?.find((x) => x.id === args.p_client);
    if (c) Object.assign(c, { revoked_at: now, revoked_by: USER_ID });
    return Boolean(c);
  }
  if (name === "review_work_task") {
    const task = t.work_tasks?.find((x) => x.id === args.p_task);
    const ok = (args.p_ok as unknown) === true;
    if (task) Object.assign(task, { status: ok ? "verified" : "rejected", verification: { ok, recount: null, detail: args.p_note ?? "Reviewed against its acceptance test and accepted.", reviewed_by: USER_ID } });
    return ok ? "verified" : "rejected";
  }
  if (name === "approve_step_proposal") {
    // retires the founder step and puts the new one in its place, as the database function does
    const prop = t.step_proposals?.find((x) => x.id === args.p_proposal);
    const old = t.board_steps?.find((x) => x.id === prop?.step_id);
    if (!prop || !old) return null;
    const id = crypto.randomUUID();
    old.retired_at = now;
    t.board_steps!.push({ ...old, id, performer: prop.performer, performer_role: prop.performer_role, component_id: prop.component_id,
      decision_rule: prop.decision_rule, documented: true, basis: "stated", evidence_id: null, retired_at: null, created_at: now });
    Object.assign(prop, { status: "approved", decided_by: USER_ID, decided_at: now, new_step_id: id, decision_note: args.p_note ?? null });
    return id;
  }
  if (name === "start_meeting_call") {
    // records the waiting-list lead and the requested call, as the database function does
    const enquiry = crypto.randomUUID();
    const id = crypto.randomUUID();
    (t.intake_calls ??= []).push({
      id, enquiry_id: enquiry, requested_by: USER_ID, phone_number: args.p_phone, status: "requested", started_at: null, ended_at: null,
      transcript: null, duration_secs: null, wants_to_proceed: null, outcome_source: null, outcome_note: null, failure_detail: null,
      follow_up_due_at: null, follow_up_queued_at: null, created_at: now,
    });
    return id;
  }
  if (name === "apply_blueprint") {
    // lays the blueprint down as proposals, as the database function does
    const bp = args.p_blueprint as unknown as { key: string; version: number; pieces: Array<Record<string, unknown>>; flows: Array<Record<string, unknown> & { steps: Array<Record<string, unknown>> }> };
    const tag = `${bp.key}@${bp.version}`;
    const base = { org_id: ORG, business_id: args.p_business, basis: "proposed", from_blueprint: tag, created_at: now, updated_at: now, retired_at: null };
    const pieces = bp.pieces.map((p) => ({ id: crypto.randomUUID(), ...base, name: p.name, kind: p.kind, description: p.description, owner_role: p.owner_role, supplier: null, connection_id: null, evidence_id: null }));
    (t.board_components ??= []).push(...pieces);
    let steps = 0;
    for (const f of bp.flows) {
      const flowId = crypto.randomUUID();
      (t.board_flows ??= []).push({ id: flowId, ...base, name: f.name, starts_when: f.starts_when, done_when: f.done_when, owner_role: f.owner_role, objective_id: null });
      for (const s of f.steps) {
        (t.board_steps ??= []).push({ id: crypto.randomUUID(), ...base, flow_id: flowId, position: s.position, name: s.name, performer: s.performer, performer_role: s.performer_role,
          component_id: pieces.find((p) => p.name === s.piece)?.id ?? null, decision_rule: s.decision_rule, documented: false, evidence_id: null });
        steps++;
      }
    }
    return { blueprint: tag, pieces: pieces.length, flows: bp.flows.length, steps };
  }
  if (name === "reeds_capture") {
    // REEDS intake as the database does it: the same source once; a later source that disagrees becomes a conflict
    const t = tables as unknown as Record<string, Array<Record<string, unknown>>>;
    const a = args as unknown as Record<string, unknown>;
    const key = `${a.p_source_type}:${a.p_source_ref ? String(a.p_source_ref).trim() : String(a.p_summary).trim().replace(/\s+/g, " ").toLowerCase()}`;
    const found = (t.reeds_source_events ??= []).find((e) => e.org_id === a.p_org && e.dedupe_key === key);
    const health = (t.reeds_integrations ?? []).find((x) => x.org_id === a.p_org && x.source_type === a.p_source_type);
    if (found) { if (health) health.duplicates = Number(health.duplicates) + 1; return { source_event_id: found.id, duplicate: true, created: 0, conflicts: 0, skipped: 0 }; }
    const items = (a.p_items ?? []) as Array<Record<string, string>>;
    const ev = { id: crypto.randomUUID(), org_id: a.p_org, source_type: a.p_source_type, source_ref: a.p_source_ref ?? null, source_link: a.p_source_link ?? null,
      received_at: a.p_received_at, sender_label: a.p_sender ?? null, summary: a.p_summary, dedupe_key: key, triage: a.p_triage, workspace: a.p_workspace,
      status: items.length ? "actioned" : "triaged", error: null, attempts: 0, created_by: USER_ID, created_at: now, updated_at: now };
    t.reeds_source_events.push(ev);
    let created = 0, conflicts = 0, skipped = 0;
    for (const i of items) {
      if (i.kind === "decision") {
        (t.reeds_decisions ??= []).push({ id: crypto.randomUUID(), org_id: a.p_org, source_event_id: ev.id, question: i.title, options: null, recommendation: i.recommendation || null,
          evidence: null, decide_by: i.due_on || null, status: "open", decision: null, rationale: null, decided_at: null, decided_by: null, created_at: now, updated_at: now });
        created++; continue;
      }
      const same = (t.reeds_commitments ??= []).find((c) => c.org_id === a.p_org && String(c.title).toLowerCase() === i.title.toLowerCase() && !["done", "cancelled"].includes(String(c.status)));
      if (same) {
        if (i.due_on && same.due_on !== i.due_on) {
          (t.reeds_conflicts ??= []).push({ id: crypto.randomUUID(), org_id: a.p_org, commitment_id: same.id, field: "due_on", recorded_value: same.due_on, reported_value: i.due_on,
            source_event_id: ev.id, resolution: null, resolved_at: null, created_at: now });
          conflicts++;
        } else skipped++;
        continue;
      }
      t.reeds_commitments.push({ id: crypto.randomUUID(), org_id: a.p_org, source_event_id: ev.id, title: i.title, expected_outcome: null, owner: i.owner || "founder", owner_label: null,
        due_on: i.due_on || null, due_basis: i.due_on ? (i.due_basis || "reported") : "unknown", priority: i.priority || "normal", priority_reason: null, workspace: a.p_workspace,
        next_action: i.next_action || null, approval: i.approval === "required" ? "required" : "not_needed", status: i.next_action ? "ready" : "captured",
        blocked_reason: null, completion_evidence: null, completed_at: null, completed_by: null, created_at: now, updated_at: now });
      created++;
    }
    if (health) health.imported = Number(health.imported) + 1;
    return { source_event_id: ev.id, duplicate: false, created, conflicts, skipped };
  }
  if (name === "worker_status") {
    // the worker's heartbeat: a test seeds tables.worker_heartbeats; none means "never"
    const beats = ((tables as unknown as Record<string, Array<Record<string, unknown>>>).worker_heartbeats ?? [])
      .slice().sort((a, b) => String(b.last_beat_at).localeCompare(String(a.last_beat_at)));
    const last = beats[0];
    if (!last) return [{ state: "never", last_beat_at: null, minutes_since: null, mode: null, last_pass_errors: 0, last_error: null, last_error_at: null }];
    const min = Math.floor((Date.now() - Date.parse(String(last.last_beat_at))) / 60_000);
    return [{ state: min <= 30 ? "running" : min <= 120 ? "late" : "stopped", last_beat_at: last.last_beat_at, minutes_since: min, mode: last.mode,
      last_pass_errors: last.last_pass_errors ?? 0, last_error: last.last_error ?? null, last_error_at: last.last_error_at ?? null }];
  }
  if (name === "tepos_open_week") {
    // the week board: the template copied in once; opening again adds only template items not yet in the week
    const t = tables as unknown as Record<string, Array<Record<string, unknown>>>;
    const start = String(args.p_week_start);
    const addDays = (n: number) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    let week = (t.tepos_weeks ??= []).find((w) => w.org_id === args.p_org && w.week_start === start);
    if (!week) { week = { id: crypto.randomUUID(), org_id: args.p_org, week_start: start, timezone: "Africa/Johannesburg", created_at: now }; t.tepos_weeks.push(week); }
    for (const d of (t.tepos_plan_days ?? []).filter((x) => x.org_id === args.p_org)) {
      if ((t.tepos_week_days ??= []).some((x) => x.week_id === week!.id && x.weekday === d.weekday)) continue;
      t.tepos_week_days.push({ id: crypto.randomUUID(), org_id: args.p_org, week_id: week.id, weekday: d.weekday, local_date: addDays(Number(d.weekday) - 1),
        scene: d.scene, focus: d.focus, lens: d.lens, deliverable: d.deliverable, saved_to: d.saved_to, outcomes: null, blockers: null, learning: null, carried_forward: null,
        closed_at: null, created_at: now, updated_at: now });
    }
    for (const i of (t.tepos_plan_items ?? []).filter((x) => x.org_id === args.p_org && x.active !== false)) {
      const day = t.tepos_week_days.find((x) => x.week_id === week!.id && x.weekday === i.weekday)!;
      if ((t.tepos_week_tasks ??= []).some((x) => x.day_id === day.id && x.plan_item_id === i.id)) continue;
      t.tepos_week_tasks.push({ id: crypto.randomUUID(), org_id: args.p_org, week_id: week.id, day_id: day.id, plan_item_id: i.id, local_date: day.local_date,
        position: i.position, title: i.title, lens: i.lens, action: i.action, definition_of_done: i.definition_of_done, est_minutes: i.est_minutes, status: "not_started",
        status_reason: null, defer_until: null, owner_label: null, evidence_note: null, output_link: null, completed_at: null, completed_by: null, created_at: now, updated_at: now });
    }
    return week.id;
  }
  if (name === "change_allowance") {
    // the plan's monthly allowance and what this month used, as the database computes it
    const t = tables as unknown as Record<string, Array<Record<string, unknown>>>;
    const plan = (t.billing_accounts ?? []).find((b) => b.org_id === args.p_org && b.status === "active")?.plan as string | undefined;
    const allowance = ({ starter: 5, growth: 15, company: 40 } as Record<string, number>)[plan ?? ""] ?? 0;
    const used = (t.change_requests ?? []).filter((c) => c.org_id === args.p_org && c.status !== "cancelled").reduce((n, c) => n + Number(c.units ?? 1), 0);
    const d = new Date();
    const period = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const resets = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    return [{ plan: plan ?? null, allowance, used, period, resets_on: resets }];
  }
  if (name === "staff_directory") {
    const roles = new Map<string, string[]>();
    for (const a of t.platform_admins ?? []) roles.set(String(a.user_id), ["admin"]);
    for (const s of t.platform_staff ?? []) roles.set(String(s.user_id), [...(roles.get(String(s.user_id)) ?? []), String(s.role)]);
    return [...roles].map(([user_id, r]) => {
      const p = (t.staff_profiles ?? []).find((x) => x.user_id === user_id);
      return { user_id, display_name: p?.display_name ?? "Staff", email: p?.email ?? `${user_id}@tebos.test`, roles: r };
    });
  }
  if (name === "create_staff_invitation") {
    (t.staff_invitations ??= []).unshift({ id: crypto.randomUUID(), email: args.p_email.toLowerCase(), role: args.p_role, status: "pending", invited_by: USER_ID, accepted_by: null, created_at: now, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), accepted_at: null });
    return "fixture-staff-token";
  }
  if (name === "staff_invitation_for_token") {
    const i = (t.staff_invitation_links ?? []).find((x) => x.token === args.p_token);
    return i ? [{ email: i.email, role: i.role, expires_at: new Date(Date.now() + 864e5).toISOString() }] : [];
  }
  if (name === "accept_staff_invitation") {
    const i = (t.staff_invitation_links ?? []).find((x) => x.token === args.p_token);
    if (!i) return null;
    (t.platform_staff ??= []).push({ user_id: USER_ID, role: i.role, added_by: null, created_at: now });
    return i.role;
  }
  if (name === "submit_self_check") {
    const answers = args.p_answers as unknown as number[];
    return (answers.reduce((a, b) => a + b, 0) * 100) / 20;
  }
  if (name === "submit_interview_answers") {
    const session = tables.interview_sessions?.find((x) => x.id === args.p_session);
    const answers = (args.p_answers as unknown as Array<{ answer: string }>).filter((a) => a.answer.trim());
    if (session) Object.assign(session, { status: "completed", extraction_status: "done" });
    return answers.length;
  }
  return crypto.randomUUID();
}

// Column defaults the database would fill in, for tables the tests insert into.
const COLUMN_DEFAULTS: Record<string, Record<string, unknown>> = {
  // the database's defaults; the reference stands in for the trigger that numbers cases
  property_cases: { ref: "PA-001", disposition: "hold_optimise", suspected_cause: "unknown", authority: "unconfirmed", disposition_at: new Date().toISOString() },
  property_pathways: { specialists: [] },
  // the references stand in for the trigger that numbers listings and contacts
  agent_listings: { ref: "L-001", stage_at: new Date().toISOString() },
  agent_contacts: { ref: "B-001", stage_at: new Date().toISOString() },
  vault_documents: { stored_at: null, archived_at: null, note: null, pack_item: null },
  // the database copies the case's figures into a baseline; the fake leaves it empty, as a case with no figures would be refused
  property_baselines: { figures: [], captured_on: new Date().toISOString().slice(0, 10), target_note: null },
  property_workstreams: { approval: "not_needed", status: "planned" },
  interview_sessions: { transcript: null, extraction_status: "pending", extraction_detail: null, failure_detail: null, duration_seconds: null, provider: null, provider_reference: null, started_at: null, ended_at: null },
  // the client channel: the database sizes a new request at 1, with no outcome yet
  change_requests: { units: 1, outcome_note: null, finished_at: null, period: new Date().toISOString().slice(0, 8) + "01" },
  client_messages: { from_tebos: false, author_id: "00000000-0000-4000-8000-000000000001" },
  tepos_plan_items: { active: true },
  reeds_integrations: { state: "not_connected", detail: null, last_success_at: null, last_failure_at: null, last_error: null, imported: 0, duplicates: 0 },
  connection_instances: { business_id: null, granted_scopes: [], credential_ref_id: null, webhook_credential_ref_id: null, last_verified_at: null, last_success_at: null, last_failure_at: null, failure_detail: null, verification_requested_at: null },
};

function defaultStatus(table: string): string | undefined {
  return { scans: "queued", actions: "proposed", approvals: "pending", action_runs: "queued", findings: "draft", connection_instances: "configured", change_requests: "received" }[table];
}
