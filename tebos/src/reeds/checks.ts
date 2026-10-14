// REEDS executors and their independent verifiers. Each check has two
// separately written queries: the executor's (what it found, with the records
// it found) and the verifier's (a recount, plus a re-test of every listed
// record against its own definition of the rule). A task is verified only if
// both agree. Every query reads at the request's fixed moment (as_of, set when
// it was planned), so a window like "last 24 hours" means the same thing to
// both. Org checks filter by the request's organisation; platform checks are
// only ever planned for platform admins.

import type pg from "pg";
import type { CheckResult } from "../domain/work";

type Db = Pick<pg.PoolClient, "query">;
export interface CheckInput {
  orgId: string;
  asOf: string;
}
export interface Verification {
  ok: boolean;
  recount: number | null;
  detail: string;
}

const LIMIT = 50;

interface CountCheck {
  /** Executor: rows matching, as `id`, newest first. $1 = org, $2 = as_of. */
  list: string;
  /** Verifier: an independent count of the same rule. $1 = org, $2 = as_of. */
  recount: string;
  /** Verifier: how many of $3 (ids) still match the rule. $1 = org, $2 = as_of. */
  recheck: string;
}

export const COUNT_CHECKS: Record<string, CountCheck> = {
  "count.approvals_pending": {
    list: `select id::text, count(*) over () ::int as n from public.approvals
            where org_id = $1 and status = 'pending' and requested_at <= $2 order by requested_at desc limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.approvals a where a.status = 'pending' and a.org_id = $1 and a.requested_at <= $2`,
    recheck: `select count(*)::int as n from public.approvals a where a.id = any($3::uuid[]) and a.org_id = $1 and a.status = 'pending' and $2::timestamptz is not null`,
  },
  "count.agent_runs_failed": {
    list: `select id::text, count(*) over () ::int as n from public.agent_runs
            where org_id = $1 and status = 'failed' and started_at > $2::timestamptz - interval '24 hours' and started_at <= $2
            order by started_at desc limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.agent_runs r
               where r.org_id = $1 and r.status = 'failed' and r.started_at between $2::timestamptz - interval '24 hours' and $2::timestamptz
                 and r.started_at <> $2::timestamptz - interval '24 hours'`,
    recheck: `select count(*)::int as n from public.agent_runs r where r.id = any($3::uuid[]) and r.org_id = $1 and r.status = 'failed' and $2::timestamptz is not null`,
  },
  "count.delivery_overdue": {
    list: `select id::text, count(*) over () ::int as n from public.delivery_tasks
            where org_id = $1 and status = 'open' and due_at < $2 order by due_at limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.delivery_tasks d where d.org_id = $1 and d.due_at < $2 and d.status = 'open'`,
    recheck: `select count(*)::int as n from public.delivery_tasks d where d.id = any($3::uuid[]) and d.org_id = $1 and d.status = 'open' and d.due_at < $2`,
  },
  "count.maintainer_open": {
    list: `select id::text, count(*) over () ::int as n from public.maintainer_items
            where org_id = $1 and status = 'open' and raised_at <= $2 order by raised_at desc limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.maintainer_items m where m.org_id = $1 and m.raised_at <= $2 and m.status = 'open'`,
    recheck: `select count(*)::int as n from public.maintainer_items m where m.id = any($3::uuid[]) and m.org_id = $1 and m.status = 'open' and $2::timestamptz is not null`,
  },
  // platform checks: $1 is still passed, and ignored
  "count.leads_to_decide": {
    list: `select id::text, count(*) over () ::int as n from public.opportunities
            where status = 'screened' and created_at <= $2 and $1::uuid is not null order by created_at limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.opportunities o where o.created_at <= $2 and o.status = 'screened' and $1::uuid is not null`,
    recheck: `select count(*)::int as n from public.opportunities o where o.id = any($3::uuid[]) and o.status = 'screened' and $1::uuid is not null and $2::timestamptz is not null`,
  },
  "count.enquiries_recent": {
    list: `select id::text, count(*) over () ::int as n from public.enquiries
            where created_at > $2::timestamptz - interval '7 days' and created_at <= $2 and $1::uuid is not null order by created_at desc limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.enquiries e
               where e.created_at between $2::timestamptz - interval '7 days' and $2::timestamptz
                 and e.created_at <> $2::timestamptz - interval '7 days' and $1::uuid is not null`,
    recheck: `select count(*)::int as n from public.enquiries e where e.id = any($3::uuid[]) and e.created_at <= $2 and $1::uuid is not null`,
  },
  "count.emails_failed": {
    list: `select id::text, count(*) over () ::int as n from public.outbox_emails
            where sent_at is null and attempts >= 5 and created_at <= $2 and $1::uuid is not null order by created_at desc limit ${LIMIT}`,
    recount: `select count(*)::int as n from public.outbox_emails x where x.attempts >= 5 and x.sent_at is null and x.created_at <= $2 and $1::uuid is not null`,
    recheck: `select count(*)::int as n from public.outbox_emails x where x.id = any($3::uuid[]) and x.sent_at is null and x.attempts >= 5 and $1::uuid is not null and $2::timestamptz is not null`,
  },
};

