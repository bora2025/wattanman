import { generateKeyPairSync, sign } from 'crypto';
import { resolve } from 'path';
import { approvalSigningPayload, prepareArchitectureReview, verifyArchitectureReview } from './architecture-review';

describe('architecture and security review evidence', () => {
  const root = resolve(process.cwd(), '..');
  const commit = 'abcdef1';

  it('requires recent review with no critical or high findings', () => {
    expect(prepareArchitectureReview(root, { schemaVersion: 1, decision: 'APPROVED', findings: { criticalOpen: 0, highOpen: 0 }, residualRisks: [], reviewedAt: new Date().toISOString() }, commit).artifacts.length).toBeGreaterThan(10);
    expect(() => prepareArchitectureReview(root, { schemaVersion: 1, decision: 'APPROVED', findings: { criticalOpen: 1, highOpen: 0 }, residualRisks: [], reviewedAt: new Date().toISOString() }, commit)).toThrow('incomplete');
  });

  it('requires independent valid architecture and security signatures', () => {
    const payload = prepareArchitectureReview(root, { schemaVersion: 1, decision: 'APPROVED', findings: { criticalOpen: 0, highOpen: 0 }, residualRisks: ['Monitor Stage 7 evidence.'], reviewedAt: new Date().toISOString() }, commit);
    const architecture = generateKeyPairSync('ed25519');
    const security = generateKeyPairSync('ed25519');
    const approvals = [
      { reviewerId: 'architect-1', role: 'ARCHITECTURE_OWNER', signedAt: new Date().toISOString(), signature: '' },
      { reviewerId: 'security-1', role: 'SECURITY_OWNER', signedAt: new Date().toISOString(), signature: '' },
    ];
    approvals[0].signature = sign(null, approvalSigningPayload(payload, approvals[0]), architecture.privateKey).toString('base64');
    approvals[1].signature = sign(null, approvalSigningPayload(payload, approvals[1]), security.privateKey).toString('base64');
    const registry = { schemaVersion: 1, reviewers: [
      { id: 'architect-1', role: 'ARCHITECTURE_OWNER', status: 'ACTIVE', publicKeyPem: architecture.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      { id: 'security-1', role: 'SECURITY_OWNER', status: 'ACTIVE', publicKeyPem: security.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    ] };
    expect(verifyArchitectureReview({ payload, approvals }, registry, root, commit)).toEqual(expect.objectContaining({ outcome: 'APPROVED', approvals: 2 }));
    approvals[1].reviewerId = 'architect-1';
    expect(() => verifyArchitectureReview({ payload, approvals }, registry, root, commit)).toThrow();
  });
});
