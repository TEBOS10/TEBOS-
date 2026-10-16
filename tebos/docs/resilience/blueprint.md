# Strategic Resilience: blueprint, data model, MVP roadmap and threat model

Stage 1 and 2 of the founder's *Strategic Resilience & Environmental Intelligence Dossier* (v1.0, 16 Oct 2026).
**Built** means implemented and tested; **proposed** means designed only. Status, 16 Oct 2026: slice 1 (financial
resilience) is built (§7). Everything else is proposed.

## 1. One-page blueprint

**What it is.** An evidence and decision engine organised as vaults. It does three things:
- it keeps records with their provenance;
- it assesses risks proportionately, with alternative explanations;
- it keeps contingency plans and a decision history, so the founder decides well and recovers from disruption.

It is decision support. It never labels people, never acts on its own, and never claims to see what it is not connected to.

**What it is not.** It is not a surveillance product. It does no covert recording, does not access anyone else's devices or
accounts, does no tracking, makes no automated accusations and does no retaliation. A phone or AI cannot "understand a
room" without sensors, permissions and lawful access, and this system makes no such claim.

**Three layers, built in this order:**

| Layer | What | When |
|---|---|---|
| 1. Manual records (the MVP) | Vaults, evidence entered by hand with its class and source, risk records, decisions, contingency playbooks, the asset and dependency inventory, financial resilience, export and backup, permissions, audit | First, and useful on its own |
| 2. Authorised integrations | A source registry first. Then, one at a time and only with a stated reason: TEBOS's own system health (already measured), documents the founder uploads, calendars and accounts the founder owns, and posture checks of systems the founder administers | Each needs written scope and authorisation |
| 3. Hardware and specialist work | Disclosed premises sensors or cameras, access-control logs for premises the founder manages, professional security testing | Only with legal advice (POPIA, RICA) and visible sensor status |

**Where it lives.** TEBOS already provides what the dossier asks for:
- row-level security per organisation;
- a hash-chained audit trail;
- server-enforced guards, with the "unknown is not zero" discipline;
- the evidence-basis pattern from Property Revenue Architecture.

The resilience vaults go into a **separate private organisation**, readable by the founder only. Personal, business
and client data stay apart: business vaults sit in the business's organisation, and client data never enters a
personal vault. The private organisation moves to its own project when there is budget (founder decision 11). Under
the current free plan it shares the database, isolated by the same rules that keep clients apart.

**Real limits, stated up front:**
- The system knows only what is recorded or connected. "No alert" never means "safe".
- AI output, if added later, is a suggestion with its sources. It never sets a risk level, never escalates, and never
  contacts anyone.
- A record of a person's conduct is the founder's own record. It isn't verified because it is written down, and the
  evidence class says so.

## 2. Data model (proposed)

Every table carries `org_id` and follows TEBOS's rules: row-level security, frozen tenant keys and audited changes. The
sensitive tables use **redacted auditing**: the audit trail records who changed which fields and when, but never the
content. A deletion at the end of a retention period then really deletes it (see the threat model, T7).

