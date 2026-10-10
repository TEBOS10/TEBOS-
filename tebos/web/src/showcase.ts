// What TEBOS does, shown rather than told: rows of categories (like a
// streaming service's genres), each a handful of plays. A play is one problem a
// real business has, and the system TEBOS puts in its place: what sets it off,
// the written rule, who or what does the work, and what comes out.
//
// Every play is an illustration with invented names and no invented results:
// TEBOS has no client case studies yet, and the page says so. Each one says
// honestly whether TEBOS's software runs it today, runs it once a tool is
// connected, designs it (the flow and its written rules) for the business's
// own team to run, or hasn't been built yet. The categories follow what businesses
// are paying for now (docs/market-needs.md).

export type PlayStatus = "runs" | "connect" | "designed" | "planned";

export const STATUS_LABEL: Record<PlayStatus, string> = {
  runs: "Runs in TEBOS today",
  connect: "Runs once your tool is connected",
  designed: "TEBOS designs it; your team runs it",
  planned: "On the roadmap",
};

export type Actor = "automatic" | "team" | "owner" | "customer" | "supplier";

export interface PlayStep {
  /** Who or what does this step. */
  by: Actor;
  /** What happens, in a few words. */
  text: string;
}

export interface Play {
  key: string;
  title: string;
  /** The kind of business it's drawn from. */
  business: string;
  /** The problem today, in one line. */
  before: string;
  /** The steps, in order: the first is what sets it off. */
  steps: PlayStep[];
  /** What changes, in one line. No figures: there are no client results yet. */
  after: string;
  status: PlayStatus;
  /** Where to see the real thing in TEBOS, when it runs today. */
  see?: { label: string; href: string };
}

export interface Category {
  key: string;
  title: string;
  /** One line under the row title. */
  blurb: string;
  plays: Play[];
}

