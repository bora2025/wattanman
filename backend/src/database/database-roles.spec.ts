import { readFileSync } from 'fs';
import { join } from 'path';

describe('database role provisioning', () => {
  const script = readFileSync(join(process.cwd(), 'prisma', 'provision-database-roles.js'), 'utf8');

  it('defines four fixed non-login least-privilege roles', () => {
    expect(script).toContain('wattaman_migration');
    expect(script).toContain('wattaman_control_plane');
    expect(script).toContain('wattaman_school_runtime');
    expect(script).toContain('wattaman_analytics');
    expect(script).toContain('NOLOGIN');
    expect(script).toContain('NOCREATEROLE');
    expect(script).toContain('NOCREATEDB');
  });

  it('limits RLS bypass to the control plane and provisions future-object grants', () => {
    expect(script).toContain("{ name: 'wattaman_control_plane', bypassRls: true }");
    expect(script.match(/bypassRls: true/g)).toHaveLength(1);
    expect(script).toContain('ALTER DEFAULT PRIVILEGES');
    expect(script).toContain('RUNTIME_TENANT_TABLES');
    expect(script).toContain('RUNTIME_CATALOG_TABLES');
    expect(script).toContain('REVOKE ALL PRIVILEGES ON ALL TABLES');
    expect(script).toContain('DATABASE_ADMIN_URL is required');
    expect(script).toContain('pg_advisory_xact_lock');
  });
});