| Table | Purpose | Key rules |
|---|---|---|
| `res_vaults` | One per domain: A relationships, B workplace, C counterparties, D finance, E assets, F digital, G safety, H environment, I decisions | Sensitivity class and default retention per vault. Vaults A, B and G are off unless switched on |
| `res_sources` | The source registry: owner, what permission or authorisation covers it (a reference to a document), scope, collection frequency, data types, status (active, paused, disconnected) and when it was last seen | Nothing is "monitored" unless an active source with a recent `last_seen_at` exists. Paused or disconnected shows as such |
| `res_evidence` | One item of evidence: vault, source (optional), title, summary, **evidence class** (direct observation, primary document, verified log, corroborated report, uncorroborated report, inference, unknown), collection method, date observed, date recorded, document reference, retention date | **Append-only.** Content never changes. A correction is a new version that supersedes the old one, and both remain. Recorded date is set by the database |
| `res_risks` | The standard risk record (dossier §5): situation; affected asset, process or relationship; known facts; interpretation; **alternative explanations (at least one, required)**; what would disprove it; likelihood, impact and confidence, each low / medium / high / unknown with a rationale; missing information; exposure; safeguards; proportionate action; escalation threshold; owner; review date; status (open, monitoring, mitigated, accepted, closed); **contingency level 0–4** | No numerical scores. Level 2+ needs at least two linked evidence items, or one primary document or verified log. Level 3+ needs a named playbook. Every level change carries a reason and is made by a person, never by the system |
| `res_risk_evidence` | Links a risk to its evidence | Same vault only |
| `res_playbooks` | Contingency playbooks: the six in dossier §8 as templates, plus case-specific ones. Each has a trigger, a level, ordered steps, an owner and a review date | Steps that contact anyone, change an account or move money are marked "human action" and are never automated |
| `res_decisions` | The decision log, built on the decision protocol (dossier §6): the decision required and by when, the objective, verified facts, assumptions and missing information, plausible explanations including benign ones, the downside if the concern is true and if it is false, reversible options, the safeguard, whether advice is needed, what would change it, the owner and review date. Then the decision and rationale, who approved it, the outcome and the lessons | Append-only once decided. An outcome and lessons are added later, never rewritten |
| `res_incidents` | A chronology entry: what happened, linked evidence, facts versus interpretation, severity, the playbook used, recovery steps and the outcome | Append-only with versions |
| `res_assets` | The asset inventory (dossier §E): kind, owner and proof (evidence link), system of record, valuation with its date, liabilities, access rights, renewal date, backup or substitute, recovery path and adviser | A critical asset with no proof of ownership or no recovery path is flagged |
| `res_dependencies` | Asset, process or person relationships, each with a single-point-of-failure flag and the substitute | Feeds the "single points of failure" metric |
| `res_accounts` | Digital inventory (dossier §F): service, role, whether two-factor sign-in is on, recovery method (described, **never stored**), last reviewed | The schema refuses columns for passwords and keys, and narrative fields are checked for secret-shaped strings |
| `res_money` | Financial resilience (dossier §D): essential monthly costs, income streams labelled **reliable** or **speculative**, liquid reserves, debts with their due dates, contingent liabilities and commitments, each with a basis (verified, stated, estimated) | Runway is liquid reserves ÷ essential costs, both base and downside. Speculative income, unsigned contracts, unapproved finance and expected proceeds **never count as cash**. Unknown is not zero |
| Retention | Every sensitive row has `retain_until`. A daily server job deletes expired rows and logs that a deletion happened, without the content | Deleting is reported on the dashboard, never silent |

**Metrics (dossier §10)** are computed from these tables: critical assets with verified ownership and a recovery path;
essential accounts with two-factor sign-in; single points of failure; cash runway under base and downside assumptions;
material risks with an owner and review date; unresolved high-impact risks; and retention compliance.

## 3. MVP roadmap (ranked by value against complexity and risk)

| # | Slice | Value | Complexity | Risk | Why here |
|---|---|---|---|---|---|
| 1 | **Financial resilience**: essential costs, reliable versus speculative income, reserves, debts, runway (base and downside) | Highest: the founder's stated priority | Low: reuses the labelled-figure engine | Low | Answers "how many months can I last" honestly, and feeds the money brief |
| 2 | **Asset, account and dependency inventory**: ownership proof, recovery paths, two-factor sign-in coverage, single points of failure | High: independence and continuity | Low | Low (no secrets stored) | Protects everything else: losing access is the most likely real disruption |
| 3 | **Decision log with the protocol** | High | Low | Low | Better decisions, kept on record |
| 4 | **Risk records, evidence and the playbooks** for vaults C (counterparties), E, F and I | High | Medium | Medium | The evidence engine itself, on business matters first |
| 5 | **Secure export and backup**: encrypted on the device with the founder's passphrase, and a restore test | High: independence from any vendor, TEBOS included | Medium | Low | Without it, the system becomes a dependency itself |
| 6 | **Vaults A, B and G** (relationships, workplace, safety) | Personal | Low technically | **High**: sensitive data about people | Only after the founder answers the questions in §5, and with the strictest retention |
| 7 | **Source registry, then one integration at a time** | Varies | Varies | Varies | Each needs its own reason, authorisation and visible status |

