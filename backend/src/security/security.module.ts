import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from './idempotency.store';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ScheduledTaskGuardService } from './scheduled-task-guard.service';

@Global()
@Module({
  providers: [IdempotencyStore, CircuitBreakerService, ScheduledTaskGuardService],
  exports: [IdempotencyStore, CircuitBreakerService, ScheduledTaskGuardService],
})
export class SecurityModule {}
