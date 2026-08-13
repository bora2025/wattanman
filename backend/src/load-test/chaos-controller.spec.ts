import { createHmac, randomUUID } from 'crypto';
import { ChaosController, ChaosOperation, ChaosOperationStore } from './chaos-controller';
import { ChaosScenario } from './chaos-control-driver';

class MemoryStore implements ChaosOperationStore {
  nonces = new Set<string>();
  operations = new Map<string, ChaosOperation>();
  async claimNonce(nonce: string) { if (this.nonces.has(nonce)) return false; this.nonces.add(nonce); return true; }
  async put(operation: ChaosOperation) { this.operations.set(operation.id, operation); }
  async get(id: string) { return this.operations.get(id) || null; }
  async close() {}
}

describe('chaos controller', () => {
  const inboundSecret = 'i'.repeat(32);
  const adapterSecret = 'a'.repeat(32);
  const scenario: ChaosScenario = { schemaVersion: 1, name: 'database-failover', fault: 'DATABASE_PRIMARY_FAILOVER', scope: { environment: 'ISOLATED_PERFORMANCE', maxAffectedSchools: 1000, syntheticOnly: true }, timeoutMs: 10_000, terminalStates: { inject: 'INJECTED', recover: 'RECOVERED', verify: 'VERIFIED' } };
  const previous = { ...process.env };

  beforeEach(() => { process.env.LOAD_TEST_AUTHORIZATION = 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY'; });
  afterEach(() => { process.env = { ...previous }; jest.restoreAllMocks(); });

  it('rejects replayed signed requests', async () => {
    const store = new MemoryStore();
    const controller = new ChaosController(store, new Map([[scenario.name, scenario]]), inboundSecret, adapterSecret, {});
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const content = '{}';
    const signature = createHmac('sha256', inboundSecret).update(`${timestamp}.${nonce}.${content}`).digest('hex');
    await controller.authenticate({ timestamp, nonce, signature, content });
    await expect(controller.authenticate({ timestamp, nonce, signature, content })).rejects.toThrow('already used');
  });

  it('dispatches an identity-bound signed adapter action and stores terminal state', async () => {
    const store = new MemoryStore();
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const body = String(init?.body);
      const payload = JSON.parse(body);
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Chaos-Signature']).toBe(createHmac('sha256', adapterSecret).update(`${headers['X-Chaos-Timestamp']}.${headers['X-Chaos-Nonce']}.${body}`).digest('hex'));
      return new Response(JSON.stringify({ status: 'INJECTED', operationId: payload.operationId, runId: payload.runId, scenario: payload.scenario, action: payload.action }), { status: 200 });
    });
    const controller = new ChaosController(store, new Map([[scenario.name, scenario]]), inboundSecret, adapterSecret, { [scenario.name]: 'https://database.performance.example' });
    const accepted = await controller.accept({ schemaVersion: 1, runId: 'stage6-run-001', scenario: scenario.name, action: 'inject', fault: scenario.fault, scope: scenario.scope });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(controller.operation(accepted.id)).resolves.toEqual(expect.objectContaining({ status: 'INJECTED', runId: 'stage6-run-001' }));
  });

  it('fails closed when adapter terminal identity does not match', async () => {
    const store = new MemoryStore();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'INJECTED', operationId: 'wrong' }), { status: 200 }));
    const controller = new ChaosController(store, new Map([[scenario.name, scenario]]), inboundSecret, adapterSecret, { [scenario.name]: 'https://database.performance.example' });
    const accepted = await controller.accept({ schemaVersion: 1, runId: 'stage6-run-001', scenario: scenario.name, action: 'inject', fault: scenario.fault, scope: scenario.scope });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(controller.operation(accepted.id)).resolves.toEqual(expect.objectContaining({ status: 'FAILED' }));
  });
});
