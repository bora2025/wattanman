import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, isAbsolute, relative, resolve } from 'path';
import { spawn } from 'child_process';

export interface CommandStep { name: string; executable: string; args: string[]; timeoutMs: number; env?: Record<string, string>; evidenceFile: string }
export interface FailurePhase { name: string; inject: CommandStep; workload: CommandStep; recover: CommandStep; verify: CommandStep }
export interface ConcurrentTrafficPhase { name: string; workload: CommandStep; operations: CommandStep[] }
export interface CertificationManifest { schemaVersion: 1; runId: string; target: string; resultsDirectory: string; fixture: CommandStep; traffic: CommandStep[]; concurrentTraffic: ConcurrentTrafficPhase; failures: FailurePhase[] }

const REQUIRED_TRAFFIC = new Set(['sustained', 'burst', 'limits']);
const REQUIRED_OPERATIONS = new Set(['marketplace-publication', 'staged-update', 'backup', 'validation', 'migration']);
const REQUIRED_FAILURES = new Set(['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension']);

function approvedTarget(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (['wattaman.app', 'wattanman.app'].includes(host) || host.endsWith('.wattaman.app') || host.endsWith('.wattanman.app') || host.endsWith('.up.railway.app')) throw new Error(`Production target ${host} is forbidden`);
  if (!(host === 'localhost' || host === '127.0.0.1' || /(loadtest|performance|perf|staging)/.test(host))) throw new Error(`Target ${host} is not an approved performance environment`);
  return url.origin;
}

function pathInside(root: string, requested: string) {
  if (isAbsolute(requested)) throw new Error('Evidence paths must be relative');
  const path = resolve(root, requested);
  const fromRoot = relative(root, path);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error('Evidence path escapes the results directory');
  return path;
}

function validateStep(step: CommandStep, resultsRoot: string) {
  if (!step?.name || !step.executable || !Array.isArray(step.args) || !step.evidenceFile) throw new Error('Invalid command step');
  if (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1_000 || step.timeoutMs > 3 * 60 * 60_000) throw new Error(`${step.name} timeout is outside 1 second to 3 hours`);
  const normalizeExecutable = (value: string) => basename(value).toLowerCase().replace(/\.exe$/, '');
  const allowed = new Set((process.env.LOAD_TEST_ALLOWED_EXECUTABLES || 'k6,node,npm.cmd').split(',').map((value) => normalizeExecutable(value.trim())));
  if (!allowed.has(normalizeExecutable(step.executable))) throw new Error(`${step.name} executable is not allowlisted`);
  pathInside(resultsRoot, step.evidenceFile);
  for (const [name, value] of Object.entries(step.env || {})) {
    if (!/^LOAD_[A-Z0-9_]+$/.test(name) || typeof value !== 'string') throw new Error(`${step.name} has unsafe environment override ${name}`);
  }
}

export function validateCertificationManifest(input: CertificationManifest) {
  if (input?.schemaVersion !== 1 || !/^[a-zA-Z0-9._-]{8,100}$/.test(input.runId || '')) throw new Error('Invalid certification manifest identity');
  approvedTarget(input.target);
  if (process.env.LOAD_TEST_AUTHORIZATION !== 'I_ACKNOWLEDGE_NON_PRODUCTION_ONLY') throw new Error('LOAD_TEST_AUTHORIZATION acknowledgement is required');
  const resultsRoot = resolve(input.resultsDirectory);
  validateStep(input.fixture, resultsRoot);
  for (const step of input.traffic || []) validateStep(step, resultsRoot);
  for (const name of REQUIRED_TRAFFIC) if (!input.traffic.some((step) => step.name === name)) throw new Error(`Missing traffic phase ${name}`);
  if (input.concurrentTraffic?.name !== 'operations-during-traffic') throw new Error('Missing operations-during-traffic phase');
  validateStep(input.concurrentTraffic.workload, resultsRoot);
  for (const step of input.concurrentTraffic.operations || []) validateStep(step, resultsRoot);
  for (const name of REQUIRED_OPERATIONS) if (!input.concurrentTraffic.operations.some((step) => step.name === name)) throw new Error(`Missing concurrent operation ${name}`);
  for (const phase of input.failures || []) for (const step of [phase.inject, phase.workload, phase.recover, phase.verify]) validateStep(step, resultsRoot);
  for (const name of REQUIRED_FAILURES) if (!input.failures.some((phase) => phase.name === name)) throw new Error(`Missing failure phase ${name}`);
  return { resultsRoot, target: approvedTarget(input.target) };
}

async function runStep(step: CommandStep, context: { resultsRoot: string; target: string; runId: string }) {
  const evidencePath = pathInside(context.resultsRoot, step.evidenceFile);
  const startedAt = new Date();
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const child = spawn(step.executable, step.args, {
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...step.env, LOAD_TEST_TARGET: context.target, LOAD_TEST_RUN_ID: context.runId },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { if (Buffer.concat(output).length < 1_000_000) output.push(Buffer.from(chunk)); });
  child.stderr.on('data', (chunk) => { if (Buffer.concat(errors).length < 1_000_000) errors.push(Buffer.from(chunk)); });
  const timer = setTimeout(() => child.kill('SIGKILL'), step.timeoutMs);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => done({ code, signal }));
  }).finally(() => clearTimeout(timer));
  const evidence = { name: step.name, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.getTime(), exitCode: result.code, signal: result.signal, stdoutSha256: createHash('sha256').update(Buffer.concat(output)).digest('hex'), stderrSha256: createHash('sha256').update(Buffer.concat(errors)).digest('hex') };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  if (result.code !== 0) throw new Error(`${step.name} failed with exit code ${result.code ?? result.signal}`);
  return evidence;
}

export async function runCertificationManifest(input: CertificationManifest) {
  const validated = validateCertificationManifest(input);
  mkdirSync(validated.resultsRoot, { recursive: true });
  const context = { ...validated, runId: input.runId };
  const evidence: any = { schemaVersion: 1, runId: input.runId, target: validated.target, startedAt: new Date().toISOString(), fixture: null, traffic: [], concurrentTraffic: null, failures: [] };
  evidence.fixture = await runStep(input.fixture, context);
  for (const step of input.traffic) evidence.traffic.push(await runStep(step, context));
  const concurrent = await Promise.all([
    runStep(input.concurrentTraffic.workload, context),
    ...input.concurrentTraffic.operations.map((step) => runStep(step, context)),
  ]);
  evidence.concurrentTraffic = { name: input.concurrentTraffic.name, workload: concurrent[0], operations: concurrent.slice(1) };
  for (const phase of input.failures) {
    const result: any = { name: phase.name, inject: null, workload: null, recover: null, verify: null };
    try {
      result.inject = await runStep(phase.inject, context);
      result.workload = await runStep(phase.workload, context);
    } finally {
      result.recover = await runStep(phase.recover, context);
    }
    result.verify = await runStep(phase.verify, context);
    evidence.failures.push(result);
  }
  evidence.completedAt = new Date().toISOString();
  const reportPath = pathInside(validated.resultsRoot, 'orchestration.json');
  writeFileSync(reportPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

export function readCertificationManifest(path: string) {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as CertificationManifest;
}