## 4. Threat model (the system itself)

| # | Threat | Effect | Safeguard |
|---|---|---|---|
| T1 | **Data leakage**: a bug, a misconfigured policy, or a shared device | Exposure of the most sensitive records | A private organisation with the founder as its only member. Row-level security tested per table. Nothing sensitive in logs, URLs or notifications (alerts say "a risk needs review", never its content). Export only, never public links. Its own project once affordable |
| T2 | **Account compromise**: the founder's sign-in, email or phone | Everything readable | Required two-factor sign-in (TOTP) for the private organisation, checked by the database. Leaked-password protection on. Short sessions. The sign-in history is visible. The "suspected account compromise" playbook is pre-written |
| T3 | **Manipulated or false evidence**: forged documents, out-of-context messages, mistaken memory | A wrong decision about a person or a deal | The evidence class is required and visible; an uncorroborated report stays one. Optional content hash on documents. Append-only evidence with versions. Alternative explanations are required. Level 2+ needs corroboration |
| T4 | **False positives**: an ambiguous event read as hostile | Damaged relationships, unjust action | There is no automatic suspicion and no AI escalation. The language is plain, not sensational. "What would disprove this" is a required field. The false-positive rate is tracked (risks closed as unfounded) |
| T5 | **Model errors**: if AI summarisation is added later | Invented facts | AI never writes a record directly. Its suggestions cite their sources and a person accepts them. It never sets levels. AI output is labelled as AI output in the record |
| T6 | **Vendor lock-in or loss of the service**: TEBOS, Supabase, Vercel | Loss of access to the records | The encrypted export is the backup, with a restore test each quarter. The schema is documented, so the data can be read without TEBOS |
| T7 | **Retention failures**: data kept longer than it should be, including in the audit trail | Privacy harm; the "deleted" isn't deleted | Redacted auditing on the sensitive tables. Retention dates are required. The deletion job is tested, and its runs are visible |
| T8 | **Loss of the founder's access**: lost phone, lost email | No access at all | Recovery codes held offline. A named recovery contact, if the founder chooses one: they can be given read access to vaults D and E only, after a waiting period. The "loss of a key system or person" playbook covers this |
| T9 | **Scope creep into surveillance** | Legal and ethical harm | The source registry is the only way data comes in, and each source records its authorisation. There is no capability for covert collection. Sensors show their status and can be paused |
| T10 | **Secrets in notes** | Credential exposure | No password or key columns. A pattern check refuses secret-shaped strings in narrative fields |

## 5. Questions that genuinely block the prototype (answered 16 Oct 2026)

**The founder's answers:** inside TEBOS, free; only the founder; the personal vaults (A, B, G) later.


1. **Where it lives for now.** Is a separate private organisation inside TEBOS's database acceptable for the MVP? This
   is the free option already chosen for the vault. The alternative is to wait for a separate project, which costs
   money. This decides whether building starts now.
2. **Who else, if anyone, may ever see it.** Is it only you, or should there be a recovery contact who can see the
   finance and asset vaults if you lose access (T8)?
3. **Whether vaults A, B and G (people and safety) are in the MVP or come later.** My recommendation is later: the
   business and finance vaults first.

Everything else can be decided along the way:
- retention defaults: 2 years for business vaults, 12 months for personal ones, editable;
- which playbooks to tailor first;
- which integration comes first.

## 6. Feature review template (dossier Stage 5)

