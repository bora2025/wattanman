import { generateKeyPairSync, sign } from 'crypto';
import { prepareRecoveryEvidence, recoveryApprovalPayload, verifyRecoveryEvidence } from './recovery-evidence';

describe('provider recovery evidence', () => {
  const now = new Date('2026-08-13T08:00:00.000Z');
  const input = {
    schemaVersion: 1, provider: 'RAILWAY', environment: 'production',
    projectId: 'c0333bd1-a9aa-4b2d-b284-e2f0721e9051', databaseServiceId: 'bbe93cb9-d851-4fc0-8edd-f527ba7913b4', changeTicket: 'RECOVERY-2026-08', observedAt: now.toISOString(),
    pitr: { enabled: true, retentionHours: 168, latestRecoveryPointAt: '2026-08-13T07:50:00.000Z' },
    backup: { encrypted: true, verified: true, latestCompletedAt: '2026-08-13T02:00:00.000Z' },
    rehearsal: { isolated: true, integrityVerified: true, cleanupVerified: true, startedAt: '2026-08-13T07:00:00.000Z', sourceRecoveryPointAt: '2026-08-13T06:50:00.000Z', recoveredAt: '2026-08-13T07:30:00.000Z' },
  };

  it('derives and enforces measured RPO and RTO', () => {
    expect(prepareRecoveryEvidence(input, now)).toEqual(expect.objectContaining({ rehearsal: expect.objectContaining({ rpoSeconds: 600, rtoSeconds: 1800 }) }));
    expect(() => prepareRecoveryEvidence({ ...input, pitr: { ...input.pitr, latestRecoveryPointAt: '2026-08-13T07:40:00.000Z' } }, now)).toThrow('15 minute RPO');
    expect(() => prepareRecoveryEvidence({ ...input, rehearsal: { ...input.rehearsal, recoveredAt: '2026-08-13T08:01:00.000Z' } }, now)).toThrow('RPO or RTO');
  });

  it('requires independent infrastructure and reliability signatures', () => {
    const payload = prepareRecoveryEvidence(input, now);
    const infrastructure = generateKeyPairSync('ed25519');
    const reliability = generateKeyPairSync('ed25519');
    const approvals: any[] = [
      { reviewerId: 'infra-1', role: 'INFRASTRUCTURE_OWNER', signedAt: now.toISOString(), signature: '' },
      { reviewerId: 'reliability-1', role: 'RELIABILITY_OWNER', signedAt: now.toISOString(), signature: '' },
    ];
    approvals[0].signature = sign(null, recoveryApprovalPayload(payload, approvals[0]), infrastructure.privateKey).toString('base64');
    approvals[1].signature = sign(null, recoveryApprovalPayload(payload, approvals[1]), reliability.privateKey).toString('base64');
    const registry = { schemaVersion: 1, reviewers: [
      { id: 'infra-1', role: 'INFRASTRUCTURE_OWNER', status: 'ACTIVE', publicKeyPem: infrastructure.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      { id: 'reliability-1', role: 'RELIABILITY_OWNER', status: 'ACTIVE', publicKeyPem: reliability.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    ] };
    expect(verifyRecoveryEvidence({ payload, approvals }, registry, now)).toEqual(expect.objectContaining({ outcome: 'VERIFIED', rpoSeconds: 600, rtoSeconds: 1800 }));
    approvals[1].reviewerId = 'infra-1';
    expect(() => verifyRecoveryEvidence({ payload, approvals }, registry, now)).toThrow('independent');
  });
});
