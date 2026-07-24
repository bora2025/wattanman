// Shared helpers for treating "email or phone" as a login identifier — used by
// auth (login/register), class-registrations, and CSV bulk student import.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** Digits-only form of a phone number, used as the unique lookup key
 * (`User.phoneNormalized`) so "012 345 678" and "012-345-678" resolve to the
 * same account. Returns '' for anything with fewer than 6 digits — too short
 * to plausibly be a real phone number, so callers should treat it as absent. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : '';
}

/** True if the given login/registration identifier looks like an email
 * address rather than a phone number (used to pick which column to query). */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
