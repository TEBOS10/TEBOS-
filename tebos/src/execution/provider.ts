// What the execution worker needs from a provider connector. Each outcome is
// an honest state, not a boolean: "unknown" means the provider may or may not
// have acted, and is never reported as success or as failure.

import type { EmailInput } from "../domain/email";

export type VerifyResult =
  | { ok: true; scopes: string[]; detail: string }
  | { ok: false; status: "authentication_required" | "unavailable"; detail: string };

export type SendResult =
  | { outcome: "accepted"; providerReference: string }
  | { outcome: "rejected"; errorClass: "validation" | "permission" | "integration"; detail: string; credentialProblem: boolean }
  /** Transient or ambiguous: safe to retry with the same idempotency key. */
  | { outcome: "unknown"; detail: string };

export type DeliveryState = "pending" | "delivered" | "failed";

export type DeliveryResult =
  | { state: DeliveryState; providerStatus: string; detail: string | null }
  | { state: "unknown"; detail: string };

export interface EmailSend {
  from: string;
  input: EmailInput;
  idempotencyKey: string;
}

export interface EmailConnector {
  readonly key: string;
  readonly provider: string;
  verify(apiKey: string): Promise<VerifyResult>;
  sendEmail(apiKey: string, send: EmailSend): Promise<SendResult>;
  /** Scope the connection must hold for delivery to be checked by polling. */
  readonly deliveryReadScope: string;
  getDelivery(apiKey: string, providerReference: string): Promise<DeliveryResult>;
}

export interface WebhookDelivery {
  eventId: string;
  eventType: string;
  providerReference: string | null;
  delivery: { state: DeliveryState; providerStatus: string; detail: string | null } | null;
}
