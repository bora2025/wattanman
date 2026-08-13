import { createHash } from 'crypto';

export interface FixtureScale {
  schools: number;
  usersPerSchool: number;
  extensionsPerSchool: number;
  recordsPerExtension: number;
  auditsPerSchool: number;
  assetsPerSchool: number;
}

export const CERTIFICATION_SCALE: FixtureScale = {
  schools: 1000,
  usersPerSchool: 500,
  extensionsPerSchool: 8,
  recordsPerExtension: 40,
  auditsPerSchool: 200,
  assetsPerSchool: 12,
};

function digest(seed: string, ...parts: Array<string | number>) {
  return createHash('sha256').update([seed, ...parts].join(':')).digest('hex');
}

function bounded(seed: string, maximum: number, ...parts: Array<string | number>) {
  return Number.parseInt(digest(seed, ...parts).slice(0, 8), 16) % maximum;
}

export function schoolFixture(seed: string, schoolIndex: number, scale: FixtureScale) {
  const schoolId = `load-school-${String(schoolIndex + 1).padStart(4, '0')}`;
  const users = Array.from({ length: scale.usersPerSchool }, (_, index) => {
    const roleRoll = bounded(seed, 100, schoolIndex, 'role', index);
    const role = index === 0 ? 'ADMIN' : roleRoll < 82 ? 'STUDENT' : roleRoll < 95 ? 'TEACHER' : 'STAFF';
    return { id: `${schoolId}-user-${index + 1}`, schoolId, role, email: `load+${schoolIndex + 1}.${index + 1}@example.invalid`, cohort: bounded(seed, 12, schoolIndex, 'cohort', index) + 1 };
  });
  const installations = Array.from({ length: scale.extensionsPerSchool }, (_, index) => ({ id: `${schoolId}-installation-${index + 1}`, schoolId, extensionKey: `LOAD_EXTENSION_${String(index + 1).padStart(2, '0')}`, enabled: bounded(seed, 10, schoolIndex, 'extension', index) !== 0, updatePolicy: ['MANUAL', 'NOTIFY', 'AUTOMATIC'][bounded(seed, 3, schoolIndex, 'policy', index)] }));
  const records = installations.flatMap((installation, extensionIndex) => Array.from({ length: scale.recordsPerExtension }, (_, index) => ({ id: `${installation.id}-record-${index + 1}`, schoolId, extensionKey: installation.extensionKey, resource: ['events', 'settings', 'transactions', 'reports'][bounded(seed, 4, schoolIndex, extensionIndex, index)], byteSize: 256 + bounded(seed, 8192, schoolIndex, 'record', extensionIndex, index) })));
  const audits = Array.from({ length: scale.auditsPerSchool }, (_, index) => ({ id: `${schoolId}-audit-${index + 1}`, schoolId, action: ['READ', 'CREATE', 'UPDATE', 'LOGIN', 'EXPORT'][bounded(seed, 5, schoolIndex, 'audit', index)], ageMinutes: bounded(seed, 365 * 24 * 60, schoolIndex, 'age', index) }));
  const assets = Array.from({ length: scale.assetsPerSchool }, (_, index) => ({ id: `${schoolId}-asset-${index + 1}`, schoolId, contentType: ['image/webp', 'application/pdf', 'text/csv'][bounded(seed, 3, schoolIndex, 'asset-type', index)], byteSize: 16_384 + bounded(seed, 2_000_000, schoolIndex, 'asset-size', index) }));
  return { school: { id: schoolId, subdomain: `${schoolId}.invalid`, name: `Synthetic School ${schoolIndex + 1}`, region: ['urban', 'suburban', 'rural'][bounded(seed, 3, schoolIndex, 'region')] }, users, installations, records, audits, assets };
}

export function fixtureManifest(seed: string, scale: FixtureScale) {
  const totals = { schools: scale.schools, users: scale.schools * scale.usersPerSchool, installations: scale.schools * scale.extensionsPerSchool, records: scale.schools * scale.extensionsPerSchool * scale.recordsPerExtension, audits: scale.schools * scale.auditsPerSchool, assets: scale.schools * scale.assetsPerSchool };
  return { schemaVersion: 1, seed, scale, totals, fingerprint: digest(seed, JSON.stringify(scale), JSON.stringify(totals)) };
}
