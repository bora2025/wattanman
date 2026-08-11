import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from './idempotency.store';
import { CircuitBreakerService } from './circuit-breaker.service';

@Global()
@Module({ providers: [IdempotencyStore, CircuitBreakerService], exports: [IdempotencyStore, CircuitBreakerService] })
export class SecurityModule {}
