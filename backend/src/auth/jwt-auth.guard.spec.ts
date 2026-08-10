import { UnauthorizedException } from '@nestjs/common';
import { assertSessionTenant } from './jwt-auth.guard';

describe('assertSessionTenant', () => {
  it('allows a session on its own resolved school domain', () => {
    expect(() => assertSessionTenant('school-a', 'school-a')).not.toThrow();
  });

  it('rejects a valid session replayed against another school domain', () => {
    expect(() => assertSessionTenant('school-a', 'school-b')).toThrow(
      UnauthorizedException,
    );
  });

  it('does not invent a tenant when either side is absent', () => {
    expect(() => assertSessionTenant(undefined, 'school-a')).not.toThrow();
    expect(() => assertSessionTenant('school-a', undefined)).not.toThrow();
  });
});