export const CATEGORIES: Category[] = [
  {
    key: "sales",
    title: "Enquiries and sales",
    blurb: "No lead waits on one person's inbox.",
    plays: [
      {
        key: "enquiry-to-booked",
        title: "Every enquiry answered in minutes",
        business: "A physiotherapy practice",
        before: "Enquiries arrive by WhatsApp, email and the website, and wait until reception has a gap.",
        steps: [
          { by: "customer", text: "Asks about an appointment on any channel" },
          { by: "automatic", text: "Logs it in one pipeline, tagged by service" },
          { by: "automatic", text: "Sends prices and open slots by the written rule" },
          { by: "team", text: "Reception confirms only the unusual cases" },
        ],
        after: "One list of every enquiry, each answered the same way, whoever is on shift.",
        status: "designed",
        see: { label: "Take the self-check", href: "/self-check" },
      },
      {
        key: "meeting-call",
        title: "A prospect talks to TEBOS during the meeting",
        business: "Any business selling to other businesses",
        before: "Discovery calls are booked for next week, and half never happen.",
        steps: [
          { by: "customer", text: "Watches the film and leaves a number" },
          { by: "automatic", text: "A voice agent calls within a minute and asks the intake questions" },
          { by: "automatic", text: "Next morning, an outline of what would be built is emailed" },
          { by: "owner", text: "Closes the ones who said yes" },
        ],
        after: "The owner spends time only on people who already want to go ahead.",
        status: "connect",
      },
      {
        key: "quote-to-signed",
        title: "Quote to signed contract without chasing",
        business: "A marketing agency",
        before: "Quotes are typed from memory, and contracts sit unsigned in inboxes.",
        steps: [
          { by: "team", text: "Picks the package; the price comes from the rate card" },
          { by: "automatic", text: "Sends the contract from an approved template" },
          { by: "customer", text: "Signs online, with the exact text recorded" },
          { by: "automatic", text: "Sends the first invoice and opens onboarding" },
        ],
        after: "Prices can't drift, and nothing starts before the contract is signed and paid.",
        status: "designed",
      },
    ],
  },
  {
    key: "finance",
    title: "Money in and out",
    blurb: "Invoices go out on time and late payments are followed up, without awkward calls.",
    plays: [
      {
        key: "monthly-billing",
        title: "Monthly invoices that send themselves",
        business: "A bookkeeping firm with retainers",
        before: "Invoices go out when someone remembers, and late payers are chased by hand.",
        steps: [
          { by: "automatic", text: "Issues each client's invoice on their billing day" },
          { by: "automatic", text: "Sends a payment link and reminds at 3, 7 and 14 days" },
          { by: "team", text: "Records an EFT that arrived outside the link" },
          { by: "owner", text: "Decides only on accounts more than 14 days late" },
        ],
        after: "Cash comes in on a schedule, and the owner sees only the real problems.",
        status: "designed",
      },
      {
        key: "failed-debit",
        title: "A failed debit order recovered the same day",
        business: "A gym",
        before: "A failed debit order is noticed weeks later, if at all.",
        steps: [
          { by: "automatic", text: "Spots the failed payment in the bank feed" },
          { by: "automatic", text: "Messages the member a payment link" },
          { by: "automatic", text: "Pauses door access on day 7 if it stays unpaid" },
          { by: "team", text: "Calls only the members who ask for help" },
        ],
        after: "Unpaid months are caught in days, not at the year-end count.",
        status: "designed",
      },
      {
        key: "spend-approval",
        title: "Spending approved by rule, not by asking",
        business: "A construction subcontractor",
        before: "Every purchase waits for the owner's WhatsApp reply.",
        steps: [
          { by: "team", text: "Requests a purchase with the job it belongs to" },
          { by: "automatic", text: "Approves it if it's under the limit and on budget" },
          { by: "owner", text: "Approves only what's over the limit" },
          { by: "automatic", text: "Records who approved what, and why" },
        ],
        after: "Sites keep moving, and every rand spent has an owner and a reason.",
        status: "designed",
      },
    ],
  },
  {
    key: "automation",
    title: "Taking work off the founder",
    blurb: "The steps only the founder does get a written rule and a new owner.",
    plays: [
      {
        key: "founder-step",
        title: "A founder-only step handed over",
        business: "A sports management agency",
        before: "Every new client waits for the founder to decide which team takes them.",
        steps: [
          { by: "team", text: "Proposes who should do it, and the rule they'd follow" },
          { by: "owner", text: "Approves the rule once" },
          { by: "automatic", text: "Puts the new rule on the operating board" },
          { by: "team", text: "Routes every new client by the rule from then on" },
        ],
        after: "The founder decides the rule once instead of deciding every case.",
        status: "runs",
        see: { label: "See the operating systems", href: "/systems" },
      },
      {
        key: "repeat-task",
        title: "A repeated task run automatically",
        business: "A property management company",
        before: "Lease renewals are tracked in someone's head and a spreadsheet.",
        steps: [
          { by: "automatic", text: "Reads the renewal dates from the property system" },
          { by: "automatic", text: "Drafts each renewal 60 days ahead" },
          { by: "team", text: "Approves the drafts in one batch" },
          { by: "automatic", text: "Sends them, and records it on the board" },
        ],
        after: "No renewal is missed because someone was on leave.",
        status: "planned",
      },
    ],
  },
  {
    key: "reporting",
    title: "Knowing your numbers",
    blurb: "Targets measured from your own systems, never typed in.",
    plays: [
      {
        key: "measured-objective",
        title: "Targets that measure themselves",
        business: "A marketing agency",
        before: "Monthly targets live in a slide, filled in by hand the day before the meeting.",
        steps: [
          { by: "owner", text: "Sets the target, its owner and its date" },
          { by: "automatic", text: "Reads the figure from the connected system every day" },
          { by: "automatic", text: "Flags it the moment it falls behind" },
          { by: "team", text: "The owner of the target acts on the flag" },
        ],
        after: "Everyone sees the same number, and nobody can make it look better.",
        status: "connect",
      },
      {
        key: "operating-board",
        title: "The whole business on one board",
        business: "Any business of 5 to 200 people",
        before: "How the business runs lives in the founder's head.",
        steps: [
          { by: "team", text: "Maps the tools, the flows, and who does each step" },
          { by: "automatic", text: "Marks what's confirmed by evidence and what's only described" },
          { by: "automatic", text: "Highlights the steps only the founder does" },
          { by: "owner", text: "Sees in one picture where the business still runs through them" },
        ],
        after: "A shared map everyone works from, drawn from records, not memory.",
        status: "runs",
        see: { label: "See a board in 3D", href: "/" },
      },
    ],
  },
  {
    key: "delivery",
    title: "Delivering for clients",
    blurb: "A new client gets the same quality of service, whoever is on the team.",
    plays: [
      {
        key: "onboarding",
        title: "A new client onboarded without a kick-off scramble",
        business: "TEBOS itself, for each of its own clients",
        before: "Onboarding depends on who happened to sign the client.",
        steps: [
          { by: "automatic", text: "Opens a dated delivery plan the day the client pays" },
          { by: "team", text: "Completes each task with a note of what was done" },
          { by: "customer", text: "Sees progress and confirms each milestone" },
          { by: "automatic", text: "Flags any task that's late" },
        ],
        after: "Every client gets the same first 30 days, written down and on time.",
        status: "runs",
      },
      {
        key: "maintainer-queue",
        title: "Problems spotted before the client calls",
        business: "TEBOS itself, watching each client's connected systems",
        before: "Issues are found when the client phones to complain.",
        steps: [
          { by: "automatic", text: "Watches the client's connected systems for warning signs" },
          { by: "automatic", text: "Opens an item in the maintainer's queue with the evidence" },
          { by: "team", text: "Fixes it and closes it with a note" },
          { by: "automatic", text: "Keeps watching until the condition clears" },
        ],
        after: "The client hears about fixes, not surprises.",
        status: "runs",
      },
    ],
  },
  {
    key: "website",
    title: "Website and bookings",
    blurb: "The website becomes part of how work flows in, not a brochure.",
    plays: [
      {
        key: "booking-site",
        title: "A website that books, not just informs",
        business: "A beauty salon",
        before: "The website lists prices, then sends everyone to WhatsApp to book.",
        steps: [
          { by: "customer", text: "Books and pays a deposit on the website" },
          { by: "automatic", text: "Puts the booking in the right stylist's diary" },
          { by: "automatic", text: "Sends a reminder the day before" },
          { by: "team", text: "Handles only reschedules" },
        ],
        after: "Fewer no-shows, and nobody answering booking messages after hours.",
        status: "designed",
      },
      {
        key: "web-supplier",
        title: "Your web studio, on the same board",
        business: "Any business with an outside web designer",
        before: "Website changes go by email and get lost between the business and the studio.",
        steps: [
          { by: "team", text: "Requests a change from the operating board" },
          { by: "supplier", text: "The studio delivers it against a written brief" },
          { by: "owner", text: "Approves it going live" },
          { by: "automatic", text: "Records what changed and when" },
        ],
        after: "Your suppliers become pieces of your system, not a separate conversation.",
        status: "designed",
      },
    ],
  },
  {
    key: "security",
    title: "Security and control",
    blurb: "The right people see the right things, and every decision leaves a trail.",
    plays: [
      {
        key: "access",
        title: "Access by role, not by password sharing",
        business: "A medical practice",
        before: "One shared login, and nobody knows who changed what.",
        steps: [
          { by: "owner", text: "Invites each person with a role: admin, operator, approver or viewer" },
          { by: "automatic", text: "Shows each role only what it needs" },
          { by: "automatic", text: "Records every change with who made it" },
          { by: "owner", text: "Removes a leaver's access in one step" },
        ],
        after: "Every action has a name on it, and a leaver takes nothing with them.",
        status: "runs",
        see: { label: "Try the demo", href: "/demo" },
      },
      {
        key: "approvals",
        title: "Risky actions need a second pair of eyes",
        business: "A financial services firm",
        before: "Anyone with access can change anything, and does.",
        steps: [
          { by: "team", text: "Proposes a change with the evidence for it" },
          { by: "automatic", text: "Rates its risk and finds who must approve" },
          { by: "owner", text: "Approves or rejects, never their own proposal" },
          { by: "automatic", text: "Carries it out, and records the proof" },
        ],
        after: "No one can approve their own risky change, and nothing can be erased.",
        status: "runs",
        see: { label: "Try the demo", href: "/demo" },
      },
    ],
  },
  {
    key: "service",
    title: "Customer service",
    blurb: "Questions answered at once, and only the real exceptions reach a person.",
    plays: [
      {
        key: "faq",
        title: "The same question never answered twice by hand",
        business: "An online store",
        before: "Staff answer “where is my order?” fifty times a day.",
        steps: [
          { by: "customer", text: "Asks on chat or WhatsApp" },
          { by: "automatic", text: "Answers from the order system and the written FAQ" },
          { by: "automatic", text: "Passes anything outside the rules to a person, with the history" },
          { by: "team", text: "Handles only the exceptions" },
        ],
        after: "Customers get answers at night, and staff deal with real problems.",
        status: "planned",
      },
    ],
  },
];

export const ACTOR_LABEL: Record<Actor, string> = {
  automatic: "Automatic",
  team: "The team",
  owner: "The owner",
  customer: "The customer",
  supplier: "A supplier",
};
