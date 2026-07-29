/**
 * Canonical set of paid, per-school add-ons (Phase 7a of the multi-tenant
 * conversion plan). Unlike Phase 7's module toggles (free, opt-out, on by
 * default), these are opt-IN and billing-gated — a school starts with none
 * of them, and a PLATFORM_ADMIN enables one only once it's been paid for.
 *
 * FACE_RECOGNITION_ATTENDANCE has no backing feature yet — building the
 * actual capture/matching pipeline is separate, substantial product work,
 * not part of this tenancy conversion. This registry (and the @RequiresAddon
 * guard in requires-addon.guard.ts) exist so that work has somewhere to
 * plug in a billing gate on day one, instead of retrofitting one later.
 */
export const SCHOOL_ADDON_KEYS = ['FACE_RECOGNITION_ATTENDANCE'] as const;

export type SchoolAddonKey = (typeof SCHOOL_ADDON_KEYS)[number];

export const SCHOOL_ADDON_LABELS: Record<SchoolAddonKey, string> = {
  FACE_RECOGNITION_ATTENDANCE: 'Face Recognition Attendance',
};

export const SCHOOL_ADDON_DESCRIPTIONS: Record<SchoolAddonKey, string> = {
  FACE_RECOGNITION_ATTENDANCE: 'Automatic attendance capture via facial recognition, billed separately from the base plan.',
};

export function isValidAddonKey(key: string): key is SchoolAddonKey {
  return (SCHOOL_ADDON_KEYS as readonly string[]).includes(key);
}

export const BILLING_STATUSES = ['PENDING', 'ACTIVE', 'OVERDUE', 'CANCELLED'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];
