import { generateKeyPairSync, verify } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { obsoleteTablesFromMigration, signRehearsalReport, validateDestructiveRehearsalConfig, verifyDestructiveSnapshots, verifyRehearsalReport } from './destructive-migration-rehearsal';

describe('destructive migration rehearsal', () => {
  it('requires a separate marked database and existing backup', () => {
    const root = mkdtempSync(join(tmpdir(), 'destructive-rehearsal-'));
    const backup = join(root, 'copy.dump'); writeFileSync(backup, 'backup');
    expect(validateDestructiveRehearsalConfig({ targetUrl: 'postgres://u:p@db.rehearsal.internal/copy', runtimeUrl: 'postgres://u:p@production/db', backupPath: backup, authorization: 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_REHEARSAL', minimumBytes: 1_000_000 })).toEqual(expect.objectContaining({ backupPath: backup }));
    expect(() => validateDestructiveRehearsalConfig({ targetUrl: 'postgres://u:p@production.internal/main', backupPath: backup, authorization: 'I_AUTHORIZE_DESTRUCTIVE_ISOLATED_REHEARSAL', minimumBytes: 1_000_000 })).toThrow('isolated-environment marker');
    rmSync(root, { recursive: true, force: true });
  });

  it('verifies removal, retained counts, and rollback restoration', () => {
    const obsolete = Array.from({ length: 10 }, (_, index) => `Legacy${index}`);
    const before = { databaseBytes: 2_000_000, tables: { School: 1000, User: 500000, ...Object.fromEntries(obsolete.map((table) => [table, 10])) } };
    const after = { databaseBytes: 1_500_000, tables: { School: 1000, User: 500000 } };
    expect(verifyDestructiveSnapshots(before, after, before, obsolete, 1_000_000)).toEqual(expect.objectContaining({ obsoleteTablesRemoved: 10, retainedTablesVerified: 2 }));
    expect(() => verifyDestructiveSnapshots(before, { ...after, tables: { School: 999, User: 500000 } }, before, obsolete, 1_000_000)).toThrow('Retained row count changed');
  });

  it('extracts explicit drop inventory and signs immutable evidence', () => {
    const sql = Array.from({ length: 10 }, (_, index) => `DROP TABLE IF EXISTS "Legacy${index}" CASCADE;`).join('\n');
    expect(obsoleteTablesFromMigration(sql)).toHaveLength(10);
    const keys = generateKeyPairSync('ed25519');
    const report = signRehearsalReport({ outcome: 'PASSED' }, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'rehearsal-key');
    expect(verify(null, Buffer.from(JSON.stringify(report.payload)), keys.publicKey, Buffer.from(report.signature, 'base64'))).toBe(true);
  });

  it('verifies complete reports and rejects tampering', () => {
    const keys = generateKeyPairSync('ed25519');
    const payload = { outcome: 'PASSED', cleanupVerified: true, runId: 'destructive-rehearsal-123', backup: { sha256: 'a'.repeat(64), restoredDatabaseBytes: 2_000_000 }, verification: { productionSized: true, obsoleteTablesRemoved: 10, retainedTablesVerified: 5, rollbackTablesVerified: 15 }, commandEvidence: [{}, {}, {}, {}] };
    const report: any = signRehearsalReport(payload, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'rehearsal-key');
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyRehearsalReport(report, publicKey)).toEqual(expect.objectContaining({ outcome: 'VERIFIED' }));
    report.payload.cleanupVerified = false;
    expect(() => verifyRehearsalReport(report, publicKey)).toThrow('signature is invalid');
  });
});
