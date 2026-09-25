import type { Playbook } from "./types";

// Marketing agencies and marketing service businesses. Questions probe the
// usual failure points: revenue concentration, pipeline, scoping and scope
// creep, delivery, capacity, proof of results, retention and cash. Answers
// are the owner's statements; `confirmWith` says what would verify them.
export const marketingAgencyPlaybook: Playbook = {
  key: "marketing-agency",
  version: 1,
  industry: "marketing",
  name: "Marketing agency operations diagnostic",
  audience: "The owner or managing director, or someone who knows how clients are won, served and billed.",
  sections: [
    {
      key: "clients",
      title: "Clients and revenue",
      questions: [
        {
          key: "clients.mix",
          text: "How many active clients do you have right now, and how many are on retainers versus one-off projects?",
          followUps: ["Roughly what is a typical monthly retainer worth?", "Has that number grown or shrunk over the last year?"],
          diagnoses: "Revenue predictability and dependence on project work.",
          confirmWith: ["Client list with contract types", "Accounting system (invoices by client)"],
        },
        {
          key: "clients.concentration",
          text: "If you think about your biggest client, what share of your monthly revenue do they make up?",
          followUps: ["What would happen if they left next month?", "And your top three together?"],
          diagnoses: "Concentration risk: one client leaving could break the business.",
          confirmWith: ["Revenue by client for the last 12 months"],
        },
      ],
    },
    {
      key: "pipeline",
      title: "Winning new work",
      questions: [
        {
          key: "pipeline.sources",
          text: "Where do most of your new clients come from at the moment?",
          followUps: ["Is that something you control, or does it depend on referrals arriving?", "How many new clients did you win in the last three months?"],
          diagnoses: "A pipeline that depends on referrals or the founder's network, with no repeatable lead generation.",
          confirmWith: ["CRM or lead tracker", "List of recent wins with their source"],
        },
        {
          key: "pipeline.proposals",
          text: "Walk me through what happens from a first enquiry to a signed client. How long does that usually take, and how many proposals end up being accepted?",
          followUps: ["Who writes the proposals?", "Do you follow up on proposals that go quiet?"],
          diagnoses: "Slow or leaky sales process; low proposal win rate; no follow-up discipline.",
          confirmWith: ["Proposals sent and won over the last 6 months", "CRM pipeline stages"],
        },
      ],
    },
    {
      key: "scoping",
      title: "Scoping and pricing",
      questions: [
        {
          key: "scoping.pricing",
          text: "How do you decide what to charge a client? Is it by hours, by deliverables, a fixed monthly fee, or results?",
          followUps: ["When did you last raise your prices?", "Do you know which clients are profitable?"],
          diagnoses: "Underpricing and not knowing profitability per client.",
          confirmWith: ["Rate card or pricing sheet", "Time tracking against fees per client"],
        },
        {
          key: "scoping.creep",
          text: "How often do clients ask for work that wasn't in the original agreement, and what usually happens when they do?",
          followUps: ["Is that extra work billed?", "Is the scope written down somewhere the whole team can see?"],
          diagnoses: "Scope creep: unbilled work eating margin and team time.",
          confirmWith: ["Statements of work or contracts", "Change requests and whether they were invoiced"],
        },
      ],
    },
    {
      key: "delivery",
      title: "Delivering the work",
      questions: [
        {
          key: "delivery.onboarding",
          text: "When a new client signs, what happens in the first two weeks? How do you collect the brief, access and assets you need?",
          followUps: ["Is that the same every time, or does it depend who handles it?", "What usually delays the start?"],
          diagnoses: "No standard onboarding: slow starts, missing access, repeated questions to the client.",
          confirmWith: ["Onboarding checklist or brief template", "Project management tool"],
        },
        {
          key: "delivery.workflow",
          text: "How does work move through the team, from brief to something the client approves? Where do things tend to get stuck?",
          followUps: ["How many rounds of revisions is normal?", "How do you track deadlines?"],
          diagnoses: "Approval bottlenecks, revision loops and missed deadlines.",
          confirmWith: ["Project management tool (tasks, due dates, status)", "Examples of approval threads"],
        },
      ],
    },
    {
      key: "capacity",
      title: "Team and capacity",
      questions: [
        {
          key: "capacity.team",
          text: "Who does the work: how many people in-house, and how much do you rely on freelancers?",
          followUps: ["What happens when a key person is away?", "Is anything only one person knows how to do?"],
          diagnoses: "Key-person dependence and fragile delivery capacity.",
          confirmWith: ["Team list with roles", "Freelancer invoices"],
        },
        {
          key: "capacity.utilisation",
          text: "How stretched is the team right now? Do you track how much of people's time goes to billable client work?",
          followUps: ["How often is the team working late or at weekends?", "Have you turned work away because you were too busy?"],
          diagnoses: "Over- or under-utilisation; burnout risk; no visibility of capacity.",
          confirmWith: ["Time tracking data", "Resourcing or capacity plan"],
        },
      ],
    },
    {
      key: "results",
      title: "Results and reporting",
      questions: [
        {
          key: "results.reporting",
          text: "How do you show clients what their money achieved? What goes into your reports, and how long do they take to put together?",
          followUps: ["Are the numbers tied to the client's business goals, like leads or sales?", "Who prepares the reports?"],
          diagnoses: "Reporting that takes too long, or shows activity instead of outcomes, putting renewals at risk.",
          confirmWith: ["A recent client report", "Analytics and ad platform access"],
        },
      ],
    },
    {
      key: "retention",
      title: "Keeping clients",
      questions: [
        {
          key: "retention.churn",
          text: "Over the last year, how many clients left, and what were the main reasons?",
          followUps: ["Did you see it coming?", "How long does a typical client stay?"],
          diagnoses: "Client churn and its causes; no early-warning signals.",
          confirmWith: ["Client start and end dates", "Exit feedback or cancellation emails"],
        },
      ],
    },
    {
      key: "finance",
      title: "Cash and admin",
      questions: [
        {
          key: "finance.cashflow",
          text: "How quickly do clients usually pay, and how often are invoices late?",
          followUps: ["Who chases late payments?", "Has late payment ever made it hard to pay the team or suppliers?"],
          diagnoses: "Cash-flow strain from slow payment and weak invoicing discipline.",
          confirmWith: ["Aged debtors report", "Accounting system (invoices and payments)"],
        },
        {
          key: "finance.tools",
          text: "Which tools do you run the agency on: for projects, communication, time tracking, invoicing and customer records?",
          followUps: ["Do those tools talk to each other, or is information copied by hand?"],
          diagnoses: "Disconnected tools and manual re-entry; where TEBOS could connect to read real data.",
          confirmWith: ["List of software subscriptions"],
        },
      ],
    },
    {
      key: "priorities",
      title: "Your priorities",
      questions: [
        {
          key: "priorities.biggest_problem",
          text: "If you could fix one thing in how the agency runs in the next three months, what would it be?",
          followUps: ["What have you already tried?", "What would it be worth to the business if it were fixed?"],
          diagnoses: "The owner's own priority, to weigh against what the evidence shows.",
          confirmWith: [],
        },
      ],
    },
  ],
};