const CAPITAL_TABLE = "capital.ingestion_runs";

export const EXECUTORS = [...Object.keys(COUNT_CHECKS), "check.capital_ingestion"] as const;

/** Run a task's executor: what it found, with the records it found. */
export async function runCheck(db: Db, executor: string, input: CheckInput): Promise<CheckResult> {
  const count = COUNT_CHECKS[executor];
  if (count) {
    const { rows } = await db.query(count.list, [input.orgId, input.asOf]);
    return { available: true, count: rows[0]?.n ?? 0, ids: rows.map((r) => r.id as string) };
  }
  if (executor === "check.capital_ingestion") {
    const exists = (await db.query("select to_regclass($1) is not null as ok", [CAPITAL_TABLE])).rows[0].ok as boolean;
    if (!exists) return { available: false, reason: "Tidy Capital's data isn't in this database." };
    const { rows } = await db.query(
      `select id::text, status, coalesce(error, '') as error, started_at from capital.ingestion_runs
        where started_at <= $1 order by started_at desc, id desc limit 1`, [input.asOf]);
    if (!rows[0]) return { available: false, reason: "Tidy Capital has no ingestion runs yet." };
    const ok = rows[0].status === "ok";
    const when = new Date(rows[0].started_at as string).toISOString().slice(0, 16).replace("T", " ");
    return {
      available: true, count: ok ? 0 : 1, ids: [rows[0].id as string],
      detail: ok ? undefined : `Run of ${when} UTC: ${rows[0].status}${rows[0].error ? ` (${String(rows[0].error).slice(0, 160)})` : ""}.`,
    };
  }
  throw new Error(`no executor called ${executor}`);
}

/** Check a result independently: a recount, and every listed record re-tested. */
export async function verifyCheck(db: Db, executor: string, input: CheckInput, result: CheckResult): Promise<Verification> {
  const count = COUNT_CHECKS[executor];
  if (count) {
    if (!result.available) return { ok: false, recount: null, detail: "A count check can't be unavailable." };
    const recount = (await db.query(count.recount, [input.orgId, input.asOf])).rows[0].n as number;
    const still = (await db.query(count.recheck, [input.orgId, input.asOf, result.ids])).rows[0].n as number;
    const listedAll = result.count <= LIMIT ? result.ids.length === result.count : result.ids.length === LIMIT;
    const ok = recount === result.count && still === result.ids.length && listedAll && new Set(result.ids).size === result.ids.length;
    const detail = ok
      ? `Recounted ${recount}; all ${result.ids.length} listed records still match.`
      : `Result said ${result.count}, recount found ${recount}; ${still} of ${result.ids.length} listed records still match.`;
    return { ok, recount, detail };
  }
  if (executor === "check.capital_ingestion") {
    const exists = (await db.query("select to_regclass($1) is not null as ok", [CAPITAL_TABLE])).rows[0].ok as boolean;
    if (!result.available) {
      const empty = exists ? !(await db.query("select 1 from capital.ingestion_runs where started_at <= $1 limit 1", [input.asOf])).rows[0] : true;
      return empty
        ? { ok: true, recount: null, detail: "Confirmed: there is nothing to check." }
        : { ok: false, recount: null, detail: "The executor said it couldn't check, but runs exist." };
    }
    if (!exists) return { ok: false, recount: null, detail: "The executor reported a run, but Tidy Capital's data isn't here." };
    const latest = (await db.query(
      `select r.id::text as id, (r.status = 'ok') as ok from capital.ingestion_runs r where r.started_at <= $1 order by r.started_at desc, r.id desc limit 1`,
      [input.asOf])).rows[0];
    const recount = latest ? (latest.ok ? 0 : 1) : null;
    const ok = !!latest && latest.id === result.ids[0] && recount === result.count;
    return { ok, recount, detail: ok ? "Re-read the latest run: it matches." : "The latest run doesn't match what the executor reported." };
  }
  return { ok: false, recount: null, detail: `no verifier for ${executor}` };
}
