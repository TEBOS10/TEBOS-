# Tidy Property Operations: security and compliance

**This is not legal advice.** It separates (A) the technical controls the product has, which the tests prove, from
(B) research notes on South African law that a lawyer must confirm before any customer uses the product. Where the
law places a duty on the landlord or agent, the product can help them keep records; it does not discharge the duty.

## A. Technical controls (built and tested)

| Control | How | Proved by |
|---|---|---|
| Tenant isolation | Row-level security on every `ops_*` table; members read their own organisation's rows only | `99zzm` (an outsider sees nothing) |
| Least privilege | Writes need `org_admin` or `operator` **and** a live subscription (`ops_writable`); viewers and approvers only read; approvers only approve or decline maintenance | `99zzm`, `ops.spec.ts` |
| Separation of duties | A property manager (operator) can record a quote but can't approve it | `99zzm`, `ops.spec.ts` |
| Server-side validation | Every rule is a check constraint or trigger in Postgres; the interface only pre-checks | `99zzm` (direct writes refused) |
| No privileged key in the browser | The app uses the user's own session and the publishable key; the build is scanned for service keys and vendor names | `scripts/check-bundles.mjs` |
| Append-only money record | No update or delete on `ops_ledger`; corrections are reversals with a reason | `99zzm` |
| Audit trail | Every insert and update is written to the hash-chained `audit_events`. For tenants, leases and suppliers only the **names of changed fields** are recorded, not their values, so personal details aren't copied into the audit log | `99zzm` (audit privacy) |
| Data minimisation | Tenants: name, email, phone, short notes. No fields for ID numbers, bank account numbers or dates of birth. `deposit_held_at` refuses runs of 6+ digits (no account numbers); tenant notes refuse email addresses, SA phone numbers and 13-digit numbers such as ID numbers | `99zzm` |
| Private files | Photos in the private `ops-files` bucket; a file may be uploaded only after its record exists, under `{org}/maintenance/{request}/`; reading uses short-lived signed links (5 minutes) | `99zzm`, `ops.spec.ts` |
| Plan limits and suspension | Unit limit enforced in the database; a suspended account is read-only; only platform staff change a subscription | `99zzm` |
| Two-step sign-in | Available from the account page (shared with TEBOS) | existing tests |
| Headers | Content-Security-Policy limits scripts to the app itself and connections to the Supabase project (`ops/public/_headers`) | build output |

Not yet built: data export for a tenant's access request (can be done by an admin from the database today), automatic
retention and deletion schedules, breach-notification runbook specific to this product (TEBOS's resilience docs apply).

## B. Research notes on the law (for legal review)

### 1. Protection of Personal Information Act 4 of 2013 (POPIA)

The landlord or managing agent using the product is the **responsible party** for tenants' personal information.
Tidy, hosting the records for them, acts as an **operator** (s21 requires a written contract between them that
obliges the operator to keep the information secure).

The eight conditions for lawful processing (Chapter 3), and what the product does for each:

| Condition | Product support | Still the customer's (or Tidy's) job |
|---|---|---|
| 1. Accountability (s8) | Audit trail of who changed what | appoint an information officer (s55); keep policies |
| 2. Processing limitation (s9–12) | Only fields needed to run a tenancy | lawful basis (the lease contract); collect directly from the tenant |
| 3. Purpose specification (s13–14) | — | tell tenants the purpose; keep records only as long as needed |
| 4. Further processing limitation (s15) | No marketing features; no sharing | don't reuse tenant data for unrelated purposes |
| 5. Information quality (s16) | Edits audited | keep details accurate |
| 6. Openness (s17–18) | — | a privacy notice to tenants (draft needed; legal review) |
| 7. Security safeguards (s19–22) | Section A above | s22: notify the Information Regulator and the tenant of a compromise; Tidy must tell the customer promptly (s21(2)) |
| 8. Data subject participation (s23–25) | Admin can export a tenant's records | answer access and correction requests |

Also relevant: s72 (sending information outside South Africa; the database region must be checked and disclosed),
and s69 (direct marketing by electronic communication needs consent: any future reminders must stay service messages).

### 2. Rental Housing Act 50 of 1999, section 5(3) (deposits)

From the Act's text (source S11 in COMPETITOR-ANALYSIS; the 1999 text, amendments must be checked by a lawyer):

- (d) the deposit must be invested in an **interest-bearing account**, and the tenant is paid the interest (not less
  than a savings-account rate); the tenant may ask for written proof of interest.
- (e), (f) joint inspections before moving in and within three days before the lease ends.
- (g) after the lease ends, the landlord may apply the deposit to amounts owed and repairs; the balance and interest
  are refunded **within 14 days of the dwelling being restored** to the landlord.
- (i) if nothing is owed, the full deposit and interest are refunded **within seven days** of the lease ending.
- (j) not inspecting with the tenant is deemed acknowledgement that the dwelling is in good repair.

Product position: the deposit has its own account in the ledger and is never income; "Deposit held at" records where
it is held (never an account number). Inspections, interest entries and refund-due dates are Release 2.

### 3. Property Practitioners Act 22 of 2019

A person who manages property for others and receives money for them is a property practitioner who must hold a
Fidelity Fund certificate and keep a trust account (source S10). **The product never holds, collects or moves
money.** It records payments that arrived in the landlord's or agent's own bank account. This boundary is stated in the
app footer and must be kept in all marketing. Whether a customer needs a certificate is their own question.

### 4. What this means for the product boundary

- No payment collection, trust accounting, or money movement, without the founder's decision and legal advice.
- No automated decisions about tenants (no screening scores, no AI on money).
- Messages to tenants are drafted for a person to send (Release 3), not sent by the system.

## C. Before the first pilot (founder decisions)

1. Operator agreement between Tidy and the pilot customer (POPIA s21): needs a lawyer's review.
2. A privacy notice the customer can give tenants: draft, then legal review.
3. Confirm the live database region and disclose it.
4. Apply the migration (the founder's "merge it"). Nothing is live until then.
