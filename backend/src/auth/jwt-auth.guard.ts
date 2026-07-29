import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { tenantContext } from '../tenancy/tenant-context';

/**
 * Extends Passport's JWT guard with the multi-tenant auth boundary: the Host
 * header (resolved by TenantHostMiddleware before this guard runs) says which
 * school the request *claims* to be for, but it's client-supplied and
 * spoofable. Once a JWT is verified, the signed `schoolId` claim inside it is
 * authoritative — a mismatch means a token issued for one school is being
 * replayed against another school's subdomain (relevant mainly for the mobile
 * app's Bearer-token flow, which has no browser-enforced same-origin cookie
 * scoping to fall back on) and is rejected.
 *
 * On a match, the JWT claim overwrites the ALS store in place so it stays
 * authoritative for the remainder of the request, per the conversion plan's
 * Phase 2d.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isValid = (await super.canActivate(context)) as boolean;
    if (!isValid) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { schoolId?: string } | undefined;
    const store = tenantContext.getStore();

    if (user?.schoolId && store) {
      if (store.schoolId !== user.schoolId) {
        throw new UnauthorizedException('Session does not match the current school');
      }
      store.schoolId = user.schoolId;
    }

    return true;
  }
}
