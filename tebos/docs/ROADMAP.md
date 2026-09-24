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
| 4. Capabilities | Verified connectors (email, CRM, calendar, WhatsApp); approved execution with verification | Actions verified as done by the provider, not just by TEBOS | Not started |
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

Remaining for the stage-3 gate:
1. Deploy the interface and run a real business review end to end.
2. Invite teammates. This needs a server-side invite flow, because admins can't create other users'
   accounts from the browser.
3. Show people's names instead of ids in history. This needs a `profiles` table readable within the
   organisation.
4. Record outcomes (metric, baseline, observed value, verification) from the action page.
5. Export reports (dossier §26).

