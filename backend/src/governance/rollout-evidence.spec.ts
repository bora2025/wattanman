import { generateKeyPairSync, sign } from 'crypto';
import { prepareRolloutEvidence, rolloutApprovalPayload, verifyRolloutEvidence } from './rollout-evidence';

describe('controlled production rollout evidence', () => {
  const now = new Date('2026-08-13T08:00:00.000Z');
  const targets = [['INTERNAL', 2], ['PILOT_10', 10], ['SCHOOLS_50', 50], ['SCHOOLS_250', 250], ['SCHOOLS_500', 500], ['SCHOOLS_1000', 1000]] as const;
  const waves = targets.map(([name, schoolCount], index) => {
    const endedAt = new Date(now.getTime() - (targets.length - index - 1) * 8 * 24 * 60 * 60_000);
    return { name, schoolCount, startedAt: new Date(endedAt.getTime() - (index ? 7 : 1) * 24 * 60 * 60_000).toISOString(), endedAt: endedAt.toISOString(), reviews: { slo: true, support: true, security: true, cost: true, rollbackReady: true }, tenantIsolationFailures: 0, criticalIncidents: 0, changeTicket: `ROLLOUT-${index + 1}` };
  });
  const input = { schemaVersion: 1, environment: 'production', observedAt: now.toISOString(), waves, final: { operatingLimitsPublished: true, supportProceduresPublished: true, operatingLimitsUri: 'https://ops.example/limits', supportProceduresUri: 'https://ops.example/support' } };

  it('requires ordered exact cohorts and seven stable days', () => {
    expect(prepareRolloutEvidence(input, now).waves[5]).toEqual(expect.objectContaining({ schoolCount: 1000, stableSeconds: 604800 }));
    const invalid: any = structuredClone(input);
    invalid.waves[1].schoolCount = 9;
    expect(() => prepareRolloutEvidence(invalid, now)).toThrow('invalid school count');
    invalid.waves[1].schoolCount = 10;
    invalid.waves[1].startedAt = new Date(Date.parse(invalid.waves[1].endedAt) - 6 * 24 * 60 * 60_000).toISOString();
    expect(() => prepareRolloutEvidence(invalid, now)).toThrow('seven stable days');
  });

  it('requires three independent signed approvals', () => {
    const payload = prepareRolloutEvidence(input, now);
    const roles = ['PRODUCT_OWNER', 'RELIABILITY_OWNER', 'SECURITY_OWNER'];
    const keys = roles.map(() => generateKeyPairSync('ed25519'));
    const approvals: any[] = roles.map((role, index) => ({ reviewerId: `reviewer-${index}`, role, signedAt: now.toISOString(), signature: '' }));
    approvals.forEach((approval, index) => { approval.signature = sign(null, rolloutApprovalPayload(payload, approval), keys[index].privateKey).toString('base64'); });
    const registry = { schemaVersion: 1, reviewers: roles.map((role, index) => ({ id: `reviewer-${index}`, role, status: 'ACTIVE', publicKeyPem: keys[index].publicKey.export({ type: 'spki', format: 'pem' }).toString() })) };
    expect(verifyRolloutEvidence({ payload, approvals }, registry, now)).toEqual(expect.objectContaining({ outcome: 'VERIFIED', schools: 1000, waves: 6 }));
  });
});
