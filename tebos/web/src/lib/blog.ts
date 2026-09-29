// TEBOS's public articles. Written to be useful on their own: a reader should
// be able to act on each one without buying anything. They never claim
// clients or results TEBOS doesn't have. Text uses the small agreement
// format: "## " headings, "- " lists, **bold**.

export interface Post {
  slug: string;
  title: string;
  summary: string;
  date: string;
  minutes: number;
  body: string;
}

export const POSTS: Post[] = [
  {
    slug: "the-founder-is-the-middleware",
    title: "The founder is the middleware: how to tell if your business runs through you",
    summary: "Ten questions that show where a growing business still depends on one person's memory, and what to do about each one.",
    date: "2026-09-29",
    minutes: 6,
    body: `Most growing businesses don't lack tools. They have a CRM, an accounting package, a project tool, WhatsApp groups and a shared drive. What they lack is structure: the agreed way work moves from one person to the next, who owns each step, and how anyone knows it went right.

When that structure is missing, something else fills the gap. Usually it's the founder. Leads, prices, exceptions, handovers and "quick questions" all route through one person's head. The founder becomes the middleware: the software that connects everything, except it gets tired, goes on leave and can't be copied.

## Ten questions to find out

Answer each one honestly. A "yes" means that part of the business runs through you.

- **1.** Does a new lead wait for you before anyone replies or quotes?
- **2.** Are prices, discounts or scope decided case by case, by you?
- **3.** When a client complains, does it end up on your desk?
- **4.** Could you list the steps from "client says yes" to "work delivered", and would your team list the same steps?
- **5.** Do handovers between people happen in chat messages rather than in a place anyone can check?
- **6.** Do you find out something is late only when a client tells you?
- **7.** Is your monthly revenue something you work out, rather than something you read?
- **8.** When you were last away for a week, did anything important stop?
- **9.** Does a new hire learn the job by shadowing someone, because nothing is written down?
- **10.** Are your targets numbers you'd recognise on a report, or feelings about how the month went?

Three or fewer: you have structure; keep it measured. Four to seven: you're the middleware in the places that matter most. Eight or more: the business is you, and growth will make it heavier, not lighter.

## What to do about it

Don't start by buying another tool. Start by drawing the business as it runs today.

- **List your flows.** A flow has a trigger and an outcome: "a lead arrives" to "the client has paid"; "a job is booked" to "the invoice is settled". Most businesses have five to ten that matter.
- **Write each step, and who really does it.** Not who should, who does. Mark every step that only you do, and every step that isn't written down anywhere.
- **Pick one number per flow.** How long leads wait for a reply. How many deliverables are waiting on a client. How much cash came in this month. If a number can't be read from a system, note that too.
- **Move one step at a time.** Take the founder-only step that happens most often, write the rule you apply in your head, and give it to an owner. Then measure whether the number holds.

## Why this matters more than it seems

The founder-as-middleware pattern doesn't show up in the accounts. It shows up as slower growth, tired founders and good staff who leave because they can't make decisions. It also caps the value of the business: a buyer or an investor pays for a business that runs, not for a person who runs it.

This is the work TEBOS does: map every flow, measure it on real numbers, and build the structure so the business holds without you. You can do the first pass yourself with the questions above. If you'd like to see what a mapped business looks like, there's a demo on a fictional agency at [tebos-demo.vercel.app/demo](/demo).`,
  },
  {
    slug: "map-your-business-like-a-chessboard",
    title: "Map your business like a chessboard",
    summary: "Pieces, flows, rules and objectives: a simple model for seeing how a business really runs, and where it breaks.",
    date: "2026-09-29",
    minutes: 5,
    body: `A chessboard is a useful way to think about a business, because chess makes everything explicit. Every piece has a place. Every move follows a rule. There is an objective, and a clock.

Most businesses have all of these too. They're just implicit, scattered across people's heads, inboxes and tools. Making them explicit is the first step to running a business that doesn't depend on any one person.

## The pieces

Pieces are everything the business uses to get work done:

- **People and teams:** sales, delivery, finance, the founder.
- **Tools:** the CRM, the accounting package, the project tool.
- **Providers:** the web studio, the bookkeeper, the payment provider.
- **Channels and data:** the WhatsApp line clients use, the spreadsheet with every price.

Write them down, with who owns each one. You'll usually find a few pieces nobody owns, and a few that exist only because someone set them up years ago.

Your existing suppliers are pieces, not competitors to anything new. A good operating structure uses what you already have.

## The flows

Flows are how work moves across the board: from a trigger ("a lead arrives") to an outcome ("the client has paid"). For each flow, write the steps in order and mark who does each one:

- **Founder:** only you.
- **Staff:** someone on the team.
- **Automation:** a tool does it, with a written rule.
- **Provider:** a supplier does it.
- **Client:** the client does it.

Then mark which steps are written down anywhere. A step done by the founder and written nowhere is the most fragile point in the business.

## The rules

Rules are the decisions inside the flows: which leads you take, what needs approval, what counts as done. Most are in the founder's head. Writing a rule down is what lets someone else make the decision, and it's the only safe basis for automating anything.

## The objectives and the clock

An objective is a number with a target, an owner and a date: "no lead waits more than a day for a reply, by 31 December". It is measured from a system, not estimated. The clock is the date, and how fresh the number is.

Objectives are what make a map useful. Without them you have a nice diagram. With them, every flow has a purpose, and you can see whether a change helped.

## Putting it together

Draw the board once, honestly, and three things become visible:

- which steps still run through the founder;
- which flows have no owner and no number;
- where a tool is doing a job no one decided it should do.

That is the starting point for structure. Fix the most-used founder-only step first, give it a written rule and an owner, and measure it.

TEBOS builds and runs this board for growing businesses, measured on their real numbers. See a mapped fictional agency in [the demo](/demo).`,
  },
  {
    slug: "why-we-dont-promise-results",
    title: "Why we don't promise results, and what we measure instead",
    summary: "\"We'll double your revenue\" is easy to say. Here's why TEBOS doesn't say it, and the promise we do make.",
    date: "2026-09-29",
    minutes: 4,
    body: `Many services that sell to growing businesses promise outcomes: more revenue, more leads, hours saved. We don't, and that's deliberate.

## Results depend on things no provider controls

Revenue depends on the market, the product, pricing, competitors, the economy and a hundred decisions the business makes every week. Anyone who promises a revenue figure is either guessing, or planning to take credit for things that would have happened anyway.

What an operating structure can honestly promise is narrower, and more useful: **the business becomes structurally capable of producing the outcomes it wants, with less dependence on individual people, memory, improvisation and the founder.**

## What we measure instead

We set objectives with each client, and each has a number, a target, an owner and a date. The rule is simple: **a result only counts when a connected system reports it.**

- If the number comes from your accounting package, your CRM or your platform, it's a measurement.
- If it's what someone says it is, it's recorded as a statement, and it never counts toward the target.
- Once an objective is set, the target doesn't move. If it needs to change, the old one is retired, with a reason, and a new one is set.

This is stricter than most reporting. It means that when an objective is marked achieved, anyone can check the evidence behind it.

## Why this is better for you

- **You can tell if it's working.** Not from a slide, from your own numbers.
- **Nobody can take credit for luck.** Or blame bad luck for bad structure.
- **Decisions get easier.** When everyone can see the same number, you argue less about what happened and more about what to do.

We run TEBOS itself the same way: our own leads, decisions, cash collected and delivery are measured automatically on our own board, from our own systems.

If you'd like to see objectives measured from evidence, the [demo](/demo) shows it on a fictional agency.`,
  },
  {
    slug: "before-you-buy-another-tool",
    title: "Before you buy another tool: a 30-minute operating audit",
    summary: "A short exercise to run with your team before any new software purchase. It usually saves the purchase.",
    date: "2026-09-29",
    minutes: 5,
    body: `A new tool feels like progress. It's a decision you can make today, and it comes with a demo that looks organised. But tools don't fix a missing structure; they just give it somewhere new to be missing.

Before your next purchase, run this 30-minute audit with the people who'll use it.

## Minute 0–5: name the problem as a flow

Write the problem as a flow with a trigger and an outcome. Not "we need a CRM", but "leads arrive on four channels, and some never get a reply". The trigger is "a lead arrives"; the outcome is "the lead gets a reply and a decision".

## Minute 5–15: write the steps as they happen today

On a whiteboard, list every step in order. For each one, write:

- who does it today (a name, not a role);
- where it happens (which tool, inbox or chat);
- whether it's written down anywhere.

Be honest. The value of this exercise is in seeing the real flow, not the intended one.

## Minute 15–20: find the break

Circle the step where things go wrong. It's usually one of these:

- **A handover** between two people, with no agreed place to hand over.
- **A decision** only one person can make.
- **A wait** where nobody owns the next move.

## Minute 20–25: decide what would fix it

Ask whether the break needs a tool at all. Often it needs:

- an owner for the step;
- a written rule for the decision;
- one agreed place where the handover happens.

If it does need a tool, you now know exactly what the tool must do, for which step, and how you'll know it worked.

## Minute 25–30: pick the number

Choose one number that tells you the flow is healthy, like "no lead waits more than one working day", and decide where you'll read it from. If you can't read it from any system, that's worth knowing before you buy anything.

## What usually happens

In most audits, the team finds the problem is an unowned step or an unwritten rule, not a missing tool. Sometimes a tool is still the answer, but now it's bought for a specific job, with a way to tell if it's doing it.

TEBOS does this across the whole business: every flow mapped, owned and measured, using the tools you already have wherever possible. [See how it looks](/demo).`,
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug) ?? null;
