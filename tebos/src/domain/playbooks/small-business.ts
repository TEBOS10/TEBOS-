import type { Playbook } from "./types";

// Any small business, whatever it sells. The written diagnostic a new client
// answers in their first days on TEBOS: where the business still runs through
// the owner, how customers arrive and pay, and which numbers exist. Industry
// playbooks (like the agency one) go deeper; this one is the floor every
// client gets. Answers are the owner's statements; `confirmWith` says what
// would verify them.
export const smallBusinessPlaybook: Playbook = {
  key: "small-business",
  version: 1,
  industry: "any",
  name: "Small business operations diagnostic",
  audience: "The owner, or the person who knows how customers are won, served and billed.",
  sections: [
    {
      key: "owner",
      title: "Where the business runs through you",
      questions: [
        {
          key: "owner.week",
          text: "In a normal week, which jobs do only you do? List the ones that would stop if you were away for two weeks.",
          followUps: ["Which of those could someone else do with a written rule?", "Which ones need your judgement?"],
          diagnoses: "Founder dependence: work that stops when the owner is away.",
          confirmWith: ["The owner's calendar for a typical week"],
        },
        {
          key: "owner.decisions",
          text: "Which decisions does your team bring to you that they could make themselves if the rule were written down?",
          followUps: ["How often does that happen in a week?"],
          diagnoses: "Decisions without written rules, so everything escalates to the owner.",
          confirmWith: ["Messages or emails asking the owner to decide"],
        },
      ],
    },
    {
      key: "customers",
      title: "Customers and sales",
      questions: [
        {
          key: "customers.sources",
          text: "Where did your last ten customers come from?",
          followUps: ["Is that something you control, or does it depend on referrals arriving?"],
          diagnoses: "A pipeline that depends on referrals or the owner's network.",
          confirmWith: ["A list of recent customers with how they found you", "CRM or enquiry inbox"],
        },
        {
          key: "customers.enquiry",
          text: "When someone enquires, what happens next, who answers, and how long does it usually take?",
          followUps: ["What happens to an enquiry that arrives after hours or while you're busy?"],
          diagnoses: "Slow or inconsistent replies that lose customers.",
          confirmWith: ["The enquiry inbox or booking system"],
        },
      ],
    },
    {
      key: "money",
      title: "Money in and out",
      questions: [
        {
          key: "money.invoicing",
          text: "How do invoices go out, and what happens when a customer pays late?",
          followUps: ["Who chases late payers?", "Roughly how much is overdue right now?"],
          diagnoses: "Manual invoicing and chasing; cash stuck in late payments.",
          confirmWith: ["Accounting system (invoices and debtors)"],
        },
        {
          key: "money.spend",
          text: "Who can spend the business's money, and on what, without asking you?",
          followUps: ["Is there an amount above which you want to be asked?"],
          diagnoses: "No spending rules, so every purchase needs the owner.",
          confirmWith: ["Bank or card statements", "Purchase approvals"],
        },
      ],
    },
    {
      key: "team",
      title: "Team and tools",
      questions: [
        {
          key: "team.roles",
          text: "Who is on the team, and what is each person responsible for?",
          followUps: ["Is anything nobody's job, so it falls back to you?"],
          diagnoses: "Unclear ownership of work.",
          confirmWith: ["An organogram or staff list"],
        },
        {
          key: "team.tools",
          text: "Which tools and systems does the business use day to day (accounts, bookings, email, messaging, spreadsheets)?",
          followUps: ["Which ones hold information that only lives in one person's head or inbox?"],
          diagnoses: "Scattered tools and information kept in people rather than systems.",
          confirmWith: ["Logins or a list of subscriptions"],
        },
      ],
    },
    {
      key: "numbers",
      title: "Knowing the numbers",
      questions: [
        {
          key: "numbers.weekly",
          text: "Which numbers do you look at each week or month to know how the business is doing, and where do they come from?",
          followUps: ["Which number do you wish you had but don't?"],
          diagnoses: "No regular reporting; decisions made without the numbers.",
          confirmWith: ["The reports or spreadsheets the owner uses"],
        },
        {
          key: "numbers.goal",
          text: "What is the one result you most want from the next six months?",
          followUps: ["How would you know it had happened?"],
          diagnoses: "The objective the operating system should serve first.",
          confirmWith: ["Budget or plan for the year"],
        },
      ],
    },
  ],
};
