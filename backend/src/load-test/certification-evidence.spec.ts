import { verifyCertificationEvidence } from './certification-evidence';

function validEvidence() {
  return { schemaVersion: 1, runId: 'stage6-run-001', commit: 'abcdef1', target: 'https://perf.example.test', fixture: { schools: 1000, registeredUsers: 500000, fingerprint: 'a'.repeat(64) }, performance: { concurrentSessions: 10000, sustained: { rps: 1000, durationSeconds: 7200, availabilityPct: 99.95, p95LatencyMs: 800, tenantIsolationFailures: 0 }, burst: { rps: 3000, recovered: true, manualRepair: false } }, trafficOperations: ['marketplace-publication', 'staged-update', 'backup', 'validation', 'migration'], failureTests: ['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension'].map((name) => ({ name, executed: true, coreAvailabilityPct: 99.5, tenantIsolationFailures: 0 })), limits: { databasePoolMaxPct: 70, redisMemoryMaxPct: 60, queueOldestJobSeconds: 20, minimumWorkers: 1, r2ErrorRatePct: 0.1 }, autoscaling: { matchesPolicy: true }, cost: { estimatedUsd: 42, approvedBy: 'Reliability Owner' }, nextScalingThresholds: 'Scale database before pool utilization reaches 75%.' };
}

describe('Stage 6 certification evidence', () => {
  it('accepts complete evidence for every certification requirement', () => {
    expect(verifyCertificationEvidence(validEvidence())).toEqual(expect.objectContaining({ outcome: 'PASSED', requirements: 23, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it.each([
    ['production target', (value: any) => { value.target = 'https://wattaman.app'; }],
    ['short sustained run', (value: any) => { value.performance.sustained.durationSeconds = 7199; }],
    ['missing failure', (value: any) => { value.failureTests.pop(); }],
    ['tenant isolation failure', (value: any) => { value.performance.sustained.tenantIsolationFailures = 1; }],
    ['unapproved cost', (value: any) => { value.cost.approvedBy = ''; }],
  ])('rejects %s', (_name, mutate) => {
    const evidence = validEvidence(); mutate(evidence);
    expect(() => verifyCertificationEvidence(evidence)).toThrow();
  });
});
