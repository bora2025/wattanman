import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('load test contract', () => {
  const root = resolve(process.cwd(), '..', 'load-test');

  it('defines normal, peak, burst, and failure profiles at certification rates', () => {
    const profiles = JSON.parse(readFileSync(resolve(root, 'profiles.json'), 'utf8'));
    expect(Object.keys(profiles).sort()).toEqual(['burst', 'failure', 'normal', 'peak']);
    expect(profiles.peak).toEqual(expect.objectContaining({ rate: 1000, duration: '2h' }));
    expect(profiles.burst.stages).toContainEqual(expect.objectContaining({ target: 3000 }));
  });

  it('fails closed on production hosts and emits cost evidence', () => {
    const source = readFileSync(resolve(root, 'wattaman.js'), 'utf8');
    expect(source).toContain("LOAD_TEST_AUTHORIZATION !== 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY'");
    expect(source).toContain("host.endsWith('.up.railway.app')");
    expect(source).toContain("host.endsWith('.wattaman.app')");
    expect(source).toContain('estimatedCostUsd');
    expect(source).toContain('LOAD_COST_PER_MILLION_REQUESTS_USD');
    expect(source).toContain("'authenticated status is 200'");
    expect(source).not.toContain('[200, 401, 403]');
    expect(source).toContain('LOAD_TEST_SESSIONS || 10000');
    expect(source).toContain("new Counter('tenant_isolation_failures')");
    expect(source).toContain("new Rate('burst_recovery_failures')");
    expect(source).toContain('configuredRps');
    expect(source).toContain('achievedRps');
  });

  it('guards provisioning and cleanup independently from runtime DATABASE_URL', () => {
    const provisioner = readFileSync(resolve(process.cwd(), 'src', 'cli', 'provision-load-database.ts'), 'utf8');
    const cleanup = readFileSync(resolve(process.cwd(), 'src', 'cli', 'cleanup-load-database.ts'), 'utf8');
    expect(provisioner).toContain('LOAD_TEST_DATABASE_URL');
    expect(provisioner).toContain('assertSyntheticOnlySchools');
    expect(provisioner).toContain("mode: 0o600");
    expect(provisioner).toContain("expiresAt = Math.floor(Date.now() / 1000) + 3 * 60 * 60");
    expect(cleanup).toContain("LOAD_TEST_CLEANUP_CONFIRMATION !== 'DELETE_ALL_SYNTHETIC_LOAD_DATA'");
    expect(cleanup).toContain("startsWith: 'load-school-'");
  });

  it('keeps the chaos controller isolated from application Redis and production targets', () => {
    const source = readFileSync(resolve(process.cwd(), 'src', 'load-test', 'chaos-controller.ts'), 'utf8');
    const entry = readFileSync(resolve(process.cwd(), 'src', 'cli', 'run-load-chaos-controller.ts'), 'utf8');
    expect(source).toContain("url === process.env.REDIS_URL");
    expect(source).toContain('assertLoadTestHttpTarget');
    expect(source).toContain('claimNonce');
    expect(entry).toContain('I_AUTHORIZE_ISOLATED_CHAOS_CONTROL');
    expect(entry).toContain("LOAD_CHAOS_ENVIRONMENT !== 'ISOLATED_PERFORMANCE'");
  });
});
