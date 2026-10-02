// Operating-system blueprints: a starting operating system for a kind of
// business — its pieces (tools, providers, channels, roles) and the flows the
// work moves through, each step with who does it and the rule they follow.
//
// A blueprint is how TEBOS gets a new client from "nothing on the board" to a
// draft operating system in minutes instead of weeks. Everything it lays down
// is PROPOSED: the owner confirms each piece (it becomes "stated"), changes it,
// or retires it, and only evidence makes a piece "observed". A blueprint is
// never presented as a client's record or as work done for anyone.
//
// Reviewed, versioned code, like the interview playbooks.

import { PERFORMERS, type ComponentKind, type ObjectiveMetric, type Performer } from "./board";

export interface BlueprintPiece {
  name: string;
  kind: ComponentKind;
  ownerRole?: string;
  description: string;
}

export interface BlueprintStep {
  name: string;
  performer: Performer;
  role?: string;
  /** Name of the blueprint piece the step runs on (required for automation). */
  piece?: string;
  /** The written rule that lets someone other than the founder do the step. */
  rule?: string;
}

export interface BlueprintFlow {
  name: string;
  startsWhen: string;
  doneWhen: string;
  ownerRole: string;
  steps: BlueprintStep[];
}

export interface BlueprintObjective {
  title: string;
  metric: ObjectiveMetric;
  target: number;
  why: string;
}

export interface Blueprint {
  key: string;
  version: number;
  industry: string;
  name: string;
  /** One sentence: what this operating system makes the business able to do. */
  promise: string;
  pieces: BlueprintPiece[];
  flows: BlueprintFlow[];
  /** Suggested objectives; the owner sets real targets, owners and dates. */
  objectives: BlueprintObjective[];
}

const s = (performer: Performer, role: string, name: string, rule?: string, piece?: string): BlueprintStep => ({ name, performer, role, rule, piece });

