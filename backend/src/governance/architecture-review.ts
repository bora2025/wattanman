import { createHash, createPublicKey, verify } from 'crypto';
import { readFileSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

export const requiredArchitectureReviewArtifacts = [
  'README.md',
  'docs/architecture-governance.md',
  'docs/data-classification-retention.md',
  'docs/extension-threat-model.md',
  'docs/platform-1000-schools-roadmap.md',
  'docs/platform-1000-schools-todo.md',
  'docs/adr/0001-tenant-domain-resolution.md',
  'docs/adr/0002-postgresql-row-level-security.md',
  'docs/adr/0003-redis-and-durable-queues.md',
  'docs/adr/0004-service-separation.md',
  'docs/adr/0005-declarative-extension-api-v1.md',
  'docs/adr/0006-backup-retention-and-deletion.md',
];

function artifact(root: string, requested: string) {
  if (isAbsolute(requested)) throw new Error('Review artifact path must be relative');
  const path = resolve(root, requested);
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Review artifact escapes repository root');
  return { path: requested.replace(/\\/g, '/'), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
}

export function prepareArchitectureReview(root: string, input: any, commit: string) {
  if (!/^[a-f0-9]{7,40}$/.test(commit)) throw new Error('A git commit is required');
  if (input?.schemaVersion !== 1 || input.decision !== 'APPROVED' || input.findings?.criticalOpen !== 0 || input.findings?.highOpen !== 0 || !Array.isArray(input.residualRisks) || typeof input.reviewedAt !== 'string') throw new Error('Architecture review input is incomplete');
  const reviewedAt = Date.parse(input.reviewedAt);
  if (!Number.isFinite(reviewedAt) || reviewedAt > Date.now() + 5 * 60_000 || reviewedAt < Date.now() - 30 * 24 * 60 * 60_000) throw new Error('Architecture review date must be within the last 30 days');
  return { schemaVersion: 1, commit, decision: 'APPROVED', findings: { criticalOpen: 0, highOpen: 0 }, residualRisks: input.residualRisks, reviewedAt: new Date(reviewedAt).toISOString(), artifacts: requiredArchitectureReviewArtifacts.map((path) => artifact(root, path)) };
}

export function approvalSigningPayload(payload: unknown, approval: { reviewerId: string; role: string; signedAt: string }) {
  return Buffer.from(JSON.stringify({ payload, reviewerId: approval.reviewerId, role: approval.role, signedAt: approval.signedAt }));
}

export function verifyArchitectureReview(document: any, registry: any, root: string, currentCommit: string) {
  const payload = document?.payload;
  if (payload?.schemaVersion !== 1 || payload.commit !== currentCommit || payload.decision !== 'APPROVED' || payload.findings?.criticalOpen !== 0 || payload.findings?.highOpen !== 0) throw new Error('Architecture review payload is invalid or stale');
  const expectedArtifacts = requiredArchitectureReviewArtifacts.map((path) => artifact(root, path));
  if (JSON.stringify(payload.artifacts) !== JSON.stringify(expectedArtifacts)) throw new Error('Architecture review artifacts changed after approval');
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.reviewers)) throw new Error('Architecture reviewer registry is invalid');
  const approvals = Array.isArray(document.approvals) ? document.approvals : [];
  const requiredRoles = ['ARCHITECTURE_OWNER', 'SECURITY_OWNER'];
  const identities = new Set<string>();
  for (const role of requiredRoles) {
    const approval = approvals.find((item: any) => item.role === role);
    if (!approval || identities.has(approval.reviewerId) || !approval.signature || !approval.signedAt) throw new Error(`Missing independent ${role} approval`);
    const reviewer = registry.reviewers.find((item: any) => item.id === approval.reviewerId && item.role === role && item.status === 'ACTIVE');
    if (!reviewer) throw new Error(`Reviewer ${approval.reviewerId} is not trusted for ${role}`);
    const signedAt = Date.parse(approval.signedAt);
    if (!Number.isFinite(signedAt) || signedAt < Date.parse(payload.reviewedAt) || signedAt > Date.now() + 5 * 60_000) throw new Error(`${role} signature time is invalid`);
    const key = createPublicKey(reviewer.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, approvalSigningPayload(payload, approval), key, Buffer.from(approval.signature, 'base64'))) throw new Error(`${role} approval signature is invalid`);
    identities.add(approval.reviewerId);
  }
  return { outcome: 'APPROVED', commit: payload.commit, reviewedAt: payload.reviewedAt, approvals: requiredRoles.length, artifactCount: expectedArtifacts.length, checksum: createHash('sha256').update(JSON.stringify(document)).digest('hex') };
}
