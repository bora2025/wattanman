import { SetMetadata } from '@nestjs/common';
import { ModuleKey } from '../module-registry/module-registry';

/** `addon` is a MODULE key from the module registry (Phase 22) — a real
 * TypeScript union, not a free-form string, so a typo here fails
 * `tsc --noEmit` instead of silently 403ing an endpoint forever. Paid
 * ADDONs and THEMEs aren't gated this way today (their catalog rows are
 * fully platform-admin-authored at runtime, nothing to type-check against)
 * — if a paid add-on ever needs an API-level gate, add its key to
 * module-registry.ts first, same as any module. */
export const REQUIRES_ADDON_KEY = 'requiresAddon';
export const RequiresAddon = (addon: ModuleKey) => SetMetadata(REQUIRES_ADDON_KEY, addon);

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
