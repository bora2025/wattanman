import { readFileSync } from 'fs';
import { join } from 'path';

describe('logical restore isolation architecture', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'backup', 'backup.service.ts'), 'utf8');

  it('never disables constraints or uses raw SQL for tenant mutation', () => {
    expect(source).not.toContain('session_replication_role');
    expect(source).not.toContain('$executeRaw');
    expect(source).not.toContain('$queryRaw');
    expect(source).toContain('RESTORE_DELETE_ORDER');
    expect(source).toContain('RESTORE_INSERT_ORDER');
  });

  it('forces restored rows to the approved tenant and creates safety evidence first', () => {
    expect(source).toContain('schoolId: request.schoolId');
    expect(source).toContain('persistSafetyExport(request, attempt)');
    expect(source.indexOf('persistSafetyExport(request, attempt)')).toBeLessThan(source.indexOf('this.prisma.$transaction'));
    expect(source).toContain("type: 'backup.restore.execute'");
  });

  it('keeps operational and routing state outside the logical snapshot contract', () => {
    for (const forbidden of ['SchoolDomain', 'AuditLog', 'BackupExport', 'BackupRestoreRequest', 'ExtensionLifecycleJob', 'SchoolDailyMetric']) {
      expect(source.match(new RegExp(`'${forbidden}'`, 'g'))?.length || 0).toBeLessThanOrEqual(forbidden === 'BackupExport' ? 0 : 0);
    }
  });
});
