import { createHash, createPublicKey, verify } from 'crypto';

const REQUIRED_ROLES = ['INCIDENT_COMMANDER', 'OPERATIONS_RESPONDER', 'COMMUNICATIONS_OWNER', 'OBSERVER'];
const SCENARIOS = ['DATABASE_RECOVERY', 'REDIS_QUEUE_RECOVERY', 'R2_RECOVERY', 'SIGNING_KEY_COMPROMISE', 'TENANT_ISOLATION'];

function parseTime(value: unknown, field: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be an ISO timestamp`);
  return parsed;
}

export function prepareGameDayEvidence(input: any, now = new Date()) {
  if (input?.schemaVersion !== 1 || input.environment !== 'staging' || !SCENARIOS.includes(input.scenario)) throw new Error('Game-day environment or scenario is invalid');
  if (!Array.isArray(input.participants) || input.participants.length !== REQUIRED_ROLES.length) throw new Error('Game-day requires all four responder roles');
  const identities = new Set<string>();
  for (const role of REQUIRED_ROLES) {
    const participant = input.participants.find((item: any) => item.role === role);
    if (!participant || !/^[a-zA-Z0-9._-]{3,100}$/.test(participant.id || '') || identities.has(participant.id)) throw new Error(`Game-day requires an independent ${role}`);
    identities.add(participant.id);
  }
  const startedAt = parseTime(input.timeline?.startedAt, 'timeline.startedAt');
  const detectedAt = parseTime(input.timeline?.detectedAt, 'timeline.detectedAt');
  const containedAt = parseTime(input.timeline?.containedAt, 'timeline.containedAt');
  const recoveredAt = parseTime(input.timeline?.recoveredAt, 'timeline.recoveredAt');
  if (!(startedAt <= detectedAt && detectedAt <= containedAt && containedAt <= recoveredAt) || recoveredAt > now.getTime() + 5 * 60_000 || startedAt < now.getTime() - 90 * 24 * 60 * 60_000) throw new Error('Game-day timeline is invalid or stale');
  const rtoSeconds = Math.ceil((recoveredAt - startedAt) / 1000);
  if (rtoSeconds > 60 * 60) throw new Error('Game-day recovery exceeds the 60 minute RTO');
  const rpoSeconds = input.measurements?.rpoSeconds;
  if (!Number.isInteger(rpoSeconds) || rpoSeconds < 0 || rpoSeconds > 15 * 60) throw new Error('Game-day recovery exceeds the 15 minute RPO');
  const expectedAlerts = [...new Set(input.expectedAlerts || [])];
  const observedAlerts = [...new Set(input.observedAlerts || [])];
  if (!expectedAlerts.length || expectedAlerts.some((item) => !/^[A-Z][A-Z0-9_]{2,79}$/.test(String(item))) || expectedAlerts.some((item) => !observedAlerts.includes(item))) throw new Error('Every expected alert must be safely recorded as observed');
  if (!Array.isArray(input.procedureSteps) || !input.procedureSteps.length || input.procedureSteps.some((item: unknown) => !/^[a-z0-9][a-z0-9._-]{2,99}$/.test(String(item)))) throw new Error('Game-day procedure steps must be safe identifiers, not raw commands');
  const findings = Array.isArray(input.findings) ? input.findings : [];
  if (findings.some((item: any) => ['CRITICAL', 'HIGH'].includes(item.severity) && item.status !== 'RESOLVED')) throw new Error('Critical and high game-day findings must be resolved');
  for (const finding of findings) if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(finding.severity) || !['OPEN', 'RESOLVED'].includes(finding.status) || !/^[a-zA-Z0-9._-]{3,100}$/.test(finding.ownerId || '')) throw new Error('Game-day finding is invalid');
  if (input.runbookOnly !== true || input.productionFaultInjected !== false || input.cleanupVerified !== true) throw new Error('Game-day must use runbooks in staging and verify cleanup');
  return { schemaVersion: 1, environment: 'staging', scenario: input.scenario, participants: input.participants.map(({ id, role }: any) => ({ id, role })), timeline: { startedAt: new Date(startedAt).toISOString(), detectedAt: new Date(detectedAt).toISOString(), containedAt: new Date(containedAt).toISOString(), recoveredAt: new Date(recoveredAt).toISOString() }, measurements: { rpoSeconds, rtoSeconds }, expectedAlerts, observedAlerts, procedureSteps: input.procedureSteps, findings, runbookOnly: true, productionFaultInjected: false, cleanupVerified: true };
}

export function gameDayApprovalPayload(payload: unknown, approval: { reviewerId: string; role: string; signedAt: string }) {
  return Buffer.from(JSON.stringify({ payload, reviewerId: approval.reviewerId, role: approval.role, signedAt: approval.signedAt }));
}

export function verifyGameDayEvidence(document: any, registry: any, now = new Date()) {
  const payload = prepareGameDayEvidence(document?.payload, now);
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.reviewers)) throw new Error('Game-day reviewer registry is invalid');
  const signedIds = new Set<string>();
  for (const role of ['INCIDENT_COMMANDER', 'OBSERVER']) {
    const approval = document?.approvals?.find((item: any) => item.role === role);
    if (!approval || signedIds.has(approval.reviewerId)) throw new Error(`Missing independent ${role} signature`);
    const participant = payload.participants.find((item: any) => item.id === approval.reviewerId && item.role === role);
    const reviewer = registry.reviewers.find((item: any) => item.id === approval.reviewerId && item.role === role && item.status === 'ACTIVE');
    if (!participant || !reviewer) throw new Error(`${role} signer is not a trusted exercise participant`);
    const signedAt = parseTime(approval.signedAt, `${role}.signedAt`);
    if (signedAt < Date.parse(payload.timeline.recoveredAt) || signedAt > now.getTime() + 5 * 60_000) throw new Error(`${role} signature time is invalid`);
    const key = createPublicKey(reviewer.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, gameDayApprovalPayload(payload, approval), key, Buffer.from(approval.signature || '', 'base64'))) throw new Error(`${role} signature is invalid`);
    signedIds.add(approval.reviewerId);
  }
  return { outcome: 'VERIFIED', scenario: payload.scenario, participants: payload.participants.length, rpoSeconds: payload.measurements.rpoSeconds, rtoSeconds: payload.measurements.rtoSeconds, checksum: createHash('sha256').update(JSON.stringify(document)).digest('hex') };
}
