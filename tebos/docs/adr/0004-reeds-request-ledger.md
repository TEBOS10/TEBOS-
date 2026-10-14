# ADR 0004: REEDS is a request ledger inside TEBOS

Status: accepted, 14 Oct 2026. Context: the master build directive and the
[platform audit](../audit/2026-10-14-platform-audit.md).

## Decision

REEDS, the founder's assistant, is built as a **request ledger in TEBOS's database plus a worker loop**, not as a
separate application. A request moves `received → planned → running → verifying → completed`, or ends `failed`
or `cancelled`. Each of its tasks moves `queued → running → done → verified` (or `rejected` or `failed`).

## Why

- TEBOS already has what an orchestrator must not get wrong: organisations, row-level security, an audit log, state
  machines, approvals bound to their exact input, and agent-run records. A separate REEDS app would have to
  rebuild all of it, or bypass it.
- The directive's first milestone is reliability: one request taken to a verified report. That is a property of the
  data model, so it is enforced there.

## Rules the database enforces

| Rule | How |
|---|---|
| Only a person asks | A request is created only by a signed-in admin or operator of its organisation. The server, an agent or a task cannot create one, so work can't spawn work |
| Bounded | At most `max_tasks` tasks (default 12, at most 25), added only while planning; at most `max_attempts` tries per task (default 3, at most 5), counted by the database |
| No false completion | A task is `verified` only with a result and a verification recording `ok: true`. A request is `completed` only with at least one task, every task verified, and a report (`TEBOS_WORK_UNVERIFIED`) |
| Fixed definitions | What was asked, by whom, and each task's acceptance test cannot change after planning |
| Isolation | Members read only their own organisation's requests and tasks. Executors filter by the request's organisation. Platform-wide checks are planned only for platform admins |
| Audited | Every change to a request or task is in `audit_events`, attributed to the person or the REEDS worker |

## How verification works

Each executor has a separately written verifier. For counts, the executor returns the figure and the records it
found. The verifier recounts with its own query and re-tests every listed record against its own definition of the
rule. Both read at the request's fixed moment (`as_of`, set at planning), so "the last 24 hours" means the same
thing to both. A mismatch rejects the task, and the request fails with the reason. An executor that cannot check
something says so ("couldn't check"), and its verifier confirms that there really is nothing to check. It is never
reported as zero.

## What comes next (not in this decision)

- Free-text requests planned by a model into the same task types, once the AI key works. The model and provider
  are recorded on each run through the existing provider interface.
- Tasks of tier 2 and above wait for an approval through the existing `approvals` table, which is already bound to
  the exact input.
- Request types for business status (TEBOS, BAME, Tidy Capital), then Tidy Enterprise and Tidy Capital work.
