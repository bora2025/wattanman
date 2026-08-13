import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename, resolve } from 'path';

export interface DatabaseSnapshot { databaseBytes: number; tables: Record<string, number> }

export function validateDestructiveRehearsalConfig(input: { targetUrl?: string; runtimeUrl?: string; backupPath?: string; authorization?: string; minimumBytes?: number }) {
  if (input.authorization !== 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_REHEARSAL') throw new Error('DESTRUCTIVE_REHEARSAL_AUTHORIZATION is required');
  if (!input.targetUrl) throw new Error('DESTRUCTIVE_REHEARSAL_DATABASE_URL is required');
  const target = new URL(input.targetUrl);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.username || !target.pathname.replace(/^\//, '')) throw new Error('Rehearsal database URL is invalid');
  const marker = `${target.hostname}/${target.pathname}`.toLowerCase();
  if (!/(rehears|restore|staging|performance|perf)/.test(marker)) throw new Error('Rehearsal database must contain an isolated-environment marker');
  if (input.runtimeUrl && target.toString() === new URL(input.runtimeUrl).toString()) throw new Error('Rehearsal database must not equal DATABASE_URL');
  if (!input.backupPath || !existsSync(resolve(input.backupPath)) || !statSync(resolve(input.backupPath)).isFile()) throw new Error('A PostgreSQL custom-format backup file is required');
  if (!Number.isInteger(input.minimumBytes) || input.minimumBytes! < 1_000_000) throw new Error('DESTRUCTIVE_REHEARSAL_MIN_BYTES must be at least 1 MB');
  return { targetUrl: target.toString(), backupPath: resolve(input.backupPath), minimumBytes: input.minimumBytes! };
}

export function obsoleteTablesFromMigration(sql: string) {
  const tables = [...sql.matchAll(/DROP TABLE IF EXISTS\s+"([A-Za-z][A-Za-z0-9_]*)"/g)].map((match) => match[1]);
  if (tables.length < 10 || new Set(tables).size !== tables.length) throw new Error('Destructive migration table inventory is incomplete');
  return tables;
}

export function verifyDestructiveSnapshots(before: DatabaseSnapshot, after: DatabaseSnapshot, restored: DatabaseSnapshot, obsoleteTables: string[], minimumBytes: number) {
  if (before.databaseBytes < minimumBytes) throw new Error(`Restored backup is smaller than the production-sized threshold (${before.databaseBytes} < ${minimumBytes})`);
  const obsolete = new Set(obsoleteTables);
  const presentBefore = obsoleteTables.filter((table) => table in before.tables);
  if (!presentBefore.length) throw new Error('Backup does not contain any target obsolete tables');
  const remaining = obsoleteTables.filter((table) => table in after.tables);
  if (remaining.length) throw new Error(`Destructive migration left obsolete tables: ${remaining.join(', ')}`);
  const retainedBefore = Object.entries(before.tables).filter(([table]) => !obsolete.has(table) && table !== '_prisma_migrations');
  for (const [table, count] of retainedBefore) if (after.tables[table] !== count) throw new Error(`Retained row count changed for ${table}`);
  for (const [table, count] of Object.entries(before.tables)) if (restored.tables[table] !== count) throw new Error(`Rollback restore row count mismatch for ${table}`);
  return { productionSized: true, obsoleteTablesPresentBefore: presentBefore.length, obsoleteTablesRemoved: presentBefore.length, retainedTablesVerified: retainedBefore.length, rollbackTablesVerified: Object.keys(before.tables).length };
}

export async function sha256File(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function signRehearsalReport(payload: unknown, privateKeyPem: string, keyId: string) {
  if (!keyId || !/^[a-zA-Z0-9._-]{3,100}$/.test(keyId)) throw new Error('DESTRUCTIVE_REHEARSAL_SIGNING_KEY_ID is invalid');
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Destructive rehearsal signing key must be Ed25519');
  return { schemaVersion: 1, keyId, payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), key).toString('base64') };
}

export function verifyRehearsalReport(document: any, publicKeyPem: string) {
  if (document?.schemaVersion !== 1 || !document.keyId || !document.payload || !document.signature) throw new Error('Invalid destructive rehearsal report');
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(JSON.stringify(document.payload)), key, Buffer.from(document.signature, 'base64'))) throw new Error('Destructive rehearsal signature is invalid');
  const payload = document.payload;
  if (payload.outcome !== 'PASSED' || payload.cleanupVerified !== true || !/^destructive-rehearsal-\d+$/.test(payload.runId || '') || !/^[a-f0-9]{64}$/.test(payload.backup?.sha256 || '') || payload.backup?.restoredDatabaseBytes < 1_000_000 || payload.verification?.productionSized !== true || payload.verification?.obsoleteTablesRemoved < 1 || payload.verification?.retainedTablesVerified < 1 || payload.verification?.rollbackTablesVerified < 1 || !Array.isArray(payload.commandEvidence) || payload.commandEvidence.length < 4) throw new Error('Destructive rehearsal report is incomplete');
  return { outcome: 'VERIFIED', runId: payload.runId, keyId: document.keyId, backupSha256: payload.backup.sha256 };
}

export function safeBackupName(path: string) {
  return basename(path).replace(/[^a-zA-Z0-9._-]/g, '_');
}
