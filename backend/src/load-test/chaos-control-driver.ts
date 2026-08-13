import { createHash, createHmac, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { basename, resolve } from 'path';
import { assertLoadTestHttpTarget } from './database-safety';

export type ChaosAction = 'inject' | 'recover' | 'verify';
export interface ChaosScenario {
  schemaVersion: 1;
  name: string;
  fault: string;
  scope: { environment: 'ISOLATED_PERFORMANCE'; maxAffectedSchools: number; syntheticOnly: true };
  timeoutMs: number;
  terminalStates: Record<ChaosAction, string>;
}

export function readChaosScenario(path: string): ChaosScenario {
  const scenario = JSON.parse(readFileSync(resolve(path), 'utf8')) as ChaosScenario;
  if (scenario?.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(scenario.name || '') || !scenario.fault) throw new Error('Invalid chaos scenario');
  if (scenario.scope?.environment !== 'ISOLATED_PERFORMANCE' || scenario.scope.syntheticOnly !== true || !Number.isInteger(scenario.scope.maxAffectedSchools) || scenario.scope.maxAffectedSchools < 1 || scenario.scope.maxAffectedSchools > 1000) throw new Error('Chaos scenario has an unsafe scope');
  if (!Number.isInteger(scenario.timeoutMs) || scenario.timeoutMs < 10_000 || scenario.timeoutMs > 900_000) throw new Error('Chaos scenario timeout is outside 10 seconds to 15 minutes');
  for (const action of ['inject', 'recover', 'verify'] as ChaosAction[]) if (!scenario.terminalStates?.[action]) throw new Error(`Missing terminal state for ${action}`);
  return scenario;
}

function signature(secret: string, timestamp: string, nonce: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
}

export async function runChaosAction(input: { scenario: ChaosScenario; action: ChaosAction; controlUrl: string; secret: string; runId: string }) {
  if (!['inject', 'recover', 'verify'].includes(input.action)) throw new Error('Invalid chaos action');
  const controlUrl = assertLoadTestHttpTarget(input.controlUrl);
  if (!input.runId || !/^[a-zA-Z0-9._-]{8,100}$/.test(input.runId)) throw new Error('LOAD_TEST_RUN_ID is required');
  if (input.secret.length < 32) throw new Error('LOAD_CHAOS_CONTROL_SECRET must contain at least 32 characters');
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const request = { schemaVersion: 1, runId: input.runId, scenario: input.scenario.name, action: input.action, fault: input.scenario.fault, scope: input.scenario.scope };
  const body = JSON.stringify(request);
  const headers = { 'Content-Type': 'application/json', 'X-Chaos-Timestamp': timestamp, 'X-Chaos-Nonce': nonce, 'X-Chaos-Signature': signature(input.secret, timestamp, nonce, body) };
  const response = await fetch(`${controlUrl}/v1/chaos/operations`, { method: 'POST', headers, body, signal: AbortSignal.timeout(30_000) });
  if (response.status !== 202) throw new Error(`Chaos controller rejected ${input.action} with ${response.status}`);
  const acceptedText = await response.text();
  let accepted: { id?: string };
  try { accepted = JSON.parse(acceptedText); } catch { throw new Error('Chaos controller acceptance was not valid JSON'); }
  if (!accepted.id || !/^[a-zA-Z0-9._-]{1,200}$/.test(accepted.id)) throw new Error('Chaos controller returned an invalid operation ID');
  const deadline = Date.now() + input.scenario.timeoutMs;
  let terminalText = '';
  let terminal: any;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pollTimestamp = new Date().toISOString();
    const pollNonce = randomUUID();
    const path = `/v1/chaos/operations/${encodeURIComponent(accepted.id)}`;
    const pollSignature = signature(input.secret, pollTimestamp, pollNonce, path);
    const poll = await fetch(`${controlUrl}${path}`, { headers: { 'X-Chaos-Timestamp': pollTimestamp, 'X-Chaos-Nonce': pollNonce, 'X-Chaos-Signature': pollSignature }, signal: AbortSignal.timeout(30_000) });
    if (poll.status !== 200) throw new Error(`Chaos operation polling returned ${poll.status}`);
    terminalText = await poll.text();
    try { terminal = JSON.parse(terminalText); } catch { throw new Error('Chaos operation response was not valid JSON'); }
    if (terminal.status === 'FAILED') throw new Error(`Chaos ${input.action} failed`);
    if (terminal.status === input.scenario.terminalStates[input.action]) break;
  }
  if (terminal?.status !== input.scenario.terminalStates[input.action]) throw new Error(`Chaos ${input.action} timed out`);
  if (terminal.runId !== input.runId || terminal.scenario !== input.scenario.name || terminal.action !== input.action) throw new Error('Chaos terminal response identity mismatch');
  return {
    schemaVersion: 1,
    runId: input.runId,
    scenario: input.scenario.name,
    action: input.action,
    controller: controlUrl,
    operationIdHash: createHash('sha256').update(accepted.id).digest('hex'),
    responseSha256: createHash('sha256').update(terminalText).digest('hex'),
    terminalStatus: terminal.status,
    completedAt: new Date().toISOString(),
  };
}

export function defaultChaosEvidenceName(scenarioPath: string, action: ChaosAction) {
  return `${basename(scenarioPath, '.json')}-${action}.json`;
}
