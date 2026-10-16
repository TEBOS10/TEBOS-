import type { Block } from "@/lib/pdf/render";

export interface ContractInput {
  athleteFullName: string;
  athleteIdPassport: string;
  athleteDob: string;
  athleteAddress: string;
  athleteEmail: string;
  athletePhone: string;
  currentClub: string;
  packageTier: "foundation" | "growth" | "custom";
  monthlyFee: number;
  initialTermMonths: number;
  commencementDate: string;
}

// BAME's real banking details (FNB Account Confirmation Letter, 2026-09-16).
// Filled on every generated contract — nothing left blank for a client to see.
const BAME_BANK = {
  bank: "First National Bank (FNB), a division of FirstRand Bank Limited",
  accountName: "BAME MARKETING AGENCY (PTY) LTD",
  accountType: "Gold Business Account",
  accountNumber: "63228087713",
  branchCode: "250655",
  swiftCode: "FIRNZAJJ",
};

const BAME = {
  repName: "Lebogang Bame",
  position: "Chief Executive Officer",
  regNo: "2025/732062/07",
  address: "192 Sugarbird Crescent, Kyalami Glen",
  email: "Bame.marketingagency@gmail.com",
  telephone: "079 628 3066",
};

const PACKAGE_LABELS: Record<ContractInput["packageTier"], string> = {
  foundation: "Foundation Athlete Branding Package",
  growth: "Growth Athlete Branding Package",
  custom: "Custom Athlete Branding Package",
};

