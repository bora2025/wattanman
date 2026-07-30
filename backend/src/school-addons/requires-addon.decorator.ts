import { SetMetadata } from '@nestjs/common';

/** `addon` is an AddonDefinition.key — a free-form string now that the
 * catalog is database-driven (Platform tier's Add-ons Directory), not a
 * fixed union of hardcoded keys. */
export const REQUIRES_ADDON_KEY = 'requiresAddon';
export const RequiresAddon = (addon: string) => SetMetadata(REQUIRES_ADDON_KEY, addon);
