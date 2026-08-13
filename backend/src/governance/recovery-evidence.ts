import { createHash, createPublicKey, verify } from 'crypto';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function timestamp(value: unknown, name: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO timestamp`);
  return parsed;
}

export function prepareRecoveryEvidence(input: any, now = new Date()) {
  if (input?.schemaVersion !== 1 || input.provider !== 'RAILWAY' || input.environment !== 'production') throw new Error('Recovery evidence provider or environment is invalid');
  if (!UUID.test(input.projectId || '') || !UUID.test(input.databaseServiceId || '')) throw new Error('Recovery evidence requires Railway project and database service IDs');
  const observedAt = timestamp(input.observedAt, 'observedAt');
  if (observedAt > now.getTime() + 5 * 60_000 || observedAt < now.getTime() - 7 * 24 * 60 * 60_000) throw new Error('Recovery evidence must be observed within the last seven days');
  if (input.pitr?.enabled !== true || !Number.isInteger(input.pitr.retentionHours) || input.pitr.retentionHours < 24) throw new Error('PITR must be enabled with at least 24 hours retention');
  const latestRecoveryPointAt = timestamp(input.pitr.latestRecoveryPointAt, 'pitr.latestRecoveryPointAt');
  const recoveryPointLagSeconds = Math.max(0, Math.ceil((observedAt - latestRecoveryPointAt) / 1000));
  if (recoveryPointLagSeconds > 15 * 60) throw new Error('PITR recovery point exceeds the 15 minute RPO');
  if (input.backup?.encrypted !== true || input.backup?.verified !== true) throw new Error('Latest database backup must be encrypted and verified');
  const latestBackupAt = timestamp(input.backup.latestCompletedAt, 'backup.latestCompletedAt');
  if (observedAt - latestBackupAt > 24 * 60 * 60_000 || latestBackupAt > observedAt + 5 * 60_000) throw new Error('Latest verified database backup is stale');
  const startedAt = timestamp(input.rehearsal?.startedAt, 'rehearsal.startedAt');
  const sourceRecoveryPointAt = timestamp(input.rehearsal?.sourceRecoveryPointAt, 'rehearsal.sourceRecoveryPointAt');
  const recoveredAt = timestamp(input.rehearsal?.recoveredAt, 'rehearsal.recoveredAt');
  const rpoSeconds = Math.max(0, Math.ceil((startedAt - sourceRecoveryPointAt) / 1000));
  const rtoSeconds = Math.max(0, Math.ceil((recoveredAt - startedAt) / 1000));
  if (rpoSeconds > 15 * 60 || rtoSeconds > 60 * 60) throw new Error('Recovery rehearsal exceeds approved RPO or RTO');
  if (input.rehearsal?.isolated !== true || input.rehearsal?.integrityVerified !== true || input.rehearsal?.cleanupVerified !== true) throw new Error('Recovery rehearsal isolation, integrity, and cleanup must pass');
  if (!/^[A-Z][A-Z0-9_-]{2,49}$/.test(input.changeTicket || '')) throw new Error('Recovery evidence requires a bounded change ticket');
  return {
    schemaVersion: 1,
    provider: 'RAILWAY',
    environment: 'production',
    projectId: input.projectId,
    databaseServiceId: input.databaseServiceId,
    changeTicket: input.changeTicket,
    observedAt: new Date(observedAt).toISOString(),
    pitr: { enabled: true, retentionHours: input.pitr.retentionHours, latestRecoveryPointAt: new Date(latestRecoveryPointAt).toISOString(), recoveryPointLagSeconds },
    backup: { encrypted: true, verified: true, latestCompletedAt: new Date(latestBackupAt).toISOString() },
    rehearsal: { isolated: true, integrityVerified: true, cleanupVerified: true, startedAt: new Date(startedAt).toISOString(), sourceRecoveryPointAt: new Date(sourceRecoveryPointAt).toISOString(), recoveredAt: new Date(recoveredAt).toISOString(), rpoSeconds, rtoSeconds },
  };
}

export function recoveryApprovalPayload(payload: unknown, approval: { reviewerId: string; role: string; signedAt: string }) {
  return Buffer.from(JSON.stringify({ payload, reviewerId: approval.reviewerId, role: approval.role, signedAt: approval.signedAt }));
}

export function verifyRecoveryEvidence(document: any, registry: any, now = new Date()) {
  const payload = prepareRecoveryEvidence(document?.payload, now);
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.reviewers)) throw new Error('Recovery reviewer registry is invalid');
  const identities = new Set<string>();
  for (const role of ['INFRASTRUCTURE_OWNER', 'RELIABILITY_OWNER']) {
    const approval = document?.approvals?.find((item: any) => item.role === role);
    if (!approval || identities.has(approval.reviewerId)) throw new Error(`Missing independent ${role} approval`);
    const reviewer = registry.reviewers.find((item: any) => item.id === approval.reviewerId && item.role === role && item.status === 'ACTIVE');
    if (!reviewer) throw new Error(`Reviewer is not trusted for ${role}`);
    const signedAt = timestamp(approval.signedAt, `${role}.signedAt`);
    if (signedAt < Date.parse(payload.observedAt) || signedAt > now.getTime() + 5 * 60_000) throw new Error(`${role} signature time is invalid`);
    const key = createPublicKey(reviewer.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, recoveryApprovalPayload(payload, approval), key, Buffer.from(approval.signature || '', 'base64'))) throw new Error(`${role} signature is invalid`);
    identities.add(approval.reviewerId);
  }
  return { outcome: 'VERIFIED', provider: payload.provider, projectId: payload.projectId, databaseServiceId: payload.databaseServiceId, rpoSeconds: payload.rehearsal.rpoSeconds, rtoSeconds: payload.rehearsal.rtoSeconds, checksum: createHash('sha256').update(JSON.stringify(document)).digest('hex') };
}
