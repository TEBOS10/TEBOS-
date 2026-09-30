// Limits on what the public can submit in an hour, per source and in total.
// Enforced by tebos_private.throttle (migration public_throttle); the schema
// parity test keeps these numbers identical to the database's.
export const PUBLIC_LIMITS = {
  enquiry: { perSource: 3, total: 60 },
  self_check: { perSource: 5, total: 300 },
} as const;
export type PublicSubmission = keyof typeof PUBLIC_LIMITS;
