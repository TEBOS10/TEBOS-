# ADR 0002: Provider execution: who may say an action happened

Status: accepted (2026-09-25)

## Context

Stage 4 lets TEBOS act through outside systems, starting with transactional email via Resend. The dossier's
rule is "never claim an action happened without verification". Before this change, an admin's browser
session could mark a connection `connected` by writing a fresh `last_verified_at`. An operator's session
could also record a run as verified. For manual work that is correct: a person did the work and says so.
For provider work it is not: only the provider knows whether the email was delivered.

## Decision

1. **Two kinds of writer.** A *client* is a request made with a user's own session (the PostgREST roles
   `authenticated` / `anon`, `tebos_private.is_client()`). TEBOS's server (the worker's database role and
   TEBOS's own security-definer functions) is not a client. The following are server-only:
   - connection health (status other than configured or disabled, `last_verified_at`, scopes, failure
     detail);
   - credential references;
   - `api` runs, and any `provider_*` field or `provider:` verification method.
2. **Secrets go to Vault.** `set_connection_secret` (admins only) stores a secret with `vault.create_secret`
   and records only a pointer. Replacing a secret deletes the old one and revokes its reference.
   `tebos_private.read_credential` resolves a pointer; clients can't execute it.
3. **Approve exactly what runs.** `actions.execution_input` is frozen once the action leaves proposed,
   ready, blocked or failed. On insert, an approval records that input and its SHA-256 hash (`input_hash`),
   whatever the client sent. Moving to approved, queued or running with a valid approval whose hash doesn't
   match the current input is refused.
4. **Once per approval.** The run's idempotency key is `tebos:<action>:<approval>`. It is unique per
   organisation in the database, and it is sent to the provider, so crashes and retries can't send twice.
5. **Unknown is not failure.** Timeouts, 5xx and 429 leave the run `running`. It is retried with the same
   key, and after 23 hours it fails as "outcome unknown", never as success.
6. **The provider verifies.** An action becomes `verified` only when the provider reports delivery, by
   polling with a key that holds `emails:read` or by a Svix-signed webhook within a 5-minute tolerance. The
   webhook is replay-safe through `integration_events`.

## Consequences

- An admin can't fake a working connection, and an operator can't fake a delivered email. The SQL tests in
  `supabase/tests/30_execution.sql` try both, and have been mutation-checked.
- Manual actions keep working as before: a person records the run and verifies it with a stated method.
- Webhooks need the worker to have a public address. Without one, only full-access keys can confirm
  delivery, by polling.
