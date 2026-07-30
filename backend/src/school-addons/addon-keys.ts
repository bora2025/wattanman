/**
 * The set of paid, per-school add-ons (Phase 7a of the multi-tenant
 * conversion plan) now lives in the database as `AddonDefinition` rows,
 * managed through the Platform tier's Add-ons Directory
 * (backend/src/platform/addon-directory.controller.ts) — a
 * PLATFORM_ADMIN can create/price/retire listings without a code change,
 * unlike the fixed array this file used to export.
 *
 * `BILLING_STATUSES` is unrelated to the catalog itself (it's the set of
 * states a school's *subscription* to a given add-on can be in) and stays
 * a fixed enum here — billing itself stays manual (no payment gateway),
 * so this isn't something a platform admin needs to extend at runtime.
 */
export const BILLING_STATUSES = ['PENDING', 'ACTIVE', 'OVERDUE', 'CANCELLED'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];
