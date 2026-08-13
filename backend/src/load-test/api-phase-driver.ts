import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { assertLoadTestHttpTarget } from './database-safety';

interface PollContract { path: string; values: Array<string | number | boolean>; intervalMs: number; timeoutMs: number }
interface ApiStep { name: string; method: string; path: string; tokenEnv: string; headers?: Record<string, string>; json?: unknown; multipart?: { fields?: Record<string, unknown>; fileField: string; filePath: string; contentType: string }; expectedStatuses: number[]; poll?: PollContract; capture?: Record<string, string> }
export interface ApiPhase { schemaVersion: 1; name: string; fixtureRoot: string; steps: ApiStep[] }

const methods = new Set(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
const runtimeName = /^STEP_[A-Z0-9_]+$/;

function interpolate(value: unknown, runtime: Map<string, string>): unknown {
  if (typeof value === 'string') return value.replace(/\$\{((?:LOAD|STEP)_[A-Z0-9_]+)\}/g, (_match, name) => {
    const resolved = name.startsWith('LOAD_') ? process.env[name] : runtime.get(name);
    if (resolved === undefined) throw new Error(`Missing phase value ${name}`);
    return resolved;
  });
  if (Array.isArray(value)) return value.map((nested) => interpolate(nested, runtime));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, interpolate(nested, runtime)]));
  return value;
}

function fixturePath(root: string, requested: string) {
  if (isAbsolute(requested)) throw new Error('Multipart fixture path must be relative');
  const path = resolve(root, requested);
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Multipart fixture escapes fixtureRoot');
  return path;
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined, value);
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return { text, json: null };
  try { return { text, json: JSON.parse(text) }; } catch { throw new Error(`Expected JSON response from ${response.url}`); }
}

function validatePhase(phase: ApiPhase) {
  if (phase?.schemaVersion !== 1 || !phase.name || !phase.fixtureRoot || !Array.isArray(phase.steps) || !phase.steps.length) throw new Error('Invalid API phase');
  const names = new Set<string>();
  for (const step of phase.steps) {
    if (!step.name || names.has(step.name)) throw new Error(`Duplicate or missing API step ${step.name || '<empty>'}`);
    names.add(step.name);
    if (!methods.has(step.method) || !step.path.startsWith('/') || !/^LOAD_[A-Z0-9_]+$/.test(step.tokenEnv)) throw new Error(`Invalid API step ${step.name}`);
    if (!step.expectedStatuses?.length || step.expectedStatuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) throw new Error(`Invalid expected statuses for ${step.name}`);
    if (step.json !== undefined && step.multipart) throw new Error(`Step ${step.name} cannot use JSON and multipart together`);
    if (step.poll && (step.method !== 'GET' || step.poll.intervalMs < 100 || step.poll.intervalMs > 60_000 || step.poll.timeoutMs < 1_000 || step.poll.timeoutMs > 900_000 || !step.poll.path || !step.poll.values.length)) throw new Error(`Invalid poll contract for ${step.name}`);
    for (const key of Object.keys(step.capture || {})) if (!runtimeName.test(key)) throw new Error(`Invalid capture name ${key}`);
  }
}

export async function runApiPhase(phase: ApiPhase, targetRaw: string) {
  validatePhase(phase);
  const target = assertLoadTestHttpTarget(targetRaw);
  const fixtureRoot = resolve(phase.fixtureRoot);
  const runtime = new Map<string, string>();
  const runId = process.env.LOAD_TEST_RUN_ID || randomUUID();
  const evidence: { schemaVersion: number; phase: string; target: string; startedAt: string; completedAt?: string; steps: Array<Record<string, unknown>> } = { schemaVersion: 1, phase: phase.name, target, startedAt: new Date().toISOString(), steps: [] };
  for (const step of phase.steps) {
    const token = process.env[step.tokenEnv];
    if (!token) throw new Error(`Missing token ${step.tokenEnv}`);
    const started = Date.now();
    const path = String(interpolate(step.path, runtime));
    const headers = new Headers({ Authorization: `Bearer ${token}`, 'X-Load-Test-Run': runId, 'Idempotency-Key': `${runId}:${phase.name}:${step.name}`, ...Object.fromEntries(Object.entries(step.headers || {}).map(([key, value]) => [key, String(interpolate(value, runtime))])) });
    let body: BodyInit | undefined;
    if (step.multipart) {
      const form = new FormData();
      for (const [key, value] of Object.entries(interpolate(step.multipart.fields || {}, runtime) as Record<string, unknown>)) form.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      const filePath = String(interpolate(step.multipart.filePath, runtime));
      const bytes = readFileSync(fixturePath(fixtureRoot, filePath));
      form.set(step.multipart.fileField, new Blob([bytes], { type: step.multipart.contentType }), filePath.split(/[\\/]/).pop());
      body = form;
    } else if (step.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(interpolate(step.json, runtime));
    }
    const execute = () => fetch(`${target}${path}`, { method: step.method, headers, body, signal: AbortSignal.timeout(Math.min(step.poll?.timeoutMs || 60_000, 900_000)) });
    let response = await execute();
    let payload = await responsePayload(response);
    if (!step.expectedStatuses.includes(response.status)) throw new Error(`${step.name} returned unexpected status ${response.status}`);
    if (step.poll) {
      const deadline = Date.now() + step.poll.timeoutMs;
      while (!step.poll.values.includes(readPath(payload.json, step.poll.path) as string | number | boolean)) {
        if (Date.now() >= deadline) throw new Error(`${step.name} polling timed out`);
        await new Promise((done) => setTimeout(done, step.poll!.intervalMs));
        response = await execute();
        payload = await responsePayload(response);
        if (!step.expectedStatuses.includes(response.status)) throw new Error(`${step.name} poll returned unexpected status ${response.status}`);
      }
    }
    const captured: string[] = [];
    for (const [key, jsonPath] of Object.entries(step.capture || {})) {
      const value = readPath(payload.json, jsonPath);
      if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`${step.name} capture ${key} is not scalar`);
      runtime.set(key, String(value));
      captured.push(key);
    }
    evidence.steps.push({ name: step.name, method: step.method, path: step.path.replace(/\$\{(?:LOAD|STEP)_[A-Z0-9_]+\}/g, ':value'), status: response.status, durationMs: Date.now() - started, responseBytes: Buffer.byteLength(payload.text), responseSha256: createHash('sha256').update(payload.text).digest('hex'), terminalValue: step.poll ? readPath(payload.json, step.poll.path) : undefined, captured });
  }
  evidence.completedAt = new Date().toISOString();
  return evidence;
}
