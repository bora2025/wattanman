import { SetMetadata } from '@nestjs/common';
import { SchoolAddonKey } from './addon-keys';

export const REQUIRES_ADDON_KEY = 'requiresAddon';
export const RequiresAddon = (addon: SchoolAddonKey) => SetMetadata(REQUIRES_ADDON_KEY, addon);
