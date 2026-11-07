# Enterprise risk and compliance register

**Assessment date:** 7 Nov 2026.

This is **not legal advice**. Each row names the law or body to check, what activity could bring it into play, and
its state. "To confirm" means the applicability hasn't been verified against the current text by a qualified person.
Recommendations that depend on it wait for that review. Sources are the official publications (gov.za, the
regulators' sites, LawLibrary/SAFLII for the Acts' text). The exact sections are to be confirmed by the attorney
(decision 3).

| ID | Area | Activity that could trigger it | Source to check | State | Control in TEBOS | Owner |
|---|---|---|---|---|---|---|
| R-01 | POPIA (Act 4 of 2013) | Every record about a person; referrals; call recordings; direct marketing | Information Regulator; the Act | Applies | References not people in the agent's office; consent before referral; personal-data-shaped text refused; redacted audit; consent on public forms | F + attorney (processing record, G-19) |
| R-02 | Property Practitioners Act 22 of 2019, PPRA | Introducing or referring parties to a property transaction for remuneration; receiving a referral fee; acting outside Pelser | theppra.org.za; Act text (LawLibrary, 2019-10-03 version read 7 Nov) | **To confirm.** Its definition of property practitioner is broad. Receiving transaction-linked remuneration without a Fidelity Fund Certificate is a material risk | Referral fees recorded only as "agreed in writing, where", never as amounts; no fee assumed. Decisions 10b and 24 | F with principal and PPRA |
| R-03 | FAIS Act, FSCA | Advice on financial products (loans, bonds, investments) | fsca.co.za | To confirm per offer. PRA gives financeability readiness, not product advice | PRA wording says it is not a lender or FSP; regulated matters are routed to authorised persons | F + attorney |
| R-04 | Collective Investment Schemes Control Act | Pooling third-party money into property or projects | fsca.co.za | Not active: nothing built pools money | None to build; any vehicle needs review first | F |
| R-05 | FICA | Accountable-institution duties (estate agents are listed) | fic.gov.za | Applies to Pelser's transactions, through Pelser | Agency checklist tracks FICA documents per deal (never stores them) | Pelser |
| R-06 | Consumer Protection Act and ECT Act | Online agreements, cooling-off, electronic acceptance | gov.za | Applies to client agreements | Hash-bound acceptance, versioned terms; lawyer review pending (decision 3) | F + attorney |
| R-07 | Companies Act, CIPC, SARS, VAT | Trading as a company; invoices | cipc.co.za, sars.gov.za | Applies | Invoices need registration and VAT numbers (decision 7) | F |
| R-08 | Employment and contractor law | Maintainers, Grape Studios, specialists | Labour Relations Act, BCEA | Applies when engaged | Written scopes before work | F |
| R-09 | Copyright and IP | Client sites, content, templates | Copyright Act | Applies | Client-owned accounts (ADR 0012); content needs consent to publish (ADR 0020) | F |
| R-10 | Municipal planning and zoning (SPLUMA, by-laws) | Development feasibility | Municipality | Per project | Pathways route to a town planner; never concluded by TEBOS | Specialist |
| R-11 | Employer conflict (Pelser) | Using the agency's clients, data or brand for Tidy Enterprise | Employment terms; principal's written permission | **Open** | Agency permission required before any Tidy Enterprise introduction (ADR 0025) | F |
| R-12 | Commercial hosting terms | Paying clients on Vercel Hobby | Vercel terms | Open | Decision 31 | F |
| R-13 | Credential exposure | Secrets in code, logs or chat | — | Controlled | Parity test, secret-shaped text refused, keys only in host settings | R |
| R-14 | Unapplied migrations / CI login | Live database behind code | — | Open | Founder script; CI secret (G-01) | F |
| R-15 | Untested restore | Data loss | Supabase backups | Open | Restore rehearsal (G-13) | R + F |
| R-16 | AI overreach | An agent sending, paying or promising | — | Controlled | Capability tiers; approve-before-send; receptionist guardrails | R |

## Approval matrix

| Decision | Who |
|---|---|
| Code, tests, additive migrations, merging green PRs | REEDS routine |
| Anything sent outside | Founder (REEDS drafts) |
| Prices, contracts, legal text, fees, payments | Founder |
| Credentials, access, deletion, destructive migrations | Founder |
| Regulated advice (financial, legal, property practice) | Authorised professional |
