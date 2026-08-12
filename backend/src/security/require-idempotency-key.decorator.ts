import { SetMetadata } from '@nestjs/common';

export const REQUIRE_IDEMPOTENCY_KEY = 'requireIdempotencyKey';
export const RequireIdempotencyKey = () => SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true);