function formatZAR(amount: number): string {
  return `R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function scheduleARows(input: ContractInput): string[][] {
  const header = ["Deliverable", "Included", "Limits and notes"];
  if (input.packageTier === "foundation") {
    return [
      header,
      ["Personal branding and lifestyle Production Session", "One (1) session per Service Period, up to 3 hours at one (1) agreed location.", "Scheduled under clause 4.3. Extra time, locations, outfit changes or additional sessions are Additional Services."],
      ["Edited photographs", "15 professionally edited photographs from the session, delivered as digital files.", "BAME selects and post-produces the photographs."],
      ["Brand positioning and monthly content planning", "Brand positioning in the first Service Period; a content plan for each Service Period.", "Planning only. BAME does not manage or publish the Athlete's accounts under this package."],
      ["Digital portfolio", "A curated photo gallery built from the Final Deliverables.", "Delivered as a private link or digital files by the end of the second Service Period. Does not include a video reel."],
      ["Sponsorship positioning, prospect identification and outreach", "Ongoing during the Term.", "Reasonable commercial efforts; no guaranteed number of approaches, meetings or deals; subject to clauses 6 and 9."],
    ];
  }
  if (input.packageTier === "growth") {
    return [
      header,
      ["Everything in the Foundation Athlete Branding Package", "All Foundation deliverables, as above.", "See Foundation rows for session, photograph and portfolio detail."],
      ["Expanded content and management scope", "Additional content direction and a wider monthly scope than Foundation.", "Exact monthly scope (sessions, assets and any social distribution support) is confirmed in writing with the Athlete before the first Production Session, and recorded as an addendum to this Schedule A."],
      ["Commercial opportunity development", "More active sponsorship prospecting and outreach than Foundation.", "Reasonable commercial efforts; no guaranteed number of approaches, meetings or deals; subject to clauses 6 and 9."],
      ["Monthly activity reporting", "A written monthly summary of content, outreach and opportunity activity.", "Delivered within five (5) Business Days after the end of each Service Period."],
    ];
  }
  return [
    header,
    ["Bespoke strategy and delivery scope", "A tailored scope agreed in writing before the first Production Session.", "Because Custom is built around the Athlete's specific circumstances, the exact sessions, deliverables and timelines are set out in a written scope annexure under clause 4.11, which forms part of this Schedule A once signed."],
    ["Flexible retainer structure", "A retainer scoped to the agreed deliverables.", "The Fee in the Key Terms table reflects the agreed retainer for this Athlete."],
    ["Commercial and production alignment", "Coordinated production, branding and commercial opportunity development.", "Subject to clauses 6 and 9; no guaranteed outcomes."],
  ];
}

export function buildContractBlocks(input: ContractInput): Block[] {
  const packageLabel = PACKAGE_LABELS[input.packageTier];
  const initialValue = input.monthlyFee * input.initialTermMonths;

  const blocks: Block[] = [
    { type: "title", text: "BAME SPORTS MANAGEMENT" },
    { type: "subtitle", text: "Broadcasting Access & Media Experience" },
    { type: "spacer", height: 10 },
    { type: "h2", text: "ATHLETE PERSONAL BRANDING & MARKETING SERVICES AGREEMENT" },
    { type: "p", text: `${packageLabel} — ${input.athleteFullName}` },
    { type: "p", text: `Commencement Date: ${input.commencementDate}`, bold: true },
    { type: "spacer", height: 8 },
    {
      type: "table",
      widths: [260, 260],
      rows: [
        ["SERVICE PROVIDER", "ATHLETE"],
        ["BAME Sports Management", input.athleteFullName],
        [`Represented by: ${BAME.repName}`, `ID / Passport No.: ${input.athleteIdPassport || "____________________"}`],
        [`Position: ${BAME.position}`, `Date of birth: ${input.athleteDob || "____________________"}`],
        [`Registration No.: ${BAME.regNo}`, `Address: ${input.athleteAddress || "____________________"}`],
        [`Address: ${BAME.address}`, `Email: ${input.athleteEmail || "____________________"}`],
        [`Email: ${BAME.email}`, `Telephone: ${input.athletePhone || "____________________"}`],
        [`Telephone: ${BAME.telephone}`, `Current club: ${input.currentClub || "____________________"}`],
      ],
    },
    { type: "spacer", height: 10 },
    { type: "h2", text: "KEY TERMS AT A GLANCE" },
    {
      type: "table",
      widths: [110, 350, 60],
      rows: [
        ["Item", "Agreed term", "Clause"],
        ["Package", `${packageLabel} (Schedule A)`, "4, Sch. A"],
        ["Fees", `${formatZAR(input.monthlyFee)} per Service Period, paid monthly in advance`, "5"],
        ["Initial Term", `${input.initialTermMonths} month(s); initial contract value ${formatZAR(initialValue)}; no automatic renewal`, "3, 5"],
        ["Commission", "15% of Net Commercial Revenue from Qualifying Sponsorship Deals that BAME sources or materially contributes to", "6"],
        ["No guarantees", "No guarantee of sponsorships, media coverage or sporting or commercial outcomes", "12"],
        ["Cancellation", "Athlete: 20 Business Days' notice. Material breach: remedy periods apply", "13"],
      ],
    },
    { type: "p", text: "This table summarises the Agreement for convenience. If it differs from the clauses, the clauses prevail. Collectively \"the parties\" and individually \"a party\"." },

    { type: "pagebreak" },
    { type: "h2", text: "1. Definitions and Interpretation" },
    { type: "p", text: "1.1 In this Agreement, unless the context indicates otherwise:" },
    { type: "p", text: "\"Agreement\" means this agreement, including its Schedules, as amended under clause 17." },
    { type: "p", text: `"Athlete" means ${input.athleteFullName}, the professional athlete identified in the parties box.` },
    { type: "p", text: "\"BAME\" means the service provider identified in the parties box." },
    { type: "p", text: "\"Brand\" means any company, organisation or person that sponsors, endorses or enters into a commercial partnership with the Athlete." },
    { type: "p", text: "\"Business Day\" means any day other than a Saturday, Sunday or public holiday in the Republic of South Africa." },
    { type: "p", text: "\"Commencement Date\" means the date stated as such on the first page or, if none is stated, the Signature Date." },
    { type: "p", text: "\"Commission\" means the commission payable to BAME under clause 6." },
    { type: "p", text: "\"Commission Cap Period\" means for a Qualifying Sponsorship Deal, the period of 24 months from the date on which that deal is concluded." },
    { type: "p", text: "\"Consumer Protection Act\" means the Consumer Protection Act 68 of 2008 and its regulations." },
    { type: "p", text: "\"Copyright Act\" means the Copyright Act 98 of 1978." },
    { type: "p", text: "\"Deliverables\" means the deliverables listed in Schedule A for each Service Period." },
    { type: "p", text: "\"Existing Agent\" means the agent identified in Schedule C and any person who replaces or succeeds that agent." },
    { type: "p", text: "\"Existing Agent Agreement\" means any agreement between the Athlete and the Existing Agent." },
    { type: "p", text: "\"Existing Deal\" means any sponsorship, endorsement or commercial agreement that the Athlete concluded, or substantially agreed in writing, before the Commencement Date, including those listed in Schedule C." },
    { type: "p", text: `"Fees" means the fee of ${formatZAR(input.monthlyFee)} per Service Period described in clause 5.` },
    { type: "p", text: "\"Final Deliverables\" means the edited photographs, videos and portfolio materials delivered to the Athlete as Deliverables." },
    { type: "p", text: `"Initial Term" means ${input.initialTermMonths} month(s) from the Commencement Date.` },
    { type: "p", text: "\"Opportunity Register\" means the written record of Registered Opportunities kept under clause 6.5." },
    { type: "p", text: "\"POPIA\" means the Protection of Personal Information Act 4 of 2013." },
    { type: "p", text: "\"Production Session\" means the personal branding and lifestyle production session described in Schedule A." },
    { type: "p", text: "\"Raw Materials\" means all unedited and unselected photographs, footage, audio, project files, drafts and working files created in providing the Services." },
    { type: "p", text: "\"Registered Opportunity\" means a Brand recorded in the Opportunity Register under clause 6.5." },
    { type: "p", text: "\"Related Party\" means in relation to any person, a company or entity that controls, is controlled by or is under common control with that person, and any family member, nominee or intermediary acting for that person; in relation to a Brand, also its group companies and its marketing, media and advertising agencies." },
    { type: "p", text: "\"Services\" means the services described in clause 4 and Schedule A." },
    { type: "p", text: "\"Service Period\" means each successive period of one month, the first starting on the Commencement Date." },
    { type: "p", text: "\"Signature Date\" means the date on which the last party signs this Agreement." },
    { type: "p", text: "\"Tail Period\" means the period of six (6) months after this Agreement ends for any reason." },
    { type: "p", text: "\"Term\" means the Initial Term and any renewal agreed under clause 3.2." },
    { type: "p", text: "\"Third-Party Material\" means material owned or controlled by someone other than a party, including club crests and kits, league or broadcaster footage, music, sponsors' marks and venue-protected content." },
    { type: "p", text: "1.2 Terms defined elsewhere in this Agreement have the meanings given to them there: \"Net Commercial Revenue\" (clause 6.6), \"Qualifying Sponsorship Deal\" (clause 6.2) and \"Excluded Arrangement\" (clause 6.4)." },
    { type: "p", text: "1.3 Headings are for convenience only. The Schedules form part of this Agreement. If a Schedule conflicts with a clause, the clause prevails. A reference to legislation is to that legislation as amended or replaced from time to time." },
    { type: "p", text: "1.4 Periods of days are calculated by excluding the first day and including the last day. Where the last day is not a Business Day, the period ends on the next Business Day. A notice or consent given by email or messaging application is \"in writing\" for purposes of this Agreement." },

    { type: "h2", text: "2. Appointment and Status" },
    { type: "p", text: `2.1 BAME is appointed to provide the Athlete with personal branding, content production, portfolio development, marketing, public relations support and commercial opportunity development, on the terms of the ${packageLabel} set out in Schedule A.` },
    { type: "p", text: "2.2 BAME acts as an independent contractor. This Agreement does not create an employment relationship, partnership or joint venture, and does not make BAME the Athlete's agent with authority to bind him or her." },
    { type: "p", text: "2.3 BAME is not appointed as the Athlete's sporting agent or intermediary. Clause 7 sets the boundaries." },
    { type: "p", text: "2.4 BAME may use its own employees and independent contractors to provide the Services. BAME remains responsible to the Athlete for their work and must ensure that they are bound by confidentiality and intellectual property terms consistent with this Agreement." },

    { type: "h2", text: "3. Commencement and Term" },
    { type: "p", text: "3.1 This Agreement is binding from the Signature Date. The Services start on the Commencement Date and continue for the Initial Term, unless this Agreement ends earlier under clause 13." },
    { type: "p", text: "3.2 This Agreement does not renew automatically. It ends on the last day of the Initial Term unless the parties agree in writing to renew it. BAME will send the Athlete a written renewal proposal at least 20 Business Days before the Initial Term ends. The Fees for any renewal term must be agreed in writing." },
    { type: "p", text: "3.3 The fixed Initial Term does not remove or limit any right the Athlete has under the Consumer Protection Act or other law to cancel this Agreement, as reflected in clause 13." },

    { type: "h2", text: "4. Services and Deliverables" },
    { type: "p", text: "4.1 BAME will provide the Services and Deliverables described in Schedule A in each Service Period. The Fees cover only the items listed in Schedule A." },
    { type: "p", text: "4.2 BAME will provide the Services with reasonable skill, care and diligence, in a professional manner and within the timelines in this clause, subject to the Athlete's cooperation under clause 8." },
    { type: "p", text: "4.3 Scheduling. The Athlete will give BAME at least three (3) available dates for each Production Session, at least five (5) Business Days ahead. BAME will confirm one date in writing. BAME will use reasonable efforts to hold the Production Session within ten (10) Business Days after the Fees for that Service Period are paid, subject to the Athlete's availability." },
    { type: "p", text: "4.4 Delivery. BAME will deliver the edited photographs within ten (10) Business Days after the Production Session. BAME will deliver the digital portfolio by the date in Schedule A. Delivery timelines are extended by any delay caused by the Athlete, including late approvals, unavailability or late payment." },
    { type: "p", text: "4.5 Revisions and approval. The Athlete may request one (1) consolidated round of reasonable revisions to each Final Deliverable by giving written feedback within three (3) Business Days after delivery. BAME will make the revisions within five (5) Business Days. Further revision rounds are Additional Services. If the Athlete gives no feedback within the period, BAME will send one written reminder, and the Final Deliverable is treated as accepted two (2) Business Days after the reminder. This deemed acceptance applies to Deliverables only, never to publication or sponsorship approvals." },
    { type: "p", text: "4.6 Rescheduling. The Athlete may reschedule a Production Session once in a Service Period without charge by giving at least 48 hours' notice. A Production Session that the Athlete cancels, reschedules a second time, or does not attend on less than 48 hours' notice, counts as the Production Session for that Service Period, unless the reason is a Football Commitment (a match, training, club-directed travel or event, injury or illness, or similar circumstance outside the Athlete's control)." },
    { type: "p", text: "4.7 BAME circumstances. If BAME cancels or cannot hold a Production Session, BAME will reschedule it without charge. If BAME cannot deliver a Service Period's Production Session at all within the Term, BAME will refund the portion of the Fees for that Service Period that relates to the undelivered Deliverables, calculated fairly by BAME and explained in writing." },
    { type: "p", text: "4.8 Make-up window. A Production Session that has not taken place by the end of the Initial Term because of the Athlete's unavailability may be held within 30 days after the Initial Term ends. After that, it lapses without refund." },
    { type: "p", text: "4.9 Sponsorship positioning and outreach. BAME will use reasonable commercial efforts to position the Athlete, identify relevant Brands and approach them, consistent with Schedule B and clause 9. BAME does not guarantee any number of approaches, meetings, offers or deals." },
    { type: "p", text: "4.10 Exclusions. The Services do not include the items listed as exclusions in Schedule A, including full social media management, guaranteed posting schedules, guaranteed matchday coverage, paid advertising, external production expenses and sporting agency services, unless separately agreed in writing." },
    { type: "p", text: "4.11 Additional Services and scope changes. If the Athlete asks for something outside Schedule A (\"Additional Services\"), BAME may decline or may provide a written quote showing the price, deliverables and timing. Additional Services are provided only after the Athlete approves the quote in writing." },

    { type: "h2", text: "5. Fees, Invoicing and Payment" },
    { type: "p", text: `5.1 The Athlete will pay BAME the Fees of ${formatZAR(input.monthlyFee)} per Service Period, in advance. For the Initial Term of ${input.initialTermMonths} Service Period(s), the total initial contract value is ${formatZAR(initialValue)}.` },
    { type: "p", text: "5.2 BAME will send an invoice at least five (5) Business Days before each payment is due. The first payment is due on or before the Commencement Date, and each later payment is due on the same day of each following Service Period." },
    { type: "p", text: "5.3 VAT: BAME is not currently VAT-registered. No VAT is added to the Fees. BAME will notify the Athlete in writing and update invoicing if this changes." },
    { type: "p", text: "5.4 Payment is made by electronic funds transfer to the bank account in Schedule F, using the invoice number as the payment reference. Payment is made when the funds clear in BAME's account." },
    { type: "p", text: "5.5 Late payment. If a payment is not received by its due date, BAME may send the Athlete a written notice describing the unpaid amount (a \"Payment Notice\"). If the amount is still unpaid five (5) Business Days after the Payment Notice, BAME may suspend the Services until the amount is paid. BAME's right to cancel for non-payment is dealt with in clause 13.2." },
    { type: "p", text: "5.6 Interest. Unpaid amounts that remain overdue after the Payment Notice bear interest at the rate prescribed from time to time under the Prescribed Rate of Interest Act 55 of 1975, from the due date until payment." },
    { type: "p", text: "5.7 External production costs. Venue hire, travel, accommodation, stylists, models, studio or equipment hire, licences and similar third-party costs are not included in the Fees. BAME will incur such a cost only after the Athlete approves a written estimate. Approved costs are passed on at cost, without mark-up." },
    { type: "p", text: "5.8 Prepaid Fees. Fees paid in advance are applied to the Services for the Service Period to which they relate. They are refundable only as set out in clauses 4.7 and 13. The Fees will not change during the Initial Term." },

    { type: "pagebreak" },
    { type: "h2", text: "6. Sponsorship Commission" },
    { type: "p", text: "6.1 BAME is entitled to Commission of fifteen percent (15%) of Net Commercial Revenue from each Qualifying Sponsorship Deal. Commission is in addition to the Fees." },
    { type: "p", text: "6.2 A \"Qualifying Sponsorship Deal\" is a written agreement between the Athlete (or an entity through which he or she provides commercial services) and a Brand for a sponsorship, endorsement, ambassadorship, brand partnership, paid content or paid appearance, where: (a) it is concluded during the Term or the Tail Period; (b) BAME directly sourced it or materially contributed to securing it; (c) the Brand was a Registered Opportunity when the deal was concluded, or clause 6.11 applies; (d) it is not an Excluded Arrangement; and (e) the Athlete approved it in writing under clause 9.1." },
    { type: "p", text: "6.3 BAME \"directly sourced\" a deal if BAME first introduced the Brand or the opportunity to the Athlete. BAME \"materially contributed\" if BAME's work was a significant cause of the Brand's decision to contract. BAME must be able to show its contribution with reasonable written evidence." },
    { type: "p", text: "6.4 \"Excluded Arrangements\" (no Commission payable): (a) Existing Deals and their renewals, unless BAME materially contributed to the renewal; (b) opportunities the Athlete, Existing Agent or club first originated; (c) playing, employment or club contracts, salary and related payments; (d) payments from a league, federation, association or government body, and charitable donations; (e) gifted products or in-kind benefits, unless a rand value is agreed in writing; and (f) revenue received after the Commission Cap Period." },
    { type: "p", text: "6.5 Opportunity Register. BAME will record each Brand it intends to approach by written notice to the Athlete. A Brand becomes a Registered Opportunity when the Athlete acknowledges the notice, or three (3) Business Days after the notice if the Athlete has not objected. A registration lasts twelve (12) months and is extended by substantive communication within that period." },
    { type: "p", text: "6.6 \"Net Commercial Revenue\" means all money (and the agreed rand value of any in-kind benefit) actually received by or for the Athlete under a Qualifying Sponsorship Deal, excluding VAT, less refunds/chargebacks and documented third-party costs the Brand required the Athlete to bear." },
    { type: "p", text: "6.7 Commission is payable on each amount received. The Athlete will notify BAME within five (5) Business Days after receiving any payment and will pay the Commission within seven (7) Business Days after receiving it." },
    { type: "p", text: "6.8 Renewals and repeat deals. A renewal, extension, repeat campaign or follow-on agreement with the Brand, concluded during the Term or the Tail Period, is itself a Qualifying Sponsorship Deal." },
    { type: "p", text: "6.9 Evidence and transparency. Within five (5) Business Days after concluding a Qualifying Sponsorship Deal, the Athlete will give BAME a copy of the agreement and proof of payment. BAME will give the Athlete a written statement showing how each Commission amount is calculated." },
    { type: "p", text: "6.10 Origination disputes. If the parties disagree on whether a deal is a Qualifying Sponsorship Deal or who originated it, the dispute process in clause 15 applies. BAME carries the burden of showing registration and contribution; the Athlete carries the burden of showing independent origination or an Excluded Arrangement." },
    { type: "p", text: "6.11 Protection against circumvention. The Athlete will not deliberately avoid Commission by concluding a deal with a Registered Opportunity directly, through a Related Party, or by delaying conclusion until after the Tail Period when substantive negotiations had already taken place. A deal concluded in breach of this clause is treated as a Qualifying Sponsorship Deal." },
    { type: "p", text: "6.12 Tail Period. Commission remains payable on a Qualifying Sponsorship Deal concluded during the Tail Period for a Brand that was a Registered Opportunity before this Agreement ended." },
    { type: "p", text: "6.13 No obligation to accept. The Athlete is never obliged to accept any offer and owes no Commission or penalty for declining one." },
    { type: "p", text: "6.14 Commission is for commercial development services only, not for sporting agency services. Commission is exclusive of VAT, which is added if BAME is VAT-registered. Commission earned before this Agreement ends remains payable after it ends." },

    { type: "h2", text: "7. Existing Agent and Representation Boundaries" },
    { type: "p", text: "7.1 BAME is not the Athlete's sporting agent or intermediary. BAME will not negotiate, conclude or advise on the Athlete's playing, transfer or club employment contracts, and will not carry out any activity that sporting regulations reserve to licensed agents." },
    { type: "p", text: "7.2 The Athlete confirms any existing representation as described in Schedule C, and warrants that appointing BAME does not breach any Existing Agent Agreement." },
    { type: "p", text: "7.3 BAME will respect the Existing Agent's role and, if the Athlete agrees, will keep the Existing Agent informed of commercial opportunities." },
    { type: "p", text: "7.4 No overlapping commission. Unless BAME agrees otherwise in writing, BAME's Commission is not reduced by any commission payable to the Existing Agent." },
    { type: "p", text: "7.5 Existing Agent acknowledgement. The Athlete will ask the Existing Agent to sign the acknowledgement in Schedule D within ten (10) Business Days after the Signature Date." },
    { type: "p", text: "7.6 BAME has no authority to sign agreements for the Athlete, accept offers, agree prices or exclusivity, or make binding commitments on his or her behalf. The Athlete signs every deal." },

    { type: "h2", text: "8. Athlete's Responsibilities" },
    { type: "p", text: "8.1 The Athlete will: (a) be available for scheduled sessions and respond to BAME's reasonable requests within the periods in this Agreement; (b) give BAME accurate information, including about club, contract restrictions, sponsors, exclusivities and commitments; (c) bring appropriate wardrobe and attend sessions on time; and (d) comply with obligations to the club, league and Existing Agent." },
    { type: "p", text: "8.2 The Athlete will tell BAME about any inbound sponsorship or endorsement enquiry within five (5) Business Days, so that BAME can coordinate." },
    { type: "p", text: "8.3 The Athlete will pay the Fees, approved costs and Commission as set out in this Agreement." },

    { type: "pagebreak" },
    { type: "h2", text: "9. Approvals and Permissions" },
    { type: "p", text: "9.1 Sponsorship approval. BAME will present the material terms of each opportunity to the Athlete before he or she accepts it. No deal binds the Athlete unless he or she approves it in writing and signs it." },
    { type: "p", text: "9.2 Publication approval. BAME will not publish the Athlete's content, or speak publicly or to Brands about him or her in a way that commits him or her, without prior written approval." },
    { type: "p", text: "9.3 Restricted categories. BAME will not approach, and the Athlete is not required to accept, any Brand in the categories listed as restricted in Schedule B (alcohol, gambling, tobacco and vaping)." },
    { type: "p", text: "9.4 Third-Party Material. The Athlete is responsible for telling BAME what club, league or sponsor permissions are needed for content in club kit, with club crests or at club venues." },
    { type: "p", text: "9.5 Venues. Where a venue requires a permit or fee, the permit is arranged by the Athlete or by BAME with the Athlete's approval, and the cost is dealt with under clause 5.7." },

    { type: "h2", text: "10. Image Rights and Intellectual Property" },
    { type: "p", text: "10.1 The Athlete's name, image, likeness, voice, signature and club or career-related identity belong to the Athlete. BAME receives no rights in them except the limited rights to use them to provide the Services." },
    { type: "p", text: "10.2 Copyright. The parties agree to exclude section 21(1)(c) of the Copyright Act. As between the parties, BAME owns the copyright in the Final Deliverables and the Raw Materials." },
    { type: "p", text: "10.3 Licence to the Athlete. Once the Fees for the relevant Service Period have been paid, BAME grants the Athlete a non-exclusive, perpetual, worldwide, royalty-free licence to use the Final Deliverables for personal brand, social media, media and press use, and to sublicense them to a Brand for an approved campaign." },
    { type: "p", text: "10.4 Raw Materials. BAME owns the Raw Materials and will keep the Final Deliverables for twelve (12) months after the Term." },
    { type: "p", text: "10.5 BAME's portfolio. BAME may use the Athlete's name, image or Final Deliverables in its own portfolio only with prior written consent for each use." },
    { type: "p", text: "10.6 BAME's methods. BAME keeps all rights in its branding methods, templates, presets, processes and proprietary materials." },
    { type: "p", text: "10.7 Third-Party Material and sponsors. BAME grants no rights in Third-Party Material, and does not grant rights it does not own or control." },
    { type: "p", text: "10.8 The licences in this clause continue after this Agreement ends for Final Deliverables for which the Fees were paid." },

    { type: "h2", text: "11. Confidentiality and Personal Information" },
    { type: "p", text: "11.1 Each party will keep the other's confidential information confidential and use it only to perform or enforce this Agreement. This clause continues after this Agreement ends." },
    { type: "p", text: "11.2 POPIA. BAME will process the Athlete's personal information lawfully, only for providing the Services, and in line with POPIA." },
    { type: "p", text: "11.3 BAME will apply reasonable security safeguards and will notify the Athlete and the Information Regulator of any security compromise of his or her personal information, as POPIA requires." },
    { type: "p", text: "11.4 BAME will keep personal information only as long as needed, and the Athlete may ask to see, correct or delete his or her personal information as POPIA allows. BAME's information officer's contact details are in Schedule F." },
    { type: "p", text: "11.5 BAME will not process the Athlete's special personal information except to the limited extent the Athlete gives it, and only to schedule the Services." },
    { type: "p", text: "11.6 Electronic outreach to Brand contacts will comply with POPIA's direct marketing rules." },

    { type: "h2", text: "12. Warranties, No Guarantees and Limitation of Liability" },
    { type: "p", text: "12.1 BAME warrants that it will provide the Services with reasonable skill and care, and that, to its knowledge, the Deliverables will not infringe another person's intellectual property rights." },
    { type: "p", text: "12.2 The Athlete warrants that the information given to BAME is accurate, and that appointing BAME does not breach club, sponsor or Existing Agent obligations." },
    { type: "p", text: "12.3 No guarantees. BAME does not guarantee sponsorships, endorsements, income, media coverage, follower growth, brand value or any sporting outcome." },
    { type: "p", text: "12.4 Nothing in this Agreement excludes or limits liability for fraud, gross negligence or wilful misconduct, or any liability that cannot lawfully be limited, including rights under the Consumer Protection Act." },
    { type: "p", text: "12.5 Neither party is liable to the other for indirect or consequential loss, and BAME's total liability for all claims arising from the Services is limited to the Fees paid in the three (3) months before the claim arose." },
    { type: "p", text: "12.6 The Athlete will compensate BAME for third-party claims arising directly from material or instructions the Athlete supplied. BAME will compensate the Athlete for third-party claims arising directly from BAME's breach of clause 10.2." },

    { type: "pagebreak" },
    { type: "h2", text: "13. Cancellation and Termination" },
    { type: "p", text: "13.1 Cancellation by the Athlete. The Athlete may cancel this Agreement at any time by giving BAME twenty (20) Business Days' written notice. Fees already paid for any period after the cancellation date are refunded in proportion, except where the Production Session and Deliverables for that Service Period have already been performed or delivered." },
    { type: "p", text: "13.2 Cancellation by BAME for the Athlete's breach. If the Athlete commits a material breach (including failure to pay), BAME may give written notice. If not fixed within twenty (20) Business Days, BAME may cancel this Agreement." },
    { type: "p", text: "13.3 Cancellation by the Athlete for BAME's breach. If BAME commits a material breach, the Athlete may give written notice. If not fixed within ten (10) Business Days, the Athlete may cancel with immediate effect, and BAME will refund Fees paid for Services not yet performed." },
    { type: "p", text: "13.4 Either party may cancel by written notice if the other is placed in liquidation or sequestration, or is unable to pay its debts." },
    { type: "p", text: "13.5 Consequences. When this Agreement ends: rights accrued before it ended remain; BAME will deliver paid-for Final Deliverables and stop outreach to Brands; Commission earned before the end date remains payable; the licences in clause 10, confidentiality and POPIA obligations continue; and each party will return the other's property on request." },
    { type: "p", text: "13.6 Nothing in this clause limits any right either party has under the Consumer Protection Act or other law." },

    { type: "h2", text: "14. Force Majeure" },
    { type: "p", text: "14.1 Neither party is liable for delay or failure caused by circumstances beyond its reasonable control, if it tells the other party as soon as reasonably possible and takes reasonable steps to resume performance." },
    { type: "p", text: "14.2 If such circumstances prevent the Services for more than 30 days, either party may cancel this Agreement on five (5) Business Days' written notice." },

    { type: "h2", text: "15. Dispute Resolution" },
    { type: "p", text: "15.1 A party with a dispute will give the other written notice describing it. The parties will meet within ten (10) Business Days to try to resolve it in good faith." },
    { type: "p", text: "15.2 If not resolved within a further ten (10) Business Days, either party may propose mediation. The parties will share the mediator's costs equally unless they agree otherwise." },
    { type: "p", text: "15.3 If mediation does not resolve the dispute, or either party declines it, either party may approach a court with jurisdiction in the Republic of South Africa." },
    { type: "p", text: "15.4 Either party may seek urgent interim relief from a court at any time. The parties will keep performing their undisputed obligations during a dispute." },
    { type: "p", text: "15.5 Nothing in this clause prevents the Athlete from approaching the National Consumer Commission, the Consumer Tribunal, an ombud or any other body with a statutory right to hear a complaint." },

    { type: "h2", text: "16. Notices and Domicilium" },
    { type: "p", text: "16.1 Each party chooses as its address for notices and legal process the physical and email addresses in the parties box and Schedule F." },
    { type: "p", text: "16.2 A notice sent by email is received on the day it is sent, if sent before 17:00 on a Business Day, and otherwise on the next Business Day." },

    { type: "h2", text: "17. General" },
    { type: "p", text: "17.1 Entire agreement. This Agreement is the whole agreement between the parties on its subject matter and replaces all earlier discussions and proposals." },
    { type: "p", text: "17.2 Amendments. No amendment, cancellation or waiver of any term is valid unless in writing and signed by both parties." },
    { type: "p", text: "17.3 Cession and subcontracting. Neither party may cede or assign its rights or delegate its obligations without the other's written consent, except that BAME may use subcontractors and may cede its right to payment." },
    { type: "p", text: "17.4 Severability. If any term is found unenforceable, the rest of this Agreement continues." },
    { type: "p", text: "17.5 Governing law. This Agreement is governed by the law of the Republic of South Africa." },
    { type: "p", text: "17.6 Electronic signature and counterparts. This Agreement may be signed electronically and in counterparts." },
    { type: "p", text: "17.7 Consumer acknowledgement. The Athlete confirms that BAME drew his or her attention to clauses 5.5, 6, 10, 12 and 13, that he or she has read and understood them in plain language, and has had the opportunity to obtain independent legal advice before signing." },

    { type: "pagebreak" },
    { type: "h2", text: "SIGNATURES" },
    { type: "p", text: "By signing, each party confirms that it has read, understood and agrees to be bound by this Agreement, including the Schedules." },
    { type: "spacer", height: 10 },
    {
      type: "table",
      widths: [260, 260],
      rows: [
        ["BAME Sports Management", "Athlete"],
        [`Name: ${BAME.repName}`, `Name: ${input.athleteFullName}`],
        [`Position: ${BAME.position} (duly authorised)`, `ID / Passport: ${input.athleteIdPassport || "______________________"}`],
        ["Signature: ______________________", "Signature: ______________________"],
        ["Date: ______________________", "Date: ______________________"],
        ["Place: ______________________", "Place: ______________________"],
      ],
    },

    { type: "pagebreak" },
    { type: "h2", text: `SCHEDULE A — ${packageLabel.toUpperCase()}` },
    { type: "p", text: "Included in each Service Period unless stated. The Fees cover only the items listed below and in the Agreement." },
    { type: "table", widths: [150, 180, 200], rows: scheduleARows(input) },
    { type: "spacer", height: 6 },
    { type: "p", text: "Exclusions (not included unless separately agreed in writing):", bold: true },
    { type: "bullet", text: "Full social media management, community management and account administration." },
    { type: "bullet", text: "Guaranteed weekly or other posting schedules; match-day coverage or attendance at matches." },
    { type: "bullet", text: "Personal-brand videos, reels, short films, video editing or other video deliverables." },
    { type: "bullet", text: "Paid advertising, ad spend and boosted content." },
    { type: "bullet", text: "External production expenses (venues, travel, accommodation, stylists, models, studio or equipment hire, licences), dealt with under clause 5.7." },
    { type: "bullet", text: "Sporting agency services of any kind, including contract or transfer negotiations." },
    { type: "bullet", text: "Legal, tax or financial advice, and negotiating or signing contracts on the Athlete's behalf." },
    { type: "bullet", text: "Raw Materials, additional revision rounds, additional sessions and anything not listed above." },

    { type: "spacer", height: 14 },
    { type: "h2", text: "SCHEDULE B — BRAND PREFERENCES AND RESTRICTIONS" },
    {
      type: "table",
      widths: [160, 370],
      rows: [
        ["Category", "Position"],
        ["Preferred areas", "Football, fashion, travel and music"],
        ["Restricted (BAME will not approach; the Athlete is not required to accept)", "Alcohol, gambling, tobacco and vaping brands, products and promotions"],
        ["Updates", "The Athlete may update this Schedule by written notice (clause 9.3)"],
      ],
    },

    { type: "spacer", height: 14 },
    { type: "h2", text: "SCHEDULE C — EXISTING AGENT, EXISTING DEALS AND CLUB RESTRICTIONS" },
    { type: "p", text: "To be completed by the Athlete before signature." },
    {
      type: "table",
      widths: [160, 370],
      rows: [
        ["Item", "Details"],
        ["Existing Agent", "Full name and agency: ______________________; contact: ______________________"],
        ["Scope of representation", "______________________"],
        ["Exclusivity and commercial commission under the Existing Agent Agreement", "______________________"],
        ["Existing Deals", "[None] / [List Brand, term, value, exclusivity]: ______________________"],
        ["Club", `${input.currentClub || "______________________"} [confirm]. Club or league restrictions on commercial use of image, kit, crest or sponsor categories: ______________________`],
      ],
    },

    { type: "pagebreak" },
    { type: "h2", text: "SCHEDULE D — EXISTING AGENT ACKNOWLEDGEMENT" },
    { type: "bullet", text: "I, the Existing Agent, confirm that I have been told of the Athlete Personal Branding & Marketing Services Agreement between BAME Sports Management and the Athlete named above." },
    { type: "bullet", text: "I understand that BAME is not a sporting agent and will not act in my role in sporting matters, and that BAME has no authority to bind the Athlete." },
    { type: "bullet", text: "I understand that BAME is entitled to Commission of 15% on Qualifying Sponsorship Deals under clause 6, separate from any commission I may be entitled to." },
    { type: "bullet", text: "I will tell the Athlete and BAME before a Qualifying Sponsorship Deal is signed if I claim commission on it, so that double commission can be avoided." },
    { type: "bullet", text: "I will not deliberately interfere with BAME's registered opportunities in a way that avoids the Commission." },
    { type: "bullet", text: "This acknowledgement does not make me a party to the Agreement." },
    { type: "spacer", height: 10 },
    { type: "p", text: "Existing Agent" },
    { type: "p", text: "Name: ______________________________" },
    { type: "p", text: "Signature: ______________________________" },
    { type: "p", text: "Date: ______________________________" },

    { type: "spacer", height: 14 },
    { type: "h2", text: "SCHEDULE E — OPPORTUNITY REGISTER (TEMPLATE)" },
    { type: "table", widths: [90, 90, 110, 70, 90, 80], rows: [["Brand", "Contact", "Nature of opportunity", "Date notified", "Athlete response", "Status / expiry"]] },

    { type: "spacer", height: 14 },
    { type: "h2", text: "SCHEDULE F — PAYMENT AND CONTACT DETAILS" },
    {
      type: "table",
      widths: [160, 370],
      rows: [
        ["Item", "Details"],
        ["BAME bank account", `Bank: ${BAME_BANK.bank}. Account name: ${BAME_BANK.accountName}. Account type: ${BAME_BANK.accountType}. Account no.: ${BAME_BANK.accountNumber}. Branch code: ${BAME_BANK.branchCode}. Swift code: ${BAME_BANK.swiftCode}.`],
        ["BAME VAT number", "Not VAT-registered"],
        ["BAME information officer (POPIA)", `Name: ${BAME.repName}. Email: ${BAME.email}.`],
        ["Domicilium and notices", `As in the parties box. Athlete's physical address: ${input.athleteAddress || "______________________"}`],
      ],
    },
  ];

  return blocks;
}

export const CONTRACT_FOOTER = `Initials: BAME ______     Athlete ______`;
export function contractDocTitle(athleteFullName: string) {
  return `BAME Sports Management — Athlete Personal Branding & Marketing Services Agreement (${athleteFullName})`;
}
