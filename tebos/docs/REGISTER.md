# Implementation register

The living status of the REEDS × TEBOS build. A piece moves to **Done** only with evidence: tests that pass,
live proof, and where it's reachable. The audit behind the first version is
[`audit/2026-10-14-platform-audit.md`](audit/2026-10-14-platform-audit.md). Update this file in the same PR as the work.

Status: **Done** · **Partial** (works, but something named is missing) · **Blocked** (waiting on the named
dependency) · **Not started**.

## Layer A: founder interface

| Piece | Status | Evidence or blocker |
|---|---|---|
| Web app (public site, client app, staff workspace) | Done | 75 e2e tests pass; live on Vercel |
| Usable at phone width | Partial | Layouts are responsive; only the showcase has a phone-width test |
| Installable (manifest and icons) | Not started | No manifest in `web/index.html` |
| Offline and service worker | Not started | |
| Push notifications | Not started | Needs VAPID keys (free) |
| Founder inbox: requests, reports, approvals, alerts | Not started | Phase 2 |

## Layer B: REEDS (request ledger and orchestration)

| Piece | Status | Evidence or blocker |
|---|---|---|
| Request ledger (request → plan → tasks → evidence → verified report) | Not started | Phase 2, first item |
| Planner: deterministic request types | Not started | Request type 1: "What needs my attention today?" |
| Planner: free-text requests through a model | Blocked | AI key not workspace-scoped (decision 2b) |
| Independent verifier (recomputation) | Not started | |
| Limits: tasks per request, attempts, no recursive delegation, cost ceiling | Not started | |
| Conversational assistant on the phone | Partial | Today this is a Claude Code session opened from the Claude Android app, recorded only in the session, not in TEBOS |

## Layer C: TEBOS control plane

| Piece | Status | Evidence or blocker |
|---|---|---|
| Organisations, roles, row-level security, audit log | Done | SQL tests; 2,462 live audit events |
| Actions, dependencies, approvals bound to input, runs, outcomes | Partial | Tested; never used live (0 actions). Actions require a finding, so founder requests need the ledger |
| Agent runs and tool calls | Done | 282 runs recorded |
| Capability registry with risk tiers | Done | 11 capabilities |
| Reasoning provider interface (pause, retry, fault reporting) | Partial | One provider (Anthropic); key rejected |
| Database guard against data loss | Done | Live and probed |
| One organisation per company and client | Not started | TEBOS, BAME and rocomamas.com share "Tidy Enterprise"; the move needs an approved migration |

## Layer D: executors and integrations

| Piece | Status | Evidence or blocker |
|---|---|---|
| BAME operations snapshot (read-only) | Done | Read hourly |
| TEBOS company snapshot | Done | Measured objectives |
| Email (Resend) | Blocked | Key and sending domain (decision 2) |
| Payments (Paystack) | Blocked | Secret key and webhook (decision 1) |
| Voice intake calls | Blocked | Number and agent (decision 2c) |
| Second model provider | Not started | Only when a task shows it helps |
| n8n or similar automation | Not started | No need yet; the worker schedules jobs |

## Tidy Capital

| Piece | Status | Evidence or blocker |
|---|---|---|
| Data model (18 tables: providers, instruments, bars, series, theses, strategies, backtests, risk, trades, journal) | Partial | Live in `tebos-core` (`capital` schema), created outside the repository; no tenant column |
| Daily ingestion (`capital-ingest` function and nightly job) | Blocked | No Alpha Vantage key in Vault: every run since 3 Oct blocked; code not in the repository |
| Honest provider statuses | Done | 14 Oct: Alpha Vantage and Vanguard moved from `connected` to `placeholder`, with the reason in `notes` |
| Evidence and provenance | Partial | `capital.evidence` table exists; unused |
| Charting workspace | Not started | |
| Thesis and backtesting engine | Not started | Tables exist; no engine |
| Trader and academy edition (workspaces, roles, licensing) | Not started | Needs its own Supabase project first |
| Live trading | Not started | Not before research, validation and paper trading pass their gates |

## Tidy Enterprise (property)

| Piece | Status | Evidence or blocker |
|---|---|---|
| Property intelligence, revenue and deal analysis, gated workflow | Not started | No code or data found anywhere |

## Housekeeping

| Piece | Status | Evidence or blocker |
|---|---|---|
| Duplicate Vercel projects (4 build the same repository) | Not started | Retiring them is the founder's call |
| Stale repositories (`tebos-worker-staging-*`) | Not started | Archiving them is the founder's call |
| Repository private, CI database secret, leaked-password protection | Blocked | Decision 8 |
