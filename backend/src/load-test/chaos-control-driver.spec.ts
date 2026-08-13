import { createHmac } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readChaosScenario, runChaosAction } from './chaos-control-driver';

describe('chaos control driver', () => {
  const previous = { ...process.env };
  beforeEach(() => { process.env.LOAD_TEST_AUTHORIZATION = 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY'; });
  afterEach(() => { process.env = { ...previous }; jest.restoreAllMocks(); });

  it('signs injection, polls terminal identity, and redacts secret and operation ID', async () => {
    const secret = 'a'.repeat(32);
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        const body = String(init?.body);
        expect(headers['X-Chaos-Signature']).toBe(createHmac('sha256', secret).update(`${headers['X-Chaos-Timestamp']}.${headers['X-Chaos-Nonce']}.${body}`).digest('hex'));
        return new Response(JSON.stringify({ id: 'operation-secret-id' }), { status: 202 });
      })
      .mockImplementationOnce(async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        const path = '/v1/chaos/operations/operation-secret-id';
        expect(headers['X-Chaos-Signature']).toBe(createHmac('sha256', secret).update(`${headers['X-Chaos-Timestamp']}.${headers['X-Chaos-Nonce']}.${path}`).digest('hex'));
        return new Response(JSON.stringify({ status: 'INJECTED', runId: 'stage6-test-001', scenario: 'redis-interruption', action: 'inject' }), { status: 200 });
      });
    const evidence = await runChaosAction({ scenario: { schemaVersion: 1, name: 'redis-interruption', fault: 'REDIS_UNAVAILABLE', scope: { environment: 'ISOLATED_PERFORMANCE', maxAffectedSchools: 1000, syntheticOnly: true }, timeoutMs: 10_000, terminalStates: { inject: 'INJECTED', recover: 'RECOVERED', verify: 'VERIFIED' } }, action: 'inject', controlUrl: 'http://localhost:9876', secret, runId: 'stage6-test-001' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(evidence)).not.toContain(secret);
    expect(JSON.stringify(evidence)).not.toContain('operation-secret-id');
    expect(evidence.terminalStatus).toBe('INJECTED');
  });

  it('rejects unsafe scenario scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'chaos-scenario-'));
    const path = join(root, 'scenario.json');
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, name: 'database-failover', fault: 'FAILOVER', scope: { environment: 'PRODUCTION', maxAffectedSchools: 1000, syntheticOnly: true }, timeoutMs: 10000, terminalStates: { inject: 'INJECTED', recover: 'RECOVERED', verify: 'VERIFIED' } }));
    expect(() => readChaosScenario(path)).toThrow('unsafe scope');
    rmSync(root, { recursive: true, force: true });
  });

  it('loads every required immutable scenario definition', () => {
    for (const name of ['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension']) {
      expect(readChaosScenario(join(process.cwd(), '..', 'load-test', 'chaos-scenarios', `${name}.json`))).toEqual(expect.objectContaining({ name, schemaVersion: 1 }));
    }
  });

  it('rejects a production chaos controller', async () => {
    await expect(runChaosAction({ scenario: { schemaVersion: 1, name: 'redis-interruption', fault: 'REDIS_UNAVAILABLE', scope: { environment: 'ISOLATED_PERFORMANCE', maxAffectedSchools: 1000, syntheticOnly: true }, timeoutMs: 10_000, terminalStates: { inject: 'INJECTED', recover: 'RECOVERED', verify: 'VERIFIED' } }, action: 'inject', controlUrl: 'https://wattanman.app', secret: 'a'.repeat(32), runId: 'stage6-test-001' })).rejects.toThrow('Production HTTP target');
  });
});
