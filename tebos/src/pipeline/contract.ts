// Filling a lawyer-approved contract template for one client. Templates use
// {{placeholders}}; every one must be known, so nothing half-filled is ever
// sent.

import { createHash, randomBytes } from "node:crypto";
import { feeTerms, PLAN_TERMS, type PlanKey } from "../domain/plans";

export const PLACEHOLDERS = ["business", "contact_name", "email", "plan_name", "monthly_fee", "deliverables", "date", "reference"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export interface ContractFacts {
  business: string;
  contactName: string;
  email: string;
  plan: PlanKey;
  reference: string;
  date: Date;
}

export type Rendered = { ok: true; body: string; hash: string } | { ok: false; unknown: string[] };

export function renderContract(template: string, f: ContractFacts): Rendered {
  const terms = PLAN_TERMS[f.plan];
  const values: Record<Placeholder, string> = {
    business: f.business,
    contact_name: f.contactName,
    email: f.email,
    plan_name: terms.name,
    monthly_fee: feeTerms(f.plan),
    deliverables: terms.deliverables.map((d) => `- ${d}`).join("\n"),
    date: f.date.toISOString().slice(0, 10),
    reference: f.reference,
  };
  const unknown = [...new Set([...template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]!).filter((k) => !(PLACEHOLDERS as readonly string[]).includes(k)))];
  if (unknown.length) return { ok: false, unknown };
  const body = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: Placeholder) => values[k]);
  return { ok: true, body, hash: sha256(body) };
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** A one-time link token: shown once in the email, stored only as its fingerprint. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: sha256(token) };
}
