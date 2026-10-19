# The Model Bridge: connecting an AI client to REEDS

The bridge lets an AI client (a coding assistant first, a chat assistant later) take work from REEDS's ledger and hand
results back. It reuses TEBOS's own requests, tasks, agent-run records and audit trail; nothing is stored anywhere else.

- **Design:** `supabase/migrations/20261019090100_model_bridge.sql` (rules), `src/bridge/` (server), `src/domain/bridge.ts`.
- **Tests:**
  - `supabase/tests/99zm_model_bridge.sql`;
  - `test/integration/bridge-pg.test.ts` (a full MCP round trip over HTTP);
  - `test/bridge.test.ts`;
  - `web/e2e/bridge.spec.ts`.

## What an AI client can and can't do

| It can | It can't |
|---|---|
| Read its organisation's context: businesses, active objectives, open work, approvals waiting (counts only) | See any other organisation, or any private or TEPOS organisation (the database refuses to issue a token for one) |
| List the tasks a person wrote for its kind of client | Create requests (only a signed-in admin or operator can) |
| Claim a task (2-hour lease) and hand in a result: a summary, evidence and whether a person must decide something | Mark its own work verified. A person with the approver or admin role reviews it, in a two-step session. |
| | Approve, pay, send, deploy, change access, or read money, contact details or credentials |

**Logging:**
- Every call, refused ones included, is recorded in `agent_runs` / `tool_calls`.
- Every change is in the audit trail, attributed to `bridge:<client id>`.
- More than 60 calls a minute are refused.

## Tokens

- **Issuing:** an admin issues one in **TEBOS → REEDS → AI clients**, in a session that passed two-step sign-in. You choose:
  - the client's name;
  - its kind;
  - what it may do;
  - how many days it lasts (at most 90).
- **Shown once:** the token appears once, as `tbk_` followed by 64 characters. TEBOS keeps only its SHA-256, and the page
  shows only the first 12 characters afterwards.
- **Where it goes:** store it only in the AI client's secret settings as `TEBOS_BRIDGE_TOKEN`. Never in chat, a document
  or the code.
- **Revoking:** revoke it on the same page. It stops working on the next call.
- **If it leaks:** revoke it, issue a new one, and check the client's recent calls (`tool_calls` for its agent run).

## Deploying (needs the founder's approval for each step)

1. **Apply the two migrations** (`audit_verify`, then `model_bridge`) to `tebos-core` through the connector, under their
   names, after CI is green.
2. **Give the bridge its database login.** In the Supabase SQL editor, with a password from your password manager (never
   pasted into chat):
   `alter role tebos_bridge login password '<new password>';`
   The role exists already, with no table rights; it can only run the bridge's functions.
3. **Create the Railway service.** A new service `tebos-bridge`, from this repository's `tebos/` directory:
   - start command `npx tsx src/bridge/main.ts`;
   - variable `TEBOS_BRIDGE_DATABASE_URL`: the session-pooler string for `tebos_bridge` (and `TEBOS_DATABASE_CA` if the
     worker uses it);
   - a public domain.
   - **Never** give it the worker's `TEBOS_DATABASE_URL`. The service refuses to start with a `postgres` or
     `tebos_worker` login.
4. **Check it:**
   - `GET https://<domain>/health` answers `{"ok":true}`;
   - a `POST /mcp` without a token answers 401.

## Connecting the coding assistant

**In the project's `.mcp.json`** (the token stays in the environment, never in the file):

```json
{
  "mcpServers": {
    "tebos": {
      "type": "http",
      "url": "https://<bridge domain>/mcp",
      "headers": { "Authorization": "Bearer ${TEBOS_BRIDGE_TOKEN}" }
    }
  }
}
```

**The token:** set `TEBOS_BRIDGE_TOKEN` in the environment's secret settings.
- For a cloud session: the environment's secrets.
- On a computer: the shell profile or a secrets manager.

[To confirm on first use: the client expands `${VAR}` in `.mcp.json` headers.]

**First test, after connecting:**
1. In REEDS, ask for **Work for an AI client**. Write what should be done and its acceptance test.
2. Ask the assistant to `list_tasks`, `claim_task` it, do it, and `submit_result`.
3. Review it in REEDS. The request completes only when you accept it.

## The chat assistant (later)

Some chat products' connectors sign in with OAuth rather than a fixed token. That's a second phase, with an OAuth flow,
and depends on the plan. [Unverified.]
