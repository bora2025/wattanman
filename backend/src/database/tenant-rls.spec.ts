import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';

describe('tenant RLS policy installation', () => {
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  const migration = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(join(migrationsRoot, entry.name, 'migration.sql'), 'utf8'))
    .join('\n');
  const activation = readFileSync(join(process.cwd(), 'prisma', 'activate-tenant-rls.js'), 'utf8');

  it('installs a deny-by-default policy for every tenant-scoped model', () => {
    for (const model of TENANT_SCOPED_MODELS) {
      expect(migration.includes(`'${model}'`) || migration.includes(`"${model}"`)).toBe(true);
    }
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
