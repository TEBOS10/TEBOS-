# BAME — website + client diagnostic intake

A single Next.js app combining the BAME marketing site (rebuilt from the
original Manus-hosted site) with the expanded client diagnostic intake,
backed by Supabase.

## Architecture

- **Next.js (App Router)** — marketing site (`/`), diagnostic intake wizard
  (`/intake`), and a minimal admin dashboard (`/admin`).
- **Supabase** (project `bame-os`) — `leads` (quick enquiry form) and
  `diagnostics` (full intake) tables. Public inserts are allowed via RLS
  (insert-only, no read/update/delete for anonymous callers). All reads and
  updates go through a Supabase Edge Function (`admin-data`) gated by a
  shared-secret header, so the service-role key never leaves Supabase.
- **Optional Apps Script forwarding** — if `APPS_SCRIPT_URL` is set, every
  diagnostic submission is also forwarded to the original `Code.gs` Google
  Apps Script web app (see the standalone `SETUP.md`/`Code.gs` you already
  have), which renders a PDF and emails it to BAME administration. This is
  best-effort and additive — Supabase storage always succeeds independently.

## Environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Publishable/anon key, used server-side for inserts only |
| `SUPABASE_ADMIN_TOKEN` | Shared secret the admin dashboard sends to the `admin-data` Edge Function |
| `ADMIN_PASSWORD` | Password for `/admin` |
| `ADMIN_SESSION_SECRET` | Random string used as the admin session cookie value |
| `APPS_SCRIPT_URL` | Optional — Google Apps Script web app URL for PDF/email delivery |

## Local development

```bash
npm install
npm run dev
```

## Extending the intake

All diagnostic questions live in `src/lib/intake-schema.ts` as a single
source of truth (sections → fields, with `showIf` predicates for the
athlete/event branch). Add a field there and it appears in the wizard, the
stored `diagnostics.payload`, and any Apps Script forwarding automatically.

## Admin

`/admin` is a minimal password-gated dashboard listing leads and diagnostics,
with per-row status and department assignment — the starting point for the
department-routing "operating system" described as phase 2 of this project.
