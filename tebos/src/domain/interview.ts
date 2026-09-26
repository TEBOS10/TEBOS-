// Diagnostic interviews: booking rules shared by the interface and the worker.
// The database enforces the same rules (migration diagnostic_interviews).

/** The consent a person gives before a call is booked, stored word for word with the booking. */
export const CALL_CONSENT_TEXT =
  "I agree to receive a call from TEBOS's AI interviewer at the time I booked, and for the call to be recorded and transcribed so its answers can be used to review my business. I can end the call at any time.";

export const BOOKING_WINDOW_DAYS = 30;

/**
 * A phone number in E.164 form. South African numbers may be written
 * locally ("082 123 4567") and are converted; any other country needs its
 * "+" country code.
 */
export function normalisePhone(input: string, defaultCountryCode = "27"): string | null {
  const s = input.trim().replace(/[\s().-]/g, "");
  let digits: string;
  if (s.startsWith("+")) digits = s.slice(1);
  else if (s.startsWith("00")) digits = s.slice(2);
  else if (s.startsWith("0")) digits = defaultCountryCode + s.slice(1);
  else return null;
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  if (digits.startsWith("27") && digits.length !== 11) return null; // SA numbers: +27 and 9 digits
  return `+${digits}`;
}

export type BookingCheck = { ok: true } | { ok: false; reason: string };

export function checkBookingTime(at: Date, now: Date = new Date()): BookingCheck {
  if (Number.isNaN(at.getTime())) return { ok: false, reason: "Choose a date and time" };
  if (at.getTime() < now.getTime() + 5 * 60 * 1000) return { ok: false, reason: "Choose a time at least 5 minutes from now" };
  if (at.getTime() > now.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return { ok: false, reason: `Choose a time within the next ${BOOKING_WINDOW_DAYS} days` };
  }
  return { ok: true };
}