export const BLUEPRINTS: Blueprint[] = [
  {
    key: "marketing-agency", version: 1, industry: "Marketing agency", name: "Agency operating system",
    promise: "Briefs, delivery and retainers run on rules, so work no longer waits for the founder's approval.",
    pieces: [
      { name: "CRM", kind: "software", ownerRole: "Account manager", description: "Every lead, client and renewal date." },
      { name: "Project board", kind: "software", ownerRole: "Studio lead", description: "Every brief, task and due date." },
      { name: "Accounting system", kind: "software", ownerRole: "Finance", description: "Retainers, invoices and payments." },
      { name: "Shared inbox", kind: "channel", ownerRole: "Account manager", description: "Where client requests arrive." },
      { name: "Brand guidelines", kind: "document", ownerRole: "Creative lead", description: "Each client's rules, written down once." },
    ],
    flows: [
      { name: "Enquiry to signed client", startsWhen: "A new enquiry arrives", doneWhen: "A scope is signed and the first invoice is sent", ownerRole: "Account manager", steps: [
        s("automation", "CRM", "Log the enquiry and acknowledge it", "Every enquiry is logged and answered within one working hour.", "CRM"),
        s("staff", "Account manager", "Qualify the enquiry", "Qualify on budget, timeline and fit using the written checklist; decline politely if two of three fail."),
        s("staff", "Account manager", "Send the proposal from a template", "Use the approved scope template; prices come from the rate card, never improvised."),
        s("founder", "Founder", "Approve proposals above the threshold", "Only proposals above the agreed value need the founder; everything below is the account manager's call."),
        s("staff", "Finance", "Send the first invoice on signature", "Invoice the same day the scope is signed.", "Accounting system"),
      ] },
      { name: "Brief to delivered work", startsWhen: "A signed client sends a brief", doneWhen: "The client approves the delivered work", ownerRole: "Studio lead", steps: [
        s("staff", "Account manager", "Turn the request into a written brief", "No work starts without a brief that names the goal, the deadline and the approver."),
        s("staff", "Studio lead", "Assign and schedule the work", "Assign by capacity on the project board; flag anything that breaks a deadline.", "Project board"),
        s("staff", "Creative", "Produce the work against the brand guidelines", "Check against the client's brand guidelines before review.", "Brand guidelines"),
        s("staff", "Studio lead", "Review before the client sees it", "Review against the brief's checklist; two rounds of revisions are included."),
        s("client", "Client", "Approve or request changes"),
      ] },
      { name: "Retainer renewal", startsWhen: "A retainer is 30 days from its end", doneWhen: "The retainer is renewed or closed with a reason", ownerRole: "Account manager", steps: [
        s("automation", "CRM", "Flag retainers 30 days before renewal", "Raise every retainer due in 30 days.", "CRM"),
        s("staff", "Account manager", "Send the results summary and renewal offer", "Summarise delivered work and results; offer renewal on current terms."),
        s("staff", "Finance", "Update the retainer and invoicing", "Update the retainer and next invoice within one working day of the decision.", "Accounting system"),
      ] },
    ],
    objectives: [
      { title: "Every enquiry answered within an hour", metric: "lead_response_time", target: 1, why: "Speed wins agency work." },
      { title: "Founder hours in delivery below 10 a week", metric: "founder_hours", target: 10, why: "Delivery runs without the founder." },
    ],
  },
  {
    key: "trades-construction", version: 1, industry: "Plumbing and construction", name: "Trades operating system",
    promise: "Quotes, crews and jobs move without every call going to the owner's phone.",
    pieces: [
      { name: "Job management app", kind: "software", ownerRole: "Office manager", description: "Jobs, schedules, photos and sign-offs." },
      { name: "Quote templates", kind: "document", ownerRole: "Estimator", description: "Standard prices and margins per job type." },
      { name: "Supplier accounts", kind: "provider", ownerRole: "Buyer", description: "Materials, prices and lead times." },
      { name: "WhatsApp business line", kind: "channel", ownerRole: "Office manager", description: "Where customers and crews message." },
      { name: "Compliance file", kind: "document", ownerRole: "Office manager", description: "Certificates of compliance, expiry dates, site files." },
    ],
    flows: [
      { name: "Enquiry to booked job", startsWhen: "A customer asks for a quote", doneWhen: "The job is booked with a deposit paid", ownerRole: "Office manager", steps: [
        s("staff", "Office manager", "Capture the job details and photos", "Capture address, problem, photos and urgency before anyone calls back.", "WhatsApp business line"),
        s("staff", "Estimator", "Price from the quote templates", "Standard jobs are priced from the template; site visits only for jobs over the set size.", "Quote templates"),
        s("founder", "Owner", "Approve non-standard quotes", "Only quotes outside the templates need the owner."),
        s("client", "Customer", "Accept the quote and pay the deposit"),
        s("automation", "Job management app", "Book the job and notify the crew", "Book into the next free slot that matches the crew's skills.", "Job management app"),
      ] },
      { name: "Job to signed-off completion", startsWhen: "A booked job's date arrives", doneWhen: "The customer signs off and the final invoice is paid", ownerRole: "Crew lead", steps: [
        s("staff", "Buyer", "Order materials ahead of the job", "Order two working days before the job from the preferred supplier.", "Supplier accounts"),
        s("staff", "Crew lead", "Do the work and photograph each stage", "Photos before, during and after, uploaded to the job.", "Job management app"),
        s("staff", "Crew lead", "Issue the certificate of compliance where required", "Required for every regulated job; filed in the compliance file.", "Compliance file"),
        s("client", "Customer", "Sign off the job"),
        s("staff", "Office manager", "Send the final invoice the same day", "Invoice on sign-off, the same day, with the signed job card attached."),
      ] },
    ],
    objectives: [
      { title: "Every quote sent within 24 hours", metric: "lead_response_time", target: 24, why: "Slow quotes lose jobs." },
      { title: "Owner hours on the phone below 10 a week", metric: "founder_hours", target: 10, why: "The office runs the day." },
    ],
  },
  {
    key: "sports-agency", version: 1, industry: "Sports agency", name: "Sports agency operating system",
    promise: "Athletes, deals and opportunities are worked by the team, with the agent deciding only what needs the agent.",
    pieces: [
      { name: "Athlete roster", kind: "data_store", ownerRole: "Athlete manager", description: "Every athlete, contract date and status." },
      { name: "Opportunity pipeline", kind: "software", ownerRole: "Head of sales", description: "Events, sponsors, clubs and brand deals in play." },
      { name: "Contract library", kind: "document", ownerRole: "Legal", description: "Standard clauses and every signed contract." },
      { name: "Media inbox", kind: "channel", ownerRole: "PR", description: "Interview, appearance and content requests." },
      { name: "Commission ledger", kind: "data_store", ownerRole: "Finance", description: "Commission owed and received per deal." },
    ],
    flows: [
      { name: "Opportunity to signed deal", startsWhen: "An event, sponsor or club opportunity is identified", doneWhen: "The deal is signed and logged in the commission ledger", ownerRole: "Head of sales", steps: [
        s("staff", "Sales", "Log the opportunity with its value and deadline", "Every opportunity is logged the day it is found.", "Opportunity pipeline"),
        s("staff", "Sales", "Match it to athletes on the roster", "Match by sport, level, availability and brand fit.", "Athlete roster"),
        s("staff", "Sales", "Make first contact within 24 hours", "Use the outreach templates; follow up after 3 and 7 days."),
        s("founder", "Agent", "Negotiate the key terms", "The agent negotiates fee and exclusivity; everything else follows the standard terms."),
        s("staff", "Legal", "Prepare the contract from standard clauses", "Start from the contract library; flag any clause outside the standard set.", "Contract library"),
        s("staff", "Finance", "Log the commission due", "Log the commission the day the deal is signed, with its due date.", "Commission ledger"),
      ] },
      { name: "Media request to appearance", startsWhen: "A media or appearance request arrives", doneWhen: "The appearance happens or is declined with a reason", ownerRole: "PR", steps: [
        s("staff", "PR", "Screen the request", "Accept requests that match the athlete's brand rules; decline the rest politely.", "Media inbox"),
        s("staff", "Athlete manager", "Confirm the athlete's availability", "Check the roster calendar before confirming; never double-book an athlete.", "Athlete roster"),
        s("staff", "PR", "Brief the athlete and confirm the details", "Send the written brief (who, where, when, key messages) 48 hours before."),
      ] },
    ],
    objectives: [
      { title: "Every enquiry answered within 24 hours", metric: "lead_response_time", target: 24, why: "Opportunities go to whoever answers first." },
      { title: "New opportunities in the pipeline every month", metric: "custom", target: 20, why: "Sales come from volume of good outreach." },
    ],
  },
  {
    key: "medical-practice", version: 1, industry: "Medical or dental practice", name: "Practice operating system",
    promise: "Bookings, patient records and claims run on the practice's rules, not on the doctor's memory.",
    pieces: [
      { name: "Practice management system", kind: "software", ownerRole: "Practice manager", description: "Appointments, patient files and billing." },
      { name: "Medical aid claims portal", kind: "provider", ownerRole: "Billing clerk", description: "Claims submitted and paid." },
      { name: "Reception phone and WhatsApp", kind: "channel", ownerRole: "Receptionist", description: "Where bookings and questions arrive." },
      { name: "Clinical protocols", kind: "document", ownerRole: "Lead clinician", description: "Written protocols for common cases." },
    ],
    flows: [
      { name: "Booking to seen patient", startsWhen: "A patient asks for an appointment", doneWhen: "The patient is seen and the visit is recorded", ownerRole: "Practice manager", steps: [
        s("staff", "Receptionist", "Book into the right slot type", "Book by appointment type and urgency using the triage list.", "Practice management system"),
        s("automation", "Practice management system", "Send a reminder the day before", "Every booking gets a reminder 24 hours ahead.", "Practice management system"),
        s("staff", "Receptionist", "Check in and confirm medical aid details", "Confirm the medical aid number and authorisation before the patient is seen."),
        s("staff", "Clinician", "See the patient and record the visit", "Record against the clinical protocols.", "Clinical protocols"),
      ] },
      { name: "Visit to paid claim", startsWhen: "A visit is recorded", doneWhen: "The claim or the patient's payment is received", ownerRole: "Billing clerk", steps: [
        s("staff", "Billing clerk", "Code and submit the claim within 48 hours", "Submit within 48 hours of the visit.", "Medical aid claims portal"),
        s("staff", "Billing clerk", "Follow up rejected claims", "Resubmit or bill the patient within 7 days of a rejection."),
        s("staff", "Practice manager", "Review the debtors list weekly", "Every Friday: chase accounts over 30 days; hand over accounts over 90 days."),
      ] },
    ],
    objectives: [
      { title: "No-show rate below 5%", metric: "custom", target: 5, why: "Empty slots are lost income." },
      { title: "Claims submitted within 48 hours", metric: "custom", target: 48, why: "Late claims get rejected." },
    ],
  },
  {
    key: "restaurant", version: 1, industry: "Restaurant or hospitality", name: "Restaurant operating system",
    promise: "Bookings, stock and shifts run every day without the owner standing in the kitchen.",
    pieces: [
      { name: "Point of sale", kind: "software", ownerRole: "Manager on duty", description: "Orders, takings and stock depletion." },
      { name: "Booking system", kind: "software", ownerRole: "Front of house", description: "Reservations and covers." },
      { name: "Suppliers", kind: "provider", ownerRole: "Head chef", description: "Produce, meat and drinks deliveries." },
      { name: "Shift roster", kind: "document", ownerRole: "Manager", description: "Who works when, published a week ahead." },
      { name: "Recipe and plating cards", kind: "document", ownerRole: "Head chef", description: "Every dish written down." },
    ],
    flows: [
      { name: "Stock to plate", startsWhen: "Stock falls below par level", doneWhen: "The order is delivered and checked in", ownerRole: "Head chef", steps: [
        s("automation", "Point of sale", "Flag items below par level", "Flag any item below its par level at close.", "Point of sale"),
        s("staff", "Head chef", "Place the order with the preferred supplier", "Order from the preferred supplier by the cut-off time.", "Suppliers"),
        s("staff", "Kitchen", "Check in the delivery against the order", "Reject short or out-of-spec deliveries on the spot."),
      ] },
      { name: "Service night", startsWhen: "The day's service begins", doneWhen: "Cash-up is done and the day's report is sent", ownerRole: "Manager on duty", steps: [
        s("staff", "Front of house", "Confirm bookings and table plan", "Confirm the day's bookings by noon and set the table plan before service.", "Booking system"),
        s("staff", "Kitchen", "Cook to the recipe cards", "Every dish to its card; changes only with the head chef.", "Recipe and plating cards"),
        s("staff", "Manager on duty", "Handle complaints by the service rules", "Comp up to the set value without asking the owner."),
        s("staff", "Manager on duty", "Cash up and send the day's report", "Cash up against the point of sale; report takings, voids and comps the same night.", "Point of sale"),
      ] },
    ],
    objectives: [
      { title: "Food cost below 32% of sales", metric: "gross_margin", target: 68, why: "Margin is made in the stock room." },
      { title: "Owner hours on shift below 20 a week", metric: "founder_hours", target: 20, why: "The team runs service." },
    ],
  },
  {
    key: "real-estate", version: 1, industry: "Real estate agency", name: "Real estate operating system",
    promise: "Every buyer and seller lead is followed up, and every listing moves to transfer on a written process.",
    pieces: [
      { name: "Property CRM", kind: "software", ownerRole: "Office administrator", description: "Leads, listings and viewings." },
      { name: "Property portals", kind: "channel", ownerRole: "Marketing", description: "Where listings are advertised and leads arrive." },
      { name: "Conveyancing attorneys", kind: "provider", ownerRole: "Principal", description: "Transfers after an offer is accepted." },
      { name: "Mandate and offer templates", kind: "document", ownerRole: "Principal", description: "Approved legal templates." },
    ],
    flows: [
      { name: "Lead to viewing", startsWhen: "A buyer enquires on a listing", doneWhen: "A viewing is booked or the lead is closed with a reason", ownerRole: "Agent", steps: [
        s("automation", "Property CRM", "Assign the lead to the listing agent", "Leads go to the listing agent; overflow to the agent on duty.", "Property CRM"),
        s("staff", "Agent", "Call back within 1 hour", "Every portal lead is called within an hour in business hours."),
        s("staff", "Agent", "Qualify finance and timeline", "Qualify pre-approval and timeline before booking a viewing."),
        s("staff", "Agent", "Book the viewing", "Book only qualified buyers; confirm the time with the seller first."),
      ] },
      { name: "Offer to transfer", startsWhen: "A buyer makes an offer", doneWhen: "The property is registered in the buyer's name", ownerRole: "Principal", steps: [
        s("staff", "Agent", "Draft the offer from the approved template", "Use only the approved offer template; any special condition goes to the principal.", "Mandate and offer templates"),
        s("client", "Seller", "Accept or counter the offer"),
        s("staff", "Office administrator", "Instruct the conveyancer and track the conditions", "Track every suspensive condition with its date.", "Conveyancing attorneys"),
        s("staff", "Agent", "Update buyer and seller weekly until registration", "Every Monday, update both parties on each outstanding condition."),
      ] },
    ],
    objectives: [
      { title: "Every lead called within an hour", metric: "lead_response_time", target: 1, why: "Buyers call the next agent." },
      { title: "Listings sold within 90 days", metric: "custom", target: 90, why: "Stale listings cost mandates." },
    ],
  },
  {
    key: "online-retail", version: 1, industry: "Online retail", name: "Online store operating system",
    promise: "Orders, stock and customer service run from the store's rules, every day of the week.",
    pieces: [
      { name: "Online store", kind: "software", ownerRole: "Store manager", description: "Products, orders and payments." },
      { name: "Courier", kind: "provider", ownerRole: "Fulfilment", description: "Collections, tracking and returns." },
      { name: "Inventory sheet", kind: "data_store", ownerRole: "Fulfilment", description: "Stock on hand and reorder points." },
      { name: "Customer service inbox", kind: "channel", ownerRole: "Customer service", description: "Questions, complaints and returns." },
      { name: "Returns policy", kind: "document", ownerRole: "Store manager", description: "What can be returned, how and when." },
    ],
    flows: [
      { name: "Order to delivered parcel", startsWhen: "A customer pays for an order", doneWhen: "The parcel is delivered", ownerRole: "Fulfilment", steps: [
        s("automation", "Online store", "Confirm the order to the customer", "Every paid order is confirmed immediately.", "Online store"),
        s("staff", "Fulfilment", "Pick and pack within one working day", "Orders paid by 14:00 ship the same day."),
        s("automation", "Courier", "Book the collection and send tracking", "Tracking goes to the customer when the parcel is collected.", "Courier"),
        s("staff", "Fulfilment", "Reorder stock at its reorder point", "Reorder when stock hits the reorder point on the sheet.", "Inventory sheet"),
      ] },
      { name: "Question or return to resolution", startsWhen: "A customer writes in", doneWhen: "The customer's issue is resolved", ownerRole: "Customer service", steps: [
        s("staff", "Customer service", "Answer within 4 working hours", "Use the saved replies; escalate only what they don't cover.", "Customer service inbox"),
        s("staff", "Customer service", "Approve returns under the policy", "Approve any return that meets the policy without asking the owner.", "Returns policy"),
        s("staff", "Store manager", "Review complaints weekly for patterns", "Every week, group complaints by cause; fix the top cause first."),
      ] },
    ],
    objectives: [
      { title: "Orders shipped within 1 working day", metric: "custom", target: 1, why: "Speed drives repeat buyers." },
      { title: "Customer questions answered within 4 hours", metric: "lead_response_time", target: 4, why: "Slow answers lose sales." },
    ],
  },
  {
    key: "accounting-firm", version: 1, industry: "Accounting and bookkeeping", name: "Accounting firm operating system",
    promise: "Monthly books, returns and deadlines run on a calendar, not on the partner's memory.",
    pieces: [
      { name: "Practice management software", kind: "software", ownerRole: "Practice manager", description: "Clients, deadlines and tasks." },
      { name: "Client document portal", kind: "channel", ownerRole: "Bookkeeper", description: "Where clients upload statements and slips." },
      { name: "Tax authority eFiling", kind: "provider", ownerRole: "Tax practitioner", description: "Returns and submissions." },
      { name: "Engagement letters", kind: "document", ownerRole: "Partner", description: "Scope and fees per client." },
    ],
    flows: [
      { name: "Month-end books", startsWhen: "A month closes", doneWhen: "The client's management accounts are delivered", ownerRole: "Bookkeeper", steps: [
        s("automation", "Practice management software", "Request documents from each client", "Request statements on the 1st; remind on the 5th.", "Practice management software"),
        s("client", "Client", "Upload statements and slips", undefined, "Client document portal"),
        s("staff", "Bookkeeper", "Capture and reconcile", "Reconcile every account; queries go to the client in one list."),
        s("staff", "Senior accountant", "Review and deliver the management accounts", "Review against last month; deliver by the 15th."),
      ] },
      { name: "Statutory deadline", startsWhen: "A return is 30 days from its deadline", doneWhen: "The return is submitted", ownerRole: "Tax practitioner", steps: [
        s("automation", "Practice management software", "Raise deadlines 30 days ahead", "Raise every statutory deadline 30 days before it falls due.", "Practice management software"),
        s("staff", "Tax practitioner", "Prepare the return", "Prepare from reconciled books only."),
        s("founder", "Partner", "Sign off returns above the risk threshold", "Only returns above the risk threshold need the partner."),
        s("staff", "Tax practitioner", "Submit and file proof", "Submit before the deadline and file the submission proof on the client's record.", "Tax authority eFiling"),
      ] },
    ],
    objectives: [
      { title: "No missed statutory deadlines", metric: "custom", target: 0, why: "A missed deadline costs the client penalties." },
      { title: "Management accounts by the 15th", metric: "custom", target: 15, why: "Clients decide on current numbers." },
    ],
  },
  {
    key: "logistics", version: 1, industry: "Logistics and courier", name: "Logistics operating system",
    promise: "Bookings, dispatch and proof of delivery run on rules, so the fleet moves without the owner dispatching.",
    pieces: [
      { name: "Dispatch system", kind: "software", ownerRole: "Dispatcher", description: "Bookings, routes and drivers." },
      { name: "Driver app", kind: "software", ownerRole: "Fleet manager", description: "Jobs, navigation and proof of delivery." },
      { name: "Fleet maintenance log", kind: "document", ownerRole: "Fleet manager", description: "Services, licences and roadworthies." },
      { name: "Customer booking line", kind: "channel", ownerRole: "Dispatcher", description: "Where customers book collections." },
    ],
    flows: [
      { name: "Booking to proof of delivery", startsWhen: "A customer books a collection", doneWhen: "Proof of delivery is sent to the customer", ownerRole: "Dispatcher", steps: [
        s("staff", "Dispatcher", "Capture the booking and quote", "Price from the rate table by distance and weight.", "Customer booking line"),
        s("automation", "Dispatch system", "Assign the nearest available driver", "Assign the nearest driver with capacity and the right vehicle.", "Dispatch system"),
        s("staff", "Driver", "Collect, deliver and capture proof", "Photo and signature at every delivery.", "Driver app"),
        s("automation", "Driver app", "Send proof of delivery to the customer", "Proof goes to the customer within 10 minutes.", "Driver app"),
      ] },
      { name: "Vehicle kept on the road", startsWhen: "A vehicle is due for service or licence renewal", doneWhen: "The service or renewal is done and logged", ownerRole: "Fleet manager", steps: [
        s("staff", "Fleet manager", "Schedule services 2 weeks ahead", "Book services two weeks before they fall due.", "Fleet maintenance log"),
        s("staff", "Fleet manager", "Swap in a standby vehicle", "No booking is missed because a vehicle is in for service."),
      ] },
    ],
    objectives: [
      { title: "On-time deliveries above 95%", metric: "custom", target: 95, why: "Reliability is the product." },
      { title: "Owner hours dispatching below 5 a week", metric: "founder_hours", target: 5, why: "Dispatch runs on rules." },
    ],
  },
  {
    key: "education-centre", version: 1, industry: "Private school or tutoring centre", name: "Education centre operating system",
    promise: "Enrolments, timetables, fees and parent communication run on a calendar the whole team can follow.",
    pieces: [
      { name: "Student management system", kind: "software", ownerRole: "Administrator", description: "Students, classes, attendance and fees." },
      { name: "Parent communication app", kind: "channel", ownerRole: "Administrator", description: "Notices and messages to parents." },
      { name: "Curriculum plans", kind: "document", ownerRole: "Head of academics", description: "What is taught when, per grade." },
      { name: "Teaching staff", kind: "team", ownerRole: "Principal", description: "Teachers and tutors." },
    ],
    flows: [
      { name: "Enquiry to enrolled student", startsWhen: "A parent enquires", doneWhen: "The student is enrolled and the first fee is paid", ownerRole: "Administrator", steps: [
        s("staff", "Administrator", "Answer the enquiry within 24 hours", "Answer with the fees sheet and an assessment booking link."),
        s("staff", "Teacher", "Assess the student's level", "Assess with the written placement test."),
        s("staff", "Administrator", "Enrol and invoice the first fee", "Enrol only with the signed enrolment form; invoice the first fee the same day.", "Student management system"),
        s("automation", "Parent communication app", "Welcome the family and share the timetable", "Send the welcome pack and timetable the day the first fee is paid.", "Parent communication app"),
      ] },
      { name: "Term delivery", startsWhen: "A term begins", doneWhen: "Reports are sent to parents", ownerRole: "Head of academics", steps: [
        s("staff", "Teacher", "Teach to the curriculum plan", "Each week's lessons follow the plan; changes go through the head of academics.", "Curriculum plans"),
        s("staff", "Teacher", "Record attendance daily", "Record attendance in the first 10 minutes of every class.", "Student management system"),
        s("staff", "Administrator", "Follow up unpaid fees after 7 days", "Remind on day 7 and day 14; the principal decides after day 30."),
        s("staff", "Teacher", "Write and send term reports", "Write reports against the curriculum outcomes; send within a week of term end."),
      ] },
    ],
    objectives: [
      { title: "Every enquiry answered within 24 hours", metric: "lead_response_time", target: 24, why: "Parents choose the school that answers." },
      { title: "Fees collected within 30 days", metric: "custom", target: 30, why: "Cash flow keeps the doors open." },
    ],
  },
  {
    key: "gym-fitness", version: 1, industry: "Gym or fitness studio", name: "Gym operating system",
    promise: "The door knows who is a paid-up member, messages answer themselves, and the owner stops walking the floor to check.",
    pieces: [
      { name: "Membership system", kind: "software", ownerRole: "Front desk", description: "Members, plans, class bookings and payment status." },
      { name: "Access control", kind: "software", ownerRole: "Front desk", description: "Card, QR code or fingerprint at the door, linked to the membership system, from an access-control supplier." },
      { name: "Debit order provider", kind: "provider", ownerRole: "Owner", description: "Monthly membership collections and failed-payment notices." },
      { name: "WhatsApp business line", kind: "channel", ownerRole: "Front desk", description: "Where members and enquiries message the gym." },
      { name: "House rules and FAQ", kind: "document", ownerRole: "Owner", description: "Hours, prices, classes, freezes and cancellations, written down once." },
      { name: "Front desk", kind: "role", ownerRole: "Owner", description: "Welcomes members and guests, handles exceptions." },
    ],
    flows: [
      { name: "Member at the door to checked in", startsWhen: "Someone arrives at the door", doneWhen: "Their entry is logged, or they are turned away with the reason", ownerRole: "Front desk", steps: [
        s("automation", "Access control", "Check the card, QR code or fingerprint against the membership", "Only active, paid-up members open the door; every entry is logged with the time.", "Access control"),
        s("automation", "Membership system", "Stop expired or unpaid members at the door", "An expired or unpaid member is not let in and is sent the payment link on the spot.", "Membership system"),
        s("staff", "Front desk", "Sign in guests and handle exceptions", "Guests sign in with ID and pay the day fee; any exception is logged with a reason.", "Front desk"),
        s("automation", "Membership system", "Send the morning attendance report", "Every morning: yesterday's entries, who trained, and anyone let in without a valid membership.", "Membership system"),
      ] },
      { name: "Enquiry to paying member", startsWhen: "Someone asks about joining", doneWhen: "They are a paying member with access switched on", ownerRole: "Front desk", steps: [
        s("automation", "WhatsApp business line", "Answer with prices and a free trial slot", "Every enquiry gets the price list and a trial booking link within five minutes.", "WhatsApp business line"),
        s("staff", "Front desk", "Welcome the trial and show them around", "Every trial is met by name and shown the floor, the classes and the plans."),
        s("staff", "Front desk", "Sign them up on a debit order", "Sign-up only with a signed debit order mandate, on a plan from the price list.", "Debit order provider"),
        s("automation", "Access control", "Switch on access when the first payment clears", "Access is switched on only once the first payment has cleared.", "Access control"),
      ] },
      { name: "Member message to answered", startsWhen: "A member sends a message", doneWhen: "The member has an answer, or the owner has the issue", ownerRole: "Front desk", steps: [
        s("automation", "WhatsApp business line", "Answer common questions from the FAQ", "Hours, prices, class times and freezes are answered from the house rules and FAQ; anything else goes to the front desk.", "WhatsApp business line"),
        s("staff", "Front desk", "Answer the rest within two hours", "Answer from the house rules within two hours during opening times.", "House rules and FAQ"),
        s("founder", "Owner", "Decide refunds and complaints", "Only refunds above the set amount and formal complaints go to the owner."),
      ] },
      { name: "Failed debit order to recovered", startsWhen: "A membership payment fails", doneWhen: "The member has paid, or the membership is paused", ownerRole: "Front desk", steps: [
        s("automation", "Debit order provider", "Flag the failed payment", "Every failed collection is flagged to the membership system the same day.", "Debit order provider"),
        s("automation", "Membership system", "Send the member a payment link", "Send the payment link on day 1 and day 4.", "Membership system"),
        s("automation", "Access control", "Pause access after seven days unpaid", "Access pauses on day 7 unpaid and reopens the moment they pay.", "Access control"),
      ] },
    ],
    objectives: [
      { title: "Owner hours checking the floor below 2 a week", metric: "founder_hours", target: 2, why: "The door and the morning report do the checking." },
      { title: "Every enquiry answered within an hour", metric: "lead_response_time", target: 1, why: "People join the gym that answers first." },
      { title: "Members kept month to month", metric: "client_retention", target: 90, why: "Retention is the gym's real growth." },
    ],
  },
];

