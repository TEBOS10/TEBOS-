# BAME — website + client diagnostic intake

A single Next.js app combining the BAME marketing site (rebuilt from the
original Manus-hosted site) with the expanded client diagnostic intake,
backed by Supabase.

## Architecture

- **Next.js (App Router)** — marketing site (`/`), diagnostic intake wizard
  (`/intake`), a minimal password-gated admin dashboard (`/admin`), and the
  staff operating system (`/staff`).
- **Supabase** (project `bame-os`) — `leads` (quick enquiry form) and
  `diagnostics` (full intake) tables. Public inserts are allowed via RLS
  (insert-only, no read/update/delete for anonymous callers). All reads and
  updates from `/admin` go through a Supabase Edge Function (`admin-data`)
  gated by a shared-secret header, so the service-role key never leaves
  Supabase. `/staff` instead uses the signed-in staff member's own Supabase
  Auth session, and reads/writes `leads`/`diagnostics` directly under RLS
  policies scoped by department.
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
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL`, exposed to the browser for `/staff` auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY`, exposed to the browser for `/staff` auth |

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
with per-row status and department assignment.

## Staff operating system

`/staff` is the internal system BAME's team signs into individually — no
shared password, one Supabase Auth account per person.

- **Accounts** — an admin invites someone from `/staff/team` (email, name,
  department, optional admin flag). That creates a one-time token in
  `staff_invites`; the invite link (`/staff/join?token=...`) lets them set a
  password, which calls the `staff-admin` Edge Function to create their real
  Supabase Auth user and a matching `profiles` row.
- **Routing** — every lead/diagnostic has an `assigned_department` column.
  Admins see everything still unassigned on their dashboard and route it to
  a department; a DB trigger (`notify_on_department_assignment`) then drops
  a row into `notifications` for that department.
- **Access control** — `/staff/**` is protected by `src/proxy.ts` (session
  refresh + redirect to `/staff/login`). Once signed in, all reads/writes go
  through the user's own session (`supabase-server.ts` / `supabase-browser.ts`),
  so RLS — not application code — enforces that non-admins only see their
  own department's cases and notifications.
- **Departments** — `sales`, `production`, `pr`, `finance`, `tech`, `admin`
  (`src/lib/staff.ts`).
