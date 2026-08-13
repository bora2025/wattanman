import { generateKeyPairSync, sign } from 'crypto';
import { gameDayApprovalPayload, prepareGameDayEvidence, verifyGameDayEvidence } from './game-day-evidence';

describe('human incident game-day evidence', () => {
  const now = new Date('2026-08-13T08:00:00.000Z');
  const participants = ['INCIDENT_COMMANDER', 'OPERATIONS_RESPONDER', 'COMMUNICATIONS_OWNER', 'OBSERVER'].map((role, index) => ({ id: `responder-${index}`, role }));
  const input = { schemaVersion: 1, environment: 'staging', scenario: 'DATABASE_RECOVERY', participants, timeline: { startedAt: '2026-08-13T07:00:00.000Z', detectedAt: '2026-08-13T07:03:00.000Z', containedAt: '2026-08-13T07:10:00.000Z', recoveredAt: '2026-08-13T07:30:00.000Z' }, measurements: { rpoSeconds: 300 }, expectedAlerts: ['DATABASE_UNAVAILABLE'], observedAlerts: ['DATABASE_UNAVAILABLE'], procedureSteps: ['database.declare', 'database.restore-isolated', 'database.verify'], findings: [{ severity: 'MEDIUM', status: 'OPEN', ownerId: 'responder-1' }], runbookOnly: true, productionFaultInjected: false, cleanupVerified: true };

  it('requires safe staging recovery within RPO and RTO', () => {
    expect(prepareGameDayEvidence(input, now)).toEqual(expect.objectContaining({ measurements: { rpoSeconds: 300, rtoSeconds: 1800 } }));
    expect(() => prepareGameDayEvidence({ ...input, productionFaultInjected: true }, now)).toThrow('staging');
    expect(() => prepareGameDayEvidence({ ...input, measurements: { rpoSeconds: 901 } }, now)).toThrow('15 minute RPO');
  });

  it('requires commander and observer participant signatures', () => {
    const payload = prepareGameDayEvidence(input, now);
    const roles = ['INCIDENT_COMMANDER', 'OBSERVER'];
    const keys = roles.map(() => generateKeyPairSync('ed25519'));
    const approvals: any[] = roles.map((role) => ({ reviewerId: participants.find((item) => item.role === role)!.id, role, signedAt: now.toISOString(), signature: '' }));
    approvals.forEach((approval, index) => { approval.signature = sign(null, gameDayApprovalPayload(payload, approval), keys[index].privateKey).toString('base64'); });
    const registry = { schemaVersion: 1, reviewers: approvals.map((approval, index) => ({ id: approval.reviewerId, role: approval.role, status: 'ACTIVE', publicKeyPem: keys[index].publicKey.export({ type: 'spki', format: 'pem' }).toString() })) };
    expect(verifyGameDayEvidence({ payload, approvals }, registry, now)).toEqual(expect.objectContaining({ outcome: 'VERIFIED', participants: 4 }));
  });
});
