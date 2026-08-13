import { createHash, createPublicKey, verify } from 'crypto';

const WAVE_TARGETS = [
  ['INTERNAL', 1],
  ['PILOT_10', 10],
  ['SCHOOLS_50', 50],
  ['SCHOOLS_250', 250],
  ['SCHOOLS_500', 500],
  ['SCHOOLS_1000', 1000],
] as const;

function time(value: unknown, field: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return parsed;
}

export function prepareRolloutEvidence(input: any, now = new Date()) {
  if (input?.schemaVersion !== 1 || input.environment !== 'production' || !Array.isArray(input.waves) || input.waves.length !== WAVE_TARGETS.length) throw new Error('Rollout evidence is incomplete');
  const observedAt = time(input.observedAt, 'observedAt');
  if (observedAt > now.getTime() + 5 * 60_000 || observedAt < now.getTime() - 7 * 24 * 60 * 60_000) throw new Error('Rollout evidence must be observed within seven days');
  let previousEndedAt = 0;
  const waves = input.waves.map((wave: any, index: number) => {
    const [name, requiredSchools] = WAVE_TARGETS[index];
    if (wave?.name !== name || !Number.isInteger(wave.schoolCount) || (index === 0 ? wave.schoolCount < requiredSchools : wave.schoolCount !== requiredSchools)) throw new Error(`Rollout wave ${name} has an invalid school count`);
    const startedAt = time(wave.startedAt, `${name}.startedAt`);
    const endedAt = time(wave.endedAt, `${name}.endedAt`);
    if (endedAt < startedAt || startedAt < previousEndedAt || endedAt > observedAt + 5 * 60_000) throw new Error(`Rollout wave ${name} timestamps are invalid or overlap`);
    const stableSeconds = Math.floor((endedAt - startedAt) / 1000);
    if (index > 0 && stableSeconds < 7 * 24 * 60 * 60) throw new Error(`Rollout wave ${name} did not hold seven stable days`);
    for (const review of ['slo', 'support', 'security', 'cost', 'rollbackReady']) if (wave.reviews?.[review] !== true) throw new Error(`Rollout wave ${name} is missing ${review} approval`);
    if (wave.tenantIsolationFailures !== 0 || wave.criticalIncidents !== 0) throw new Error(`Rollout wave ${name} contains a blocking incident`);
    if (!/^[A-Z][A-Z0-9_-]{2,49}$/.test(wave.changeTicket || '')) throw new Error(`Rollout wave ${name} requires a change ticket`);
    previousEndedAt = endedAt;
    return { name, schoolCount: wave.schoolCount, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(), stableSeconds, reviews: { slo: true, support: true, security: true, cost: true, rollbackReady: true }, tenantIsolationFailures: 0, criticalIncidents: 0, changeTicket: wave.changeTicket };
  });
  if (input.final?.operatingLimitsPublished !== true || input.final?.supportProceduresPublished !== true || typeof input.final?.operatingLimitsUri !== 'string' || typeof input.final?.supportProceduresUri !== 'string') throw new Error('Final operating limits and support procedures must be published');
  for (const uri of [input.final.operatingLimitsUri, input.final.supportProceduresUri]) {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'https:') throw new Error('Final publication evidence must use HTTPS');
  }
  return { schemaVersion: 1, environment: 'production', observedAt: new Date(observedAt).toISOString(), waves, final: input.final };
}

export function rolloutApprovalPayload(payload: unknown, approval: { reviewerId: string; role: string; signedAt: string }) {
  return Buffer.from(JSON.stringify({ payload, reviewerId: approval.reviewerId, role: approval.role, signedAt: approval.signedAt }));
}

export function verifyRolloutEvidence(document: any, registry: any, now = new Date()) {
  const payload = prepareRolloutEvidence(document?.payload, now);
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.reviewers)) throw new Error('Rollout reviewer registry is invalid');
  const identities = new Set<string>();
  for (const role of ['PRODUCT_OWNER', 'RELIABILITY_OWNER', 'SECURITY_OWNER']) {
    const approval = document?.approvals?.find((item: any) => item.role === role);
    if (!approval || identities.has(approval.reviewerId)) throw new Error(`Missing independent ${role} approval`);
    const reviewer = registry.reviewers.find((item: any) => item.id === approval.reviewerId && item.role === role && item.status === 'ACTIVE');
    if (!reviewer) throw new Error(`Reviewer is not trusted for ${role}`);
    const signedAt = time(approval.signedAt, `${role}.signedAt`);
    if (signedAt < Date.parse(payload.observedAt) || signedAt > now.getTime() + 5 * 60_000) throw new Error(`${role} signature time is invalid`);
    const key = createPublicKey(reviewer.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, rolloutApprovalPayload(payload, approval), key, Buffer.from(approval.signature || '', 'base64'))) throw new Error(`${role} signature is invalid`);
    identities.add(approval.reviewerId);
  }
  return { outcome: 'VERIFIED', schools: payload.waves[payload.waves.length - 1].schoolCount, waves: payload.waves.length, checksum: createHash('sha256').update(JSON.stringify(document)).digest('hex') };
}
