import { generateKeyPairSync, sign } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assembleCertificationEvidence, certificationArtifactNames } from './certification-evidence-assembler';

describe('certification evidence assembler', () => {
  const runId = 'stage6-run-001';
  const target = 'https://perf.example.test';
  let root: string;
  let approvalPath: string;
  let publicKeyPem: string;

  const write = (name: string, value: unknown) => writeFileSync(join(root, name), JSON.stringify(value));
  const report = (profile: string, overrides: any = {}) => ({ schemaVersion: 1, runId, target, profile, configuredRps: profile === 'burst' ? 3000 : 1000, concurrentSessions: 10000, achievedRps: 999.5, durationMs: profile === 'peak' ? 7_200_000 : 1_020_000, availabilityPct: 99.95, p95LatencyMs: 800, droppedIterations: 0, tenantIsolationFailures: 0, burstRecoveryErrorRate: profile === 'burst' ? 0 : null, manualRepair: false, estimatedCostUsd: 1, ...overrides });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'certification-artifacts-'));
    write('provisioning.json', { schemaVersion: 1, runId, outcome: 'PROVISIONED', counts: { schools: 1000, users: 500000, identities: 10000 }, fingerprint: 'a'.repeat(64) });
    write('sustained.json', report('peak'));
    write('burst.json', report('burst'));
    write('operations-workload.json', report('normal'));
    write('capacity-limits.json', { schemaVersion: 1, runId, target, limits: { databasePoolMaxPct: 70, redisMemoryMaxPct: 60, queueOldestJobSeconds: 20, minimumWorkers: 1, r2ErrorRatePct: 0.1 } });
    for (const name of certificationArtifactNames.operations) write(`${name}-api.json`, { schemaVersion: 1, runId, target, phase: name, completedAt: new Date().toISOString(), steps: [{ status: 200 }] });
    for (const name of certificationArtifactNames.failures) {
      for (const [action, terminalStatus] of [['inject', 'INJECTED'], ['recover', 'RECOVERED'], ['verify', 'VERIFIED']]) write(`${name}-${action}-chaos.json`, { schemaVersion: 1, runId, scenario: name, action, terminalStatus });
      write(`${name}-workload.json`, report('failure', { availabilityPct: 99.5 }));
    }
    const keys = generateKeyPairSync('ed25519');
    publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const payload = { schemaVersion: 1, runId, commit: 'abcdef1', autoscaling: { matchesPolicy: true, policyReference: 'perf-policy-v1' }, cost: { approvedBy: 'Reliability Owner', approvedAt: new Date().toISOString() }, nextScalingThresholds: 'Scale database before connection utilization reaches 75 percent.', evidenceReferences: ['metrics://stage6-run-001'] };
    approvalPath = join(root, 'approval.json');
    writeFileSync(approvalPath, JSON.stringify({ payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), keys.privateKey).toString('base64') }));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('assembles only measured artifacts and verifies all gates', () => {
    const result = assembleCertificationEvidence(root, approvalPath, publicKeyPem);
    expect(result.verification.outcome).toBe('PASSED');
    expect(result.evidence.fixture.registeredUsers).toBe(500000);
    expect(result.evidence.failureTests).toHaveLength(7);
    expect(result.evidence.cost.estimatedUsd).toBe(10);
  });

  it('rejects tampered approval', () => {
    const document = JSON.parse(require('fs').readFileSync(approvalPath, 'utf8'));
    document.payload.autoscaling.matchesPolicy = false;
    writeFileSync(approvalPath, JSON.stringify(document));
    expect(() => assembleCertificationEvidence(root, approvalPath, publicKeyPem)).toThrow('signature is invalid');
  });

  it('rejects mismatched artifact identity', () => {
    write('burst.json', report('burst', { runId: 'another-run' }));
    expect(() => assembleCertificationEvidence(root, approvalPath, publicKeyPem)).toThrow('runId mismatch');
  });
});
