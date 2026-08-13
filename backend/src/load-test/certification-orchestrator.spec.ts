import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CommandStep, runCertificationManifest, validateCertificationManifest } from './certification-orchestrator';

const originalEnv = process.env;

function step(name: string, evidenceFile = `${name}.json`, script = ''): CommandStep {
  return { name, executable: process.execPath, args: ['-e', script], timeoutMs: 5000, evidenceFile };
}

function manifest(root: string) {
  const operations = ['marketplace-publication', 'staged-update', 'backup', 'validation', 'migration'].map((name) => step(name));
  const failures = ['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension'].map((name) => ({ name, inject: step(`${name}-inject`), workload: step(`${name}-workload`), recover: step(`${name}-recover`), verify: step(`${name}-verify`) }));
  return { schemaVersion: 1 as const, runId: 'certification-test-001', target: 'http://localhost:3000', resultsDirectory: root, fixture: step('fixture'), traffic: [step('sustained'), step('burst'), step('limits')], concurrentTraffic: { name: 'operations-during-traffic', workload: step('concurrent-workload'), operations }, failures };
}

describe('certification orchestrator', () => {
  beforeEach(() => { process.env = { ...originalEnv, LOAD_TEST_AUTHORIZATION: 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY' }; });
  afterEach(() => { process.env = originalEnv; });

  it('rejects production and incomplete manifests before launching commands', () => {
    const root = mkdtempSync(join(tmpdir(), 'wattaman-cert-'));
    const input: any = manifest(root);
    input.target = 'https://wattanman.app';
    expect(() => validateCertificationManifest(input)).toThrow('forbidden');
    input.target = 'http://localhost:3000'; input.failures.pop();
    expect(() => validateCertificationManifest(input)).toThrow('Missing failure phase');
    rmSync(root, { recursive: true, force: true });
  });

  it('executes all phases and writes immutable hashed evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wattaman-cert-'));
    const result = await runCertificationManifest(manifest(root));
    expect(result.traffic).toHaveLength(3);
    expect(result.concurrentTraffic.operations).toHaveLength(5);
    expect(result.failures).toHaveLength(7);
    expect(existsSync(join(root, 'orchestration.json'))).toBe(true);
    expect(result.fixture.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);
    rmSync(root, { recursive: true, force: true });
  }, 30000);

  it('samples limits concurrently with sustained traffic', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wattaman-cert-'));
    const input = manifest(root);
    input.traffic[0] = step('sustained', 'sustained.json', 'setTimeout(() => {}, 200)');
    input.traffic[2] = step('limits', 'limits.json', 'setTimeout(() => {}, 200)');
    const result = await runCertificationManifest(input);
    const sustainedStarted = Date.parse(result.traffic[0].startedAt);
    const limitsStarted = Date.parse(result.traffic[2].startedAt);
    expect(Math.abs(sustainedStarted - limitsStarted)).toBeLessThan(100);
    rmSync(root, { recursive: true, force: true });
  }, 30000);

  it('always executes recovery when a failure workload exits unsuccessfully', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wattaman-cert-'));
    const input = manifest(root);
    input.failures[0].workload = step('database-failover-workload', 'database-failover-workload.json', 'process.exit(7)');
    await expect(runCertificationManifest(input)).rejects.toThrow('exit code 7');
    expect(existsSync(join(root, 'database-failover-recover.json'))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  }, 30000);
});
