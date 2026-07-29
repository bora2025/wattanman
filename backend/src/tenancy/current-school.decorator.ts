import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getCurrentSchoolId } from './tenant-context';

/**
 * Injects the current request's schoolId directly into a controller method,
 * for the handful of spots that need the id explicitly rather than relying on
 * PrismaService's implicit auto-scoping — e.g. building a composite-unique
 * `where` by hand, or the Phase 3 backup/export rewrite.
 *
 * New pattern for this codebase (controllers otherwise read `req.user` inline)
 * but small and self-contained.
 */
export const CurrentSchool = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return getCurrentSchoolId();
});
