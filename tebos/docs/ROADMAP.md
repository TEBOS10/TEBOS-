# TEBOS roadmap to autonomy

TEBOS becomes autonomous by proving reliability stage by stage. Nobody switches autonomy on in one
go. Each stage has a **gate**: evidence that it works on real businesses. The next stage starts only
when the gate is met. The dossier's principle applies throughout (§59): do not skip to autonomy
because it sounds more impressive.

Where TEBOS aims to be better than a general AI model or an agent tool is in what a model alone lacks:

- persistent memory of each business;
- conclusions that trace back to evidence;
- permissions and approvals;
- verified execution through connected systems;
- measured outcomes.

Models such as Claude are the reasoning engines behind the control plane (§49). The TEBOS product is
the control plane itself.

| Stage | Delivers | Gate (proof) | Status |
|---|---|---|---|
| 0. Foundations | Schema with enforced rules, tenancy, audit, domain core | Rule tests pass on Postgres and on `tebos-core` | Done |
| 1. Live evidence | Worker deployed on Railway; real scans of real businesses | 5+ real businesses scanned; every page ends in an honest state | Built; awaiting deployment |
| 2. Intelligence | Claude-proposed findings, validated and linked to evidence | `npm run eval:findings` healthy; findings on real scans reviewed by a person | Built; awaiting API key |
| 3. Interface + actions | Sign-in; Home, Businesses, Scans, Findings, Actions, Approvals; action proposals from findings | A real business review run end to end in TEBOS | First slice built (`web/`); awaiting deployment |
| 4. Capabilities | Verified connectors (email, CRM, calendar, WhatsApp); approved execution with verification | Actions verified as done by the provider, not just by TEBOS | First connector (Resend email) built; gate blocked on stages 1–3 |
| 5. Operating systems | Playbooks, workflow engine, operating-system specifications for new and existing businesses, scheduled rescans, change detection | One client (e.g. BAME) running on a TEBOS-generated operating system | Not started |
| 6. Autonomy | Agents run the loop within permission boundaries | Autonomy granted per action type after measured success; tier-3 actions always need a person | Not started |

## Autonomy policy (stage 6)

- Autonomy is granted **per action type and per organisation**, never globally.
- An action type qualifies only after it has a verified success rate above an agreed threshold, over
  enough real executions.
- Tier 0–1 actions (reading, internal drafting) can be automatic first.
- Tier 2 actions (external but reversible) become automatic only under an explicit policy the
  organisation has approved.
- Tier 3 actions (money, legal commitments, credentials, irreversible deletion) always need a human
  approver. The database already enforces this (`guard_approval`).
- Every autonomous step stays auditable and reversible where possible. A drop in the success rate
  withdraws the autonomy automatically.

## Stage 3 — what the first slice covers and what remains

Built:
- sign-in and organisation creation;
- the command centre;
- the business workspace;
- scan and finding views with evidence traceability;
- action proposal from findings;
- the full manual action lifecycle (approve, queue, run, record, verify, block, cancel);
- approvals, system state and audit history.

Approval decisions move their action automatically (migration `approval_drives_action`).

Added in the second slice (migration `team`):
- teammates: `profiles` (names visible only to colleagues) and invitations. An invitation stores a
  token fingerprint, never the token. It is accepted only by the invited, confirmed email, expires,
  is single-use and revocable. An organisation can't lose its last admin;
- names instead of ids in action history, approvals, business context and the audit trail;
- outcomes recorded from the action page. A verified outcome can verify a completed action;
- a business report (dossier §26) with labelled statement types, gaps, print or PDF, and CSV export
  that is safe against formula injection.

Remaining for the stage-3 gate:
1. Deploy the interface (Vercel) and the workers (Railway), and run a real business review end to end.
   This needs the owner: the Supabase Auth Site URL, the Railway service and its secrets.
2. Email delivery of invitations. For now the admin copies the link and sends it themselves.


## Stage 4: first slice

Started, at the owner's request, before the stage 1–3 gates were met. The code is built and tested, but it
does nothing until an organisation connects a provider, and the stage 4 gate is not claimed until stages
1–3 have met theirs.

Built (migration `provider_execution`, `src/execution/`, and the Connections page):
- the Resend connector: `email.send_transactional`, with key verification and scopes that follow what the
  key proved;
- credentials held in Supabase Vault. Connection health, scopes and credentials can only be written by the
  server;
- email actions whose exact recipients and text are approved. The input is frozen once approval is
  requested, and the approval is pinned to its hash;
- the execution worker: one send per approval (idempotency key), safe retries on unknown outcomes, and
  blocking with a reason when no provider can run the action;
- provider verification: an action is `verified` only on delivery reported by Resend, by polling or by a
  signed, replay-safe webhook. Bounces fail it.

Remaining for the stage-4 gate:
1. Stages 1–3 meet their gates (deployment, real scans, a real business review).
2. Connect a real Resend account with a verified sending domain. Send real approved emails and see them
   verified by Resend.
3. More connectors: CRM (HubSpot), calendar and WhatsApp, each with provider-side verification.

## Internal evidence: diagnostic interviews

Scans read the outside of a business. Interviews add what only its people know (migration
`diagnostic_interviews`, `src/interviews/`, industry playbooks in `src/domain/playbooks/`):
- a marketing-agency playbook (v1);
- calls placed by an ElevenLabs voice agent at a booked time, with recorded consent and an upfront AI
  disclosure, or the same questions answered in writing;
- answers stored as the owner's statements, each quoted word for word from the transcript.

Next:
1. Connect a phone number: Twilio or SIP into ElevenLabs, then `ELEVENLABS_PHONE_NUMBER_ID` and
   `ELEVENLABS_API_KEY` on the worker.
2. Feed interview evidence into findings, alongside scans.
3. Document uploads.
4. Read-only connectors (accounting, CRM, project tools) to confirm answers against real data.

## Platform monitoring

- **BAME:** a read-only operations snapshot (aggregates only, no personal data) is read hourly into
  evidence. You can see it on the BAME business page under "Live operations".
- **Tidy Capital and Tidy Property Revenue Architect:** not connected. Their code and data weren't found in
  the connected GitHub, Supabase or Railway accounts.
- **Next:** feed these facts into findings. Then add approved actions on BAME (assign a lead, chase an
  overdue deliverable) as their own capabilities.
