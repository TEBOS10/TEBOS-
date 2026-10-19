# ADR 0007: What stays valuable, how the company adapts, and how it grows without burning capital

Date: 2026-10-19 · Status: accepted (founder, 19 Oct 2026). Part of the operating strategy for Tidy Enterprise, TEBOS,
TEPOS and REEDS, not a separate research project.

Builds on ADR 0005 (the systems portfolio) and ADR 0006 (earn first).

## The aim

The aim is not to predict the next 50 years. It is a company that:
- detects change early;
- tests what the change means;
- moves money and time quickly;
- stays useful when the technology underneath it changes.

Being technologically advanced isn't the same as being commercially defensible. We need both, and profit is a
constraint, not an afterthought.

## 1. What stays valuable as technology changes

**Two kinds of infrastructure.** We build the second, not the first.

| | Owning compute infrastructure | Building operating infrastructure |
|---|---|---|
| What | Models, chips, data centres, foundation platforms | The layer a business needs to use capable technology reliably |
| Capital | Billions | Small. It grows with customers |
| What makes it durable | Scale | Records, trust and relationships that build up over time |

**What we keep, because it outlives any model or tool:**
1. **Each client's system of record:**
   - its operating data, evidence, decisions and outcomes, recorded over time;
   - for example, a property's frozen baseline and its monthly results.

   The longer a client runs on it, the more valuable it is, and the harder it is to replace.
2. **The trust layer:**
   - permissions;
   - approvals;
   - guarded state changes;
   - the audit chain anyone can verify;
   - the rule that unknown is never zero.

   As AI gets more capable, businesses need *more* control over what it may do, not less.
3. **Measured outcomes and the playbooks that produced them.** The blueprints are valuable only once real cases prove
   them (ADR 0005 stage 3).
4. **Customer relationships in a niche we understand:** South African property owners and agents first, then the
   industries in the catalogue.
5. **Owned distribution:**
   - the founder's network;
   - the content and the site;
   - referrals from measured results.

**What we keep replaceable on purpose:**
- **The models.** The provider port and the model gateway (19 Oct) already let TEBOS change providers without changing
  the business.
- **The interface frameworks, the hosts, and every outside tool.**
- **The rule:** nothing in the database, the rules or a client's records may depend on one AI company.

## 2. How the company adapts continuously

REEDS keeps a **signal register**. For each signal it records:
- where it comes from;
- how often it is read;
- the threshold that matters;
- the response;
- who decides.

The loop for each signal:
1. **Detect.**
2. **Test:** a small, time-boxed experiment with a measure.
3. **Decide:** the founder approves any change of money or priority.
4. **Act.**
5. **Measure.**

| Signal | Source | Cadence | Threshold (start) | Response |
|---|---|---|---|---|
| Demand | Enquiries, PRA conversations, pipeline conversions | Weekly | No new conversation in 7 days | Draft the next outreach for approval |
| Cash | Money records (resilience): income by stream, runway | Weekly | Runway under 3 months of running costs | Propose cuts, or a sales push |
| Delivery | PRA monthly updates: work done, results against the baseline | Monthly per client | A month with no finished work, or results below the baseline | Raise it as a REEDS request to fix first |
| Reliability and security | The daily check: CI, the worker, advisors, the audit chain | Daily | Anything other than healthy and intact | Fix first (OPERATOR rule 1) |
| Cost | AI spend per provider, hosting use against free tiers | Weekly | Over 80% of a free allowance | Switch provider, or slow the schedule |
| Competitors and technology | Web research (Firecrawl), the founder's videos and notes | Monthly | A tool that does a stage of our work better or cheaper | Assess (ADR 0005 criteria); adopt behind the provider port, or ignore |

**What runs today:**
- the daily check covers reliability and security;
- the live counts cover demand and delivery, roughly.

**Built (20 Oct): the weekly signal brief.**
- A REEDS request, "The weekly signal brief". Each signal is read from TEBOS's own records, counted, recounted
  independently, and reported against its threshold:
  - demand: no new enquiry or lead in 7 days is the warning;
  - cash: overdue client invoices;
  - delivery: property workstreams past their deadline;
  - reliability: failed runs and failed emails;
  - security: the audit chain.
- An admin or operator switches it on once (REEDS → Weekly signal brief). The worker then files it every week for
  them. The database allows the server to file only this one kind, at most once in six days, and only while that
  person still holds the role.
- Cost, competitor and technology signals come from outside the database. They are added next, through the connected
  research platforms.

## 3. How we build an advantage without exhausting capital

| Sell now (no new spend) | Build when evidence asks | Avoid until there is demand |
|---|---|---|
| PRA monthly plan (prices decided, monthly update built) | Weekly signal brief; subscription records and billing for PRA | SOC 2, single sign-on, dedicated databases, multi-region |
| TEBOS diagnostic and board for one business | The model gateway on Railway (when keys and revenue exist) | Own models, hardware, mobile apps |
| Proven parts of the real-estate office (TEPOS) | A new industry template, only when a paying client is in that industry | Cloud marketplaces, fundraising decks before revenue |

**Capital rules:**
- **Every recurring cost** is covered by free tiers or by revenue it enables. The worker runs inside Railway's free
  plan.
- **Every experiment** has a time box, a measure and a kill rule written before it starts.
- **Paid tools** are bought only when a client's result needs them, and their cost is in that client's delivery cost.

## 4. Outside platforms: doing what one assistant can't at scale

TEBOS uses specialist platforms through connectors. Each is replaceable, and each is used with the usual approvals.

| Need | Platform (connected 19 Oct unless noted) | Use |
|---|---|---|
| Market and competitor research at volume | **Firecrawl** | The monthly technology and competitor signal; market facts for pricing |
| Prospect data | **Apollo** | Lists for outreach the founder approves |
| Video and image production | **Higgsfield**, **OpusClip** (needs a paid plan for API use) | Marketing content and property visuals, always labelled as renderings |
| Voice | **ElevenLabs** | Intake calls, already built |
| Design | **Figma**; **Getlayers** (not connected) | The design system, proposal 6 |
| Automating clients' existing tools | **Make**, **Zapier** | Connecting a client's apps without custom code |
| Forms and intake | **Jotform** | Client intake forms that feed a case |
| Collaboration | **Miro**, **monday.com** | Workshops and client-facing plans |
| Infrastructure | **Supabase**, **Railway**, **Vercel** | The platform itself |
| Email | **Gmail** (drafts only); **Resend** (connection incomplete) | Drafts for approval; transactional email once Resend is connected |

**About Getlayers:**
- It isn't in the connector directory.
- To use it as a live tool, the founder adds it in claude.ai → Settings → Connectors → Add custom connector, with the
  MCP address from their Getlayers account.
- Until then its library is used as reference, under the proposal-6 rules (no copied brands).

## Consequences

- REEDS's role is no longer only answering requests. It also watches the signal register and turns signals into
  proposals.
- Every new tool or platform is assessed against the capital rules in section 3, and sits behind a port, so it can be
  replaced.
- This ADR is reviewed each quarter, or after the first paying client, whichever comes first.