export const blueprintByKey = (key: string): Blueprint | undefined => BLUEPRINTS.find((b) => b.key === key);

/** The same limits the board tables enforce, so a blueprint can always be laid down. */
export function checkBlueprint(b: Blueprint): string[] {
  const errors: string[] = [];
  const len = (v: string | undefined, max: number, what: string) => {
    if (v !== undefined && (v.trim().length === 0 || v.length > max)) errors.push(`${what} must be 1 to ${max} characters`);
  };
  if (!/^[a-z0-9-]{3,48}$/.test(b.key)) errors.push("key must be lowercase letters, digits and dashes");
  const pieceNames = new Set<string>();
  for (const p of b.pieces) {
    len(p.name, 120, `piece "${p.name}"`); len(p.description, 2000, `piece "${p.name}" description`); len(p.ownerRole, 120, `piece "${p.name}" owner`);
    if (pieceNames.has(p.name.toLowerCase())) errors.push(`piece "${p.name}" appears twice`);
    pieceNames.add(p.name.toLowerCase());
  }
  const flowNames = new Set<string>();
  for (const f of b.flows) {
    len(f.name, 120, `flow "${f.name}"`); len(f.startsWhen, 500, `flow "${f.name}" trigger`); len(f.doneWhen, 500, `flow "${f.name}" outcome`); len(f.ownerRole, 120, `flow "${f.name}" owner`);
    if (flowNames.has(f.name.toLowerCase())) errors.push(`flow "${f.name}" appears twice`);
    flowNames.add(f.name.toLowerCase());
    if (f.steps.length === 0 || f.steps.length > 200) errors.push(`flow "${f.name}" needs 1 to 200 steps`);
    for (const st of f.steps) {
      len(st.name, 200, `step "${st.name}"`); len(st.role, 120, `step "${st.name}" role`); len(st.rule, 2000, `step "${st.name}" rule`);
      if (!(PERFORMERS as readonly string[]).includes(st.performer)) errors.push(`step "${st.name}" has an unknown performer`);
      if (st.piece !== undefined && !pieceNames.has(st.piece.toLowerCase())) errors.push(`step "${st.name}" runs on a piece the blueprint doesn't have: "${st.piece}"`);
      if (st.performer === "automation" && !st.piece) errors.push(`automated step "${st.name}" must name the piece it runs on`);
      if (st.performer === "automation" && !st.rule) errors.push(`automated step "${st.name}" must have a written rule`);
    }
  }
  return errors;
}

/** How much of a blueprint no longer depends on the founder: steps done by someone else, with a written rule. */
export function blueprintCoverage(b: Blueprint) {
  const steps = b.flows.flatMap((f) => f.steps);
  const founder = steps.filter((x) => x.performer === "founder").length;
  const ruled = steps.filter((x) => x.performer !== "client" && x.rule).length;
  return { steps: steps.length, founderSteps: founder, stepsWithRules: ruled };
}

/** The payload the database's apply_blueprint takes: names resolved, every piece proposed. */
export function blueprintPayload(b: Blueprint) {
  return {
    key: b.key, version: b.version,
    pieces: b.pieces.map((p) => ({ name: p.name, kind: p.kind, owner_role: p.ownerRole ?? null, description: p.description })),
    flows: b.flows.map((f) => ({
      name: f.name, starts_when: f.startsWhen, done_when: f.doneWhen, owner_role: f.ownerRole,
      steps: f.steps.map((st, i) => ({ position: i + 1, name: st.name, performer: st.performer, performer_role: st.role ?? null, piece: st.piece ?? null, decision_rule: st.rule ?? null })),
    })),
  };
}
