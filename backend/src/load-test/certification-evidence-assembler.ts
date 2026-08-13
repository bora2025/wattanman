import { createPublicKey, verify } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyCertificationEvidence } from './certification-evidence';

const operations = ['marketplace-publication', 'staged-update', 'backup', 'validation', 'migration'];
const failures = ['database-failover', 'redis-interruption', 'queue-backlog-worker-loss', 'r2-latency-failure', 'bad-extension-release', 'signing-key-revocation', 'abusive-school-extension'];

function json(path: string) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error: any) { throw new Error(`Cannot read certification artifact ${path}: ${error?.message || error}`); }
}

function assertIdentity(value: any, runId: string, target?: string) {
  if (value.runId !== runId) throw new Error('Certification artifact runId mismatch');
  if (target && value.target !== target) throw new Error('Certification artifact target mismatch');
}

export function readSignedCertificationApproval(path: string, publicKeyPem: string) {
  if (!publicKeyPem) throw new Error('LOAD_CERTIFICATION_APPROVAL_PUBLIC_KEY_PEM is required');
  const document = json(resolve(path));
  if (document?.payload?.schemaVersion !== 1 || !document.signature) throw new Error('Invalid certification approval document');
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(JSON.stringify(document.payload)), key, Buffer.from(document.signature, 'base64'))) throw new Error('Certification approval signature is invalid');
  const payload = document.payload;
  if (!/^[a-f0-9]{7,40}$/.test(payload.commit || '') || !payload.runId || payload.autoscaling?.matchesPolicy !== true || !payload.autoscaling?.policyReference || !Array.isArray(payload.evidenceReferences) || !payload.evidenceReferences.length || !payload.cost?.approvedBy || !payload.cost?.approvedAt || !payload.nextScalingThresholds || payload.nextScalingThresholds.length < 20) throw new Error('Certification approval is incomplete');
  return payload;
}

export function assembleCertificationEvidence(resultsDirectory: string, approvalPath: string, publicKeyPem: string) {
  const root = resolve(resultsDirectory);
  const approval = readSignedCertificationApproval(approvalPath, publicKeyPem);
  const runId = approval.runId;
  const provisioning = json(resolve(root, 'provisioning.json'));
  const sustained = json(resolve(root, 'sustained.json'));
  const burst = json(resolve(root, 'burst.json'));
  const limitEvidence = json(resolve(root, 'capacity-limits.json'));
  assertIdentity(provisioning, runId);
  for (const artifact of [sustained, burst, limitEvidence]) assertIdentity(artifact, runId, sustained.target);
  if (provisioning.outcome !== 'PROVISIONED' || provisioning.counts?.identities < 10_000) throw new Error('Provisioning evidence is incomplete');
  const trafficOperations = operations.map((name) => {
    const artifact = json(resolve(root, `${name}-api.json`));
    assertIdentity(artifact, runId, sustained.target);
    if (artifact.phase !== name || !artifact.completedAt || !artifact.steps?.length) throw new Error(`Traffic operation ${name} is incomplete`);
    return name;
  });
  const failureTests = failures.map((name) => {
    for (const [action, status] of [['inject', 'INJECTED'], ['recover', 'RECOVERED'], ['verify', 'VERIFIED']] as const) {
      const artifact = json(resolve(root, `${name}-${action}-chaos.json`));
      assertIdentity(artifact, runId);
      if (artifact.scenario !== name || artifact.action !== action || artifact.terminalStatus !== status) throw new Error(`Failure ${name} ${action} evidence is incomplete`);
    }
    const workload = json(resolve(root, `${name}-workload.json`));
    assertIdentity(workload, runId, sustained.target);
    return { name, executed: true, coreAvailabilityPct: workload.availabilityPct, tenantIsolationFailures: workload.tenantIsolationFailures };
  });
  const reports = ['sustained.json', 'burst.json', 'operations-workload.json', ...failures.map((name) => `${name}-workload.json`)].map((name) => json(resolve(root, name)));
  for (const report of reports) {
    assertIdentity(report, runId, sustained.target);
    if (typeof report.estimatedCostUsd !== 'number' || report.estimatedCostUsd < 0) throw new Error('Invalid load cost artifact');
  }
  const estimatedUsd = Number(reports.reduce((total, report) => total + report.estimatedCostUsd, 0).toFixed(4));
  const evidence = {
    schemaVersion: 1,
    runId,
    commit: approval.commit,
    target: sustained.target,
    fixture: { schools: provisioning.counts.schools, registeredUsers: provisioning.counts.users, fingerprint: provisioning.fingerprint },
    performance: {
      concurrentSessions: sustained.concurrentSessions,
      sustained: { rps: sustained.configuredRps, achievedRps: sustained.achievedRps, durationSeconds: sustained.durationMs / 1000, droppedIterations: sustained.droppedIterations, availabilityPct: sustained.availabilityPct, p95LatencyMs: sustained.p95LatencyMs, tenantIsolationFailures: sustained.tenantIsolationFailures },
      burst: { rps: burst.configuredRps, recovered: burst.burstRecoveryErrorRate !== null && burst.burstRecoveryErrorRate < 0.01 && burst.droppedIterations === 0, manualRepair: burst.manualRepair },
    },
    trafficOperations,
    failureTests,
    limits: limitEvidence.limits,
    autoscaling: approval.autoscaling,
    cost: { estimatedUsd, approvedBy: approval.cost.approvedBy, approvedAt: approval.cost.approvedAt },
    nextScalingThresholds: approval.nextScalingThresholds,
    evidenceReferences: approval.evidenceReferences,
  };
  const verification = verifyCertificationEvidence(evidence);
  return { evidence, verification };
}

export const certificationArtifactNames = { operations, failures };
