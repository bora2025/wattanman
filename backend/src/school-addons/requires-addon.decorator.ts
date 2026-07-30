import { SetMetadata } from '@nestjs/common';

/** `addon` is an AddonDefinition.key — a free-form string now that the
 * catalog is database-driven (Platform tier's Add-ons Directory), not a
 * fixed union of hardcoded keys. */
export const REQUIRES_ADDON_KEY = 'requiresAddon';
export const RequiresAddon = (addon: string) => SetMetadata(REQUIRES_ADDON_KEY, addon);

/**
 * Escape hatch from a class-level @RequiresAddon() for one specific method.
 * NestJS guards can't be "un-applied" per method (class-level @UseGuards
 * always runs), so this is a second, method-level metadata flag the guard
 * checks first — needed for endpoints like ClassesController's "my classes"
 * self-lookup, which many OTHER modules' teacher-facing pages depend on
 * (Attendance, Exams, Gradebook all resolve "which classes do I teach"
 * before doing anything module-specific). Gating that lookup under CLASSES
 * meant disabling Classes broke those other, independently-enabled modules
 * for teachers — found live in production. Use sparingly: only for routes
 * that are identity/roster lookups, not the actual gated feature.
 */
export const SKIP_ADDON_CHECK_KEY = 'skipAddonCheck';
export const SkipAddonCheck = () => SetMetadata(SKIP_ADDON_CHECK_KEY, true);
