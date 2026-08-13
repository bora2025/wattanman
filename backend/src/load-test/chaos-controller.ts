import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import IORedis from 'ioredis';
import { assertLoadTestHttpTarget } from './database-safety';
import { ChaosAction, ChaosScenario } from './chaos-control-driver';

export interface ChaosOperation { id: string; runId: string; scenario: string; action: ChaosAction; status: string; createdAt: string; updatedAt: string; error?: string }
export interface ChaosOperationStore {
  claimNonce(nonce: string, ttlSeconds: number): Promise<boolean>;
  put(operation: ChaosOperation, ttlSeconds: number): Promise<void>;
  get(id: string): Promise<ChaosOperation | null>;
  close(): Promise<void>;
}

export class RedisChaosOperationStore implements ChaosOperationStore {
  private readonly redis: IORedis;
  constructor(url: string) {
    if (!url) throw new Error('LOAD_CHAOS_REDIS_URL is required');
    if (url === process.env.REDIS_URL) throw new Error('Chaos controller must not use the application Redis');
    const parsed = new URL(url);
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('Chaos Redis URL is invalid');
    this.redis = new IORedis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 1 });
  }
  async claimNonce(nonce: string, ttlSeconds: number) { return (await this.redis.set(`chaos:nonce:${nonce}`, '1', 'EX', ttlSeconds, 'NX')) === 'OK'; }
  async put(operation: ChaosOperation, ttlSeconds: number) { await this.redis.set(`chaos:operation:${operation.id}`, JSON.stringify(operation), 'EX', ttlSeconds); }
  async get(id: string) { const value = await this.redis.get(`chaos:operation:${id}`); return value ? JSON.parse(value) : null; }
  async close() { await this.redis.quit(); }
}

function hmac(secret: string, timestamp: string, nonce: string, content: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${content}`).digest('hex');
}

export class ChaosController {
  constructor(
    private readonly store: ChaosOperationStore,
    private readonly scenarios: Map<string, ChaosScenario>,
    private readonly inboundSecret: string,
    private readonly adapterSecret: string,
    private readonly adapterUrls: Record<string, string>,
  ) {
    if (inboundSecret.length < 32 || adapterSecret.length < 32) throw new Error('Chaos control and adapter secrets must contain at least 32 characters');
  }

  async authenticate(input: { timestamp?: string; nonce?: string; signature?: string; content: string }) {
    if (!input.timestamp || !input.nonce || !input.signature || !/^[a-f0-9]{64}$/.test(input.signature) || !/^[a-zA-Z0-9-]{16,100}$/.test(input.nonce)) throw new Error('Invalid chaos authentication headers');
    const time = Date.parse(input.timestamp);
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 60_000) throw new Error('Chaos request timestamp is stale');
    const expected = hmac(this.inboundSecret, input.timestamp, input.nonce, input.content);
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))) throw new Error('Chaos request signature is invalid');
    if (!(await this.store.claimNonce(input.nonce, 120))) throw new Error('Chaos request nonce was already used');
  }

  async accept(request: any) {
    if (request?.schemaVersion !== 1 || !/^[a-zA-Z0-9._-]{8,100}$/.test(request.runId || '') || !['inject', 'recover', 'verify'].includes(request.action)) throw new Error('Invalid chaos operation request');
    const scenario = this.scenarios.get(request.scenario);
    if (!scenario || request.fault !== scenario.fault || JSON.stringify(request.scope) !== JSON.stringify(scenario.scope)) throw new Error('Chaos request does not match an approved scenario');
    const operation: ChaosOperation = { id: randomUUID(), runId: request.runId, scenario: scenario.name, action: request.action, status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.store.put(operation, 24 * 60 * 60);
    void this.dispatch(operation, scenario);
    return { id: operation.id };
  }

  async operation(id: string) {
    if (!/^[a-zA-Z0-9._-]{1,200}$/.test(id)) throw new Error('Invalid chaos operation ID');
    return this.store.get(id);
  }

  private async dispatch(operation: ChaosOperation, scenario: ChaosScenario) {
    try {
      const rawUrl = this.adapterUrls[scenario.name];
      if (!rawUrl) throw new Error(`No adapter configured for ${scenario.name}`);
      const adapterUrl = assertLoadTestHttpTarget(rawUrl);
      const timestamp = new Date().toISOString();
      const nonce = randomUUID();
      const payload = { schemaVersion: 1, operationId: operation.id, runId: operation.runId, scenario: operation.scenario, action: operation.action, fault: scenario.fault, scope: scenario.scope };
      const body = JSON.stringify(payload);
      const response = await fetch(`${adapterUrl}/v1/chaos-adapter/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chaos-Timestamp': timestamp, 'X-Chaos-Nonce': nonce, 'X-Chaos-Signature': hmac(this.adapterSecret, timestamp, nonce, body) }, body, signal: AbortSignal.timeout(scenario.timeoutMs) });
      if (response.status !== 200) throw new Error(`Chaos adapter returned ${response.status}`);
      const result = JSON.parse(await response.text());
      const expected = scenario.terminalStates[operation.action];
      if (result.status !== expected || result.operationId !== operation.id || result.runId !== operation.runId || result.scenario !== operation.scenario || result.action !== operation.action) throw new Error('Chaos adapter terminal identity mismatch');
      await this.store.put({ ...operation, status: expected, updatedAt: new Date().toISOString() }, 24 * 60 * 60);
    } catch (error: any) {
      await this.store.put({ ...operation, status: 'FAILED', updatedAt: new Date().toISOString(), error: String(error?.message || error).slice(0, 300) }, 24 * 60 * 60).catch(() => undefined);
    }
  }
}
