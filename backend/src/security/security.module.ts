import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from './idempotency.store';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ScheduledTaskGuardService } from './scheduled-task-guard.service';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  providers: [IdempotencyStore, CircuitBreakerService, ScheduledTaskGuardService, DistributedLockService],
  exports: [IdempotencyStore, CircuitBreakerService, ScheduledTaskGuardService, DistributedLockService],
})
export class SecurityModule {}
