// TEBOS's starting draft for a client agreement. It is a DRAFT for a lawyer
// to review and change: the database refuses to send any contract until a
// template is marked approved, with a note saying who approved it.
// {{placeholders}} are filled per client from the plan terms (src/domain/plans.ts).

export const CONTRACT_PLACEHOLDERS: Array<[string, string]> = [
  ["business", "The client business's name"],
  ["contact_name", "The person accepting for the client"],
  ["email", "Their email address"],
  ["plan_name", "Diagnostic, Architecture & Operations, or Company Operating Architecture"],
  ["monthly_fee", "The fee terms, e.g. R2,500 per month, excluding VAT (or the Company Diagnostic fee)"],
  ["deliverables", "The plan's deliverables, one per line"],
  ["date", "The date the agreement is sent"],
  ["reference", "TEBOS's reference for this client"],
];

export const DRAFT_AGREEMENT = `# TEBOS client agreement

Reference: {{reference}} · Date: {{date}}

This agreement is between **TEBOS** ("TEBOS", "we") and **{{business}}** ("the client", "you"), accepted on the client's behalf by {{contact_name}} ({{email}}).

## 1. What TEBOS provides

TEBOS provides the **{{plan_name}}** plan. It includes:

{{deliverables}}

TEBOS builds the operating structure of your business: its objectives, how work flows, who owns each step, and the rules and systems that carry it. TEBOS does not promise particular financial or commercial results. Findings and recommendations are based on the evidence available to TEBOS at the time, and each one shows that evidence.

## 2. Fees and payment

The fee is {{monthly_fee}}, payable monthly in advance. The first month has been paid before this agreement was sent. Later months are billed at the start of each month. If a payment is more than 14 days late, TEBOS may pause the service until it is paid.

## 3. Term and ending the agreement

The agreement runs month to month from the date you accept it. Either side may end it with 30 days' written notice (email is enough). Fees already paid for a month that has started are not refunded.

## 4. Your responsibilities

You give TEBOS accurate information, timely access to the people and systems the service needs, and a named contact for decisions. Changes TEBOS proposes are made only with your approval.

## 5. Confidentiality

Each side keeps the other's confidential information confidential, uses it only for this agreement, and shares it only with people who need it for this agreement and are bound to the same duty.

TEBOS's methods, frameworks, playbooks, board designs, software, scripts and materials are TEBOS's confidential information. You may use them in your own business during this agreement. You may not copy, publish, resell or share them, or use them to build or offer a competing service.

## 6. Ownership

Your business data remains yours. TEBOS keeps ownership of the TEBOS platform, its methods and its materials, and of any general know-how it gains. You receive a right to use the deliverables made for you in your own business.

## 7. Personal information

Each side complies with the Protection of Personal Information Act, 2013 (POPIA). TEBOS processes personal information only to provide the service, keeps it secure, and does not sell it.

## 8. Liability

Neither side is liable for indirect or consequential loss. Except where the law does not allow a limit, TEBOS's total liability under this agreement is limited to the fees you paid in the three months before the claim arose.

## 9. General

This agreement is governed by the laws of the Republic of South Africa. It is the whole agreement between the parties for this service. Changes must be agreed in writing (email is enough). The client accepts this agreement electronically, and the parties agree that this acceptance is valid and binding.
`;

/** The company plan's draft: the same agreement, with the fee clause for a one-off Company Diagnostic. */
export const DRAFT_COMPANY_AGREEMENT = DRAFT_AGREEMENT.replace(
  /## 2\. Fees and payment\n\n[^\n]+\n/,
  `## 2. Fees and payment

The fee is {{monthly_fee}}. The Company Diagnostic has been paid before this agreement was sent. After the Company Diagnostic, TEBOS gives the client a written proposal for ongoing work, with a fixed monthly fee; ongoing work starts only once both sides have agreed that proposal in writing. If a payment is more than 14 days late, TEBOS may pause the service until it is paid.
`,
);

export const draftFor = (plan: string) => (plan === "company" ? DRAFT_COMPANY_AGREEMENT : DRAFT_AGREEMENT);