Before it is built, each feature states:
- the user problem;
- the evidence trigger;
- the benefit and failure modes;
- the false-positive risk;
- the data collected and why;
- the permissions and legal requirements;
- the human approval needed;
- the cost;
- how to recover from it or switch it off.

The review sits in this folder, next to the feature's tests.

## 7. Built: slice 1, financial resilience (16 Oct 2026)

| Part | Where |
|---|---|
| Rules and calculations | `src/domain/resilience.ts` |
| Database | Migration `20261017040000_resilience_money.sql` |
| Interface | Menu → **Resilience** (`web/src/pages/ResiliencePage.tsx`) |

**Private organisations.** A private organisation is created by `create_private_organisation`, and it is private for
good.
- It has one member, its creator, as admin.
- The database refuses a second member, any other role and any invitation, by any path, the service role included.
- Resilience records can't be stored in any other organisation.
- The live one is called **IREKUN**.

**Money items.** Each item records:
- the entity it belongs to: Tidy, Tidy Capital, Tidy Enterprise, TEBOS, IREKUN or Personal;
- what it is: an essential cost, another cost, income, a reserve, a debt or a commitment;
- for income, its stream and whether it is reliable;
- how often it is paid;
- whether a reserve is liquid;
- its basis (verified, stated or estimated) and the document it rests on;
- a due date, an as-of date and a note.

The rules:
- **Unknown is not zero.** An amount can be left blank. Anything that needs it then says "Not established" and
  names the missing item.
- **Reliable income is verified** and names its document.
- **Speculative income never counts as cash.** Forex trading income and lump sums (commissions) are always
  speculative. When a lump sum arrives, it is recorded as a reserve.
- **No secrets.** Secret-shaped text is refused in every text field: private keys, provider keys and tokens, and
  notes such as "password:" or "PIN =".
- **Redacted auditing.** The audit trail records who changed which fields, and when, never the content.
- **Only the owner reads or writes** the records.

**The runway:**
- **Available** = liquid reserves − debts due within 90 days.
- **Base runway** = available ÷ (essential costs − reliable income), with each amount converted to a monthly figure.
- **Downside runway** = available ÷ essential costs, as if all income stopped.
- Each result is labelled by its weakest input.
- It is shown for everything together, or for one entity at a time.

**Also shown:**
- income by stream and by how often it pays, with speculative income and expected lump sums kept apart;
- flags: debts due or overdue, reserve balances more than 45 days old, one stream above half of reliable income, and
  commitments.

**Tests:**
- `test/resilience.test.ts`: the rules, the formulas, and parity with the migration;
- `supabase/tests/99zf_resilience_money.sql`: one member, the private flag frozen, records only in private
  organisations, every rule, secrets refused, the redacted trail, and other people seeing nothing;
- `web/e2e/resilience.spec.ts`.

**Two-step sign-in (T2), built 16 Oct 2026.** Migration `20261017100000_two_step_resilience.sql` and
`web/src/components/TwoStep.tsx`.
- **The database enforces it.** Resilience records are read and written only in a session that passed the second
  step, a code from an authenticator app (TOTP, assurance level aal2). A password alone opens nothing; the
  organisation itself still shows, so the app can say what is needed.
- **Account page:** turn it on by scanning the QR code or typing the key, then confirm with a code. Add a backup
  authenticator on a second device, or remove one. An earlier attempt that was never confirmed is cleared first.
- **After a password sign-in**, an account with an authenticator is asked for the code before anything else loads.
- **Recovery:** the backup authenticator. If every authenticator is lost, the owner of the Supabase project removes
  the factor (Authentication → Users), then the founder signs in with the password and sets it up again.
- **Tests:** `supabase/tests/99zg_two_step.sql` and `web/e2e/two-step.spec.ts`.
- Supabase holds the factor's secret; TEBOS never stores it.

**Not built yet:**
- The retention job (T7).
- The encrypted export (slice 5).
- Slices 2–4.
