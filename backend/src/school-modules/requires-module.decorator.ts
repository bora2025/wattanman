import { SetMetadata } from '@nestjs/common';
import { SchoolModuleKey } from './module-keys';

export const REQUIRES_MODULE_KEY = 'requiresModule';
export const RequiresModule = (module: SchoolModuleKey) => SetMetadata(REQUIRES_MODULE_KEY, module);
