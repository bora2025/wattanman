import { createHash } from 'crypto';

const REQUIRED_TRAFFIC_OPERATIONS = ['marketplace-publication', 'staged-update', 'backup', 'validation', 'migration'];
const REQUIRED_FAILURES = ['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension'];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function verifyCertificationEvidence(input: any) {
  assert(input?.schemaVersion === 1, 'Unsupported certification evidence schema');
  assert(typeof input.runId === 'string' && input.runId.length >= 8, 'runId is required');
  assert(typeof input.commit === 'string' && /^[a-f0-9]{7,40}$/.test(input.commit), 'A git commit is required');
  const host = new URL(input.target).hostname.toLowerCase();
  assert(!['wattaman.app', 'wattanman.app'].includes(host) && !host.endsWith('.wattaman.app') && !host.endsWith('.wattanman.app') && !host.endsWith('.up.railway.app'), 'Production and Railway public targets are forbidden');
  assert(/(loadtest|performance|perf|staging)|localhost|127\.0\.0\.1/.test(host), 'Evidence target is not an approved performance environment');
  assert(input.fixture?.schools >= 1000, 'At least 1,000 schools must be provisioned');
  assert(input.fixture?.registeredUsers >= 500_000, 'At least 500,000 users must be registered');
  assert(input.fixture?.fingerprint && /^[a-f0-9]{64}$/.test(input.fixture.fingerprint), 'Fixture fingerprint is required');
  assert(input.performance?.concurrentSessions >= 10_000, 'At least 10,000 concurrent sessions are required');
  const sustained = input.performance?.sustained;
  assert(sustained?.rps >= 1000 && sustained?.durationSeconds >= 7200, 'Sustained test must run 1,000 RPS for two hours');
  assert(sustained?.achievedRps >= 990 && sustained?.droppedIterations === 0 && sustained?.availabilityPct >= 99.9 && sustained?.p95LatencyMs < 1000 && sustained?.tenantIsolationFailures === 0, 'Sustained test failed throughput, SLO, or isolation gates');
  const burst = input.performance?.burst;
  assert(burst?.rps >= 3000 && burst?.recovered === true && burst?.manualRepair === false, 'Burst must reach 3,000 RPS and recover automatically');
  for (const operation of REQUIRED_TRAFFIC_OPERATIONS) assert(input.trafficOperations?.includes(operation), `Missing traffic operation ${operation}`);
  for (const failure of REQUIRED_FAILURES) {
    const result = input.failureTests?.find((item: any) => item.name === failure);
    assert(result?.executed === true && result?.coreAvailabilityPct >= 99 && result?.tenantIsolationFailures === 0, `Failure scenario ${failure} did not meet degradation limits`);
  }
  const limits = input.limits;
  assert(limits?.databasePoolMaxPct < 85, 'Database pool exceeded 85%');
  assert(limits?.redisMemoryMaxPct < 85, 'Redis memory exceeded 85%');
  assert(limits?.queueOldestJobSeconds < 300 && limits?.minimumWorkers >= 1, 'Queue or worker limits failed');
  assert(limits?.r2ErrorRatePct < 1, 'R2 error rate exceeded 1%');
  assert(input.autoscaling?.matchesPolicy === true, 'Autoscaling behavior did not match policy');
  assert(input.cost?.estimatedUsd >= 0 && typeof input.cost?.approvedBy === 'string' && input.cost.approvedBy.length > 2, 'Capacity cost report requires approval');
  assert(typeof input.nextScalingThresholds === 'string' && input.nextScalingThresholds.length >= 20, 'Next scaling thresholds are required');
  const canonical = JSON.stringify(input);
  return { outcome: 'PASSED', runId: input.runId, checksum: createHash('sha256').update(canonical).digest('hex'), requirements: 23 };
}

export const certificationRequirements = { trafficOperations: REQUIRED_TRAFFIC_OPERATIONS, failureTests: REQUIRED_FAILURES };
