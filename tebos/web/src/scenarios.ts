// Scenario films: a day in the life of a business running on its TEBOS
// operating system, played in meeting mode so a prospect sees what they'd get
// instead of hearing about it. Each moment is a real step of the blueprint
// (scenarios.test.ts checks every one), told with illustrative names and
// numbers. Scenarios are illustrations, never client records: the player
// says so on screen.
import { blueprintByKey, type Blueprint } from "@core/blueprints";

export interface ScenarioMoment {
  /** The time of day it happens, as shown on screen. */
  at: string;
  /** The blueprint flow, by name. */
  flow: string;
  /** The step in that flow, from 0. */
  step: number;
  /** What happens, in the prospect's words. */
  text: string;
}

export interface Scenario {
  key: string;
  label: string;
  blueprintKey: string;
  /** Who the illustration is about. */
  who: string;
  before: string[];
  moments: ScenarioMoment[];
  after: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    key: "gym",
    label: "A gym",
    blueprintKey: "gym-fitness",
    who: "An illustrative gym with 400 members",
    before: [
      "The owner drives in after hours to check that the people training are members.",
      "Members' questions pile up on her phone, day and night.",
      "A failed debit order is noticed weeks later, if at all.",
    ],
    moments: [
      { at: "05:58", flow: "Member at the door to checked in", step: 0, text: "Sipho scans his QR code. He's paid up, so the door opens and his entry is logged." },
      { at: "06:04", flow: "Member at the door to checked in", step: 1, text: "Jade's membership lapsed last month. The door stays shut, and the payment link is on her phone before she turns round." },
      { at: "06:10", flow: "Member at the door to checked in", step: 2, text: "A guest signs in at the front desk with ID and pays the day fee. The exception is logged." },
      { at: "07:00", flow: "Member at the door to checked in", step: 3, text: "The morning report reaches the owner: 86 entries yesterday, nobody in without a valid membership." },
      { at: "09:12", flow: "Enquiry to paying member", step: 0, text: "A new enquiry on WhatsApp gets the price list and a free trial slot within a minute." },
      { at: "12:30", flow: "Member message to answered", step: 0, text: "“Are you open on the public holiday?” Answered from the FAQ, instantly." },
      { at: "13:45", flow: "Member message to answered", step: 2, text: "A refund request above the limit: the only thing today that needed the owner." },
      { at: "18:00", flow: "Failed debit order to recovered", step: 1, text: "Two debit orders failed. Payment links went out the same day; access pauses on day 7 if they stay unpaid." },
    ],
    after: [
      "Nobody walks the floor to check memberships.",
      "One decision reached the owner today.",
      "Every rule is written down, so the gym runs the same when she isn't there.",
    ],
  },
  {
    key: "sports-agency",
    label: "A sports agency",
    blueprintKey: "sports-agency",
    who: "An illustrative sports agency with 30 athletes",
    before: [
      "Every opportunity, contract and contact lives in the CEO's phone.",
      "Leads from events go cold because nobody owns the follow-up.",
      "If the CEO is away, deals stop.",
    ],
    moments: [
      { at: "08:15", flow: "Opportunity to signed deal", step: 0, text: "A regional athletics meet needs two sprinters for an appearance. Sales logs it with its value and deadline." },
      { at: "08:40", flow: "Opportunity to signed deal", step: 1, text: "The roster matches it to two athletes by sport, level and availability." },
      { at: "09:30", flow: "Opportunity to signed deal", step: 2, text: "First contact goes out from the outreach template, with follow-ups booked for day 3 and day 7." },
      { at: "11:00", flow: "Media request to appearance", step: 0, text: "A podcast asks for an interview. PR screens it against the athlete's brand rules and accepts." },
      { at: "11:20", flow: "Media request to appearance", step: 1, text: "The athlete manager checks the calendar: no double booking." },
      { at: "14:00", flow: "Opportunity to signed deal", step: 3, text: "The CEO's only job today: agree the fee and exclusivity. Everything else follows the standard terms." },
      { at: "15:30", flow: "Opportunity to signed deal", step: 4, text: "Legal prepares the contract from the standard clauses and flags the one clause that's different." },
      { at: "16:10", flow: "Opportunity to signed deal", step: 5, text: "Signed. Finance logs the commission due, with its date." },
    ],
    after: [
      "Opportunities live in the pipeline, not in one phone.",
      "The team follows up on rules, so nothing goes cold.",
      "The CEO decides what only the CEO can decide.",
    ],
  },
];

export const scenarioByKey = (key: string) => SCENARIOS.find((s) => s.key === key);

/** The blueprint step a moment shows, or a reason it doesn't exist. */
export function stepOf(s: Scenario, m: ScenarioMoment): { blueprint: Blueprint; flowIndex: number } | string {
  const blueprint = blueprintByKey(s.blueprintKey);
  if (!blueprint) return `unknown blueprint ${s.blueprintKey}`;
  const flowIndex = blueprint.flows.findIndex((f) => f.name === m.flow);
  if (flowIndex < 0) return `unknown flow "${m.flow}"`;
  if (!blueprint.flows[flowIndex]!.steps[m.step]) return `flow "${m.flow}" has no step ${m.step}`;
  return { blueprint, flowIndex };
}
