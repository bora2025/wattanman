import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OperationalAlertService } from '../platform/operational-alert.service';

const startedAt = Date.now();
const root = resolve(process.cwd(), '..');
const runbooks = [
  'extension-incident-runbook.md',
  'database-incident-runbook.md',
  'redis-queue-incident-runbook.md',
  'r2-incident-runbook.md',
  'signing-key-compromise-runbook.md',
  'tenant-isolation-incident-runbook.md',
];
const requiredConcepts = ['Owner', 'Containment', 'Recovery', 'Verification'];

for (const file of runbooks) {
  const body = readFileSync(resolve(root, 'docs', file), 'utf8');
  for (const concept of requiredConcepts) {
    if (!body.toLowerCase().includes(concept.toLowerCase())) throw new Error(`${file} is missing ${concept}`);
  }
  if (/PRIVATE KEY-----|postgres(?:ql)?:\/\/[^<\s]+:[^<\s]+@|redis:\/\/[^<\s]+:[^<\s]+@/i.test(body)) {
    throw new Error(`${file} appears to contain secret material`);
  }
}

const evaluator = Object.create(OperationalAlertService.prototype) as OperationalAlertService;
const scenarios = [
  { name: 'database-outage', snapshot: { api: {}, dependencies: { database: { status: 'unhealthy', latencyMs: 5000 } }, queues: [] }, expected: 'DEPENDENCY_HEALTH:DATABASE' },
  { name: 'redis-outage', snapshot: { api: {}, dependencies: { redis: { status: 'unhealthy' } }, queues: [] }, expected: 'DEPENDENCY_HEALTH:REDIS' },
  { name: 'r2-outage', snapshot: { api: {}, dependencies: { r2: { status: 'unhealthy' } }, queues: [] }, expected: 'DEPENDENCY_HEALTH:R2' },
  { name: 'queue-no-workers', snapshot: { api: {}, dependencies: {}, queues: [{ queue: 'operations', workers: 0, depth: 3, oldestJobAgeMs: 1000, counts: { failed: 0 } }] }, expected: 'QUEUE_HEALTH:OPERATIONS' },
  { name: 'api-slo-breach', snapshot: { api: { requests: 200, availability: 98, p95LatencyMs: 3000, errorRate: 2, windowMinutes: 15 }, dependencies: {}, queues: [] }, expected: 'API_SLO:PLATFORM' },
];

const evidence = scenarios.map((scenario) => {
  const alerts = evaluator.evaluate(scenario.snapshot);
  const alert = alerts.find((candidate) => candidate.fingerprint === scenario.expected);
  if (!alert || alert.route !== 'PAGE' || alert.severity !== 'CRITICAL') throw new Error(`${scenario.name} did not produce the required critical page`);
  return { scenario: scenario.name, fingerprint: alert.fingerprint, route: alert.route, severity: alert.severity };
});

process.stdout.write(`${JSON.stringify({ outcome: 'PASSED', runbooks: runbooks.length, scenarios: evidence, durationMs: Date.now() - startedAt, completedAt: new Date().toISOString() })}\n`);
