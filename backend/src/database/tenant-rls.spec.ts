import { readFileSync } from 'fs';
import { join } from 'path';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';

describe('tenant RLS policy installation', () => {
  const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260811000001_install_tenant_rls_policies', 'migration.sql'), 'utf8');
  const activation = readFileSync(join(process.cwd(), 'prisma', 'activate-tenant-rls.js'), 'utf8');

  it('installs a deny-by-default policy for every tenant-scoped model', () => {
    for (const model of TENANT_SCOPED_MODELS) expect(migration).toContain(`'${model}'`);
    expect(migration).toContain("current_setting(''app.current_school_id'', true)");
    expect(migration).toContain('WITH CHECK');
  });

  it('requires verified separate identities before forcing RLS', () => {
    expect(activation).toContain("verifyIdentity(runtime, 'wattaman_school_runtime', false)");
    expect(activation).toContain("verifyIdentity(control, 'wattaman_control_plane', true)");
    expect(activation).toContain('ENABLE ROW LEVEL SECURITY');
    expect(activation).toContain('FORCE ROW LEVEL SECURITY');
  });
});
