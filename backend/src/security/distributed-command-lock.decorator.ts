import { SetMetadata } from '@nestjs/common';

export const DISTRIBUTED_COMMAND_LOCK = 'distributedCommandLock';
export type DistributedCommandLockScope = 'INSTALLATION' | 'EXTENSION';
export const DistributedCommandLock = (scope: DistributedCommandLockScope) =>
  SetMetadata(DISTRIBUTED_COMMAND_LOCK, scope);
