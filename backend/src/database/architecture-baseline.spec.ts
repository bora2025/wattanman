import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const EXPECTED_MODELS = [
  'AuditCleanupSchedule', 'AuditLog', 'Extension', 'ExtensionAlert', 'ExtensionApiMetric',
  'ExtensionAsset', 'ExtensionCatalogCollection', 'ExtensionCatalogCollectionItem',
  'ExtensionDependency', 'ExtensionInstallation', 'ExtensionMigrationBackup',
  'ExtensionLifecycleJob', 'ExtensionMigrationRun', 'ExtensionPaymentSetting', 'ExtensionPaymentSettingHistory',
  'ExtensionPaymentEvidence', 'ExtensionPermission', 'ExtensionPilotFeedback', 'ExtensionPurgeReport',
  'ExtensionPublisher', 'ExtensionPublisherMember', 'ExtensionRecord', 'ExtensionReview',
  'ExtensionSigningKey', 'ExtensionValidation', 'ExtensionVersion', 'ExtensionVisibilityGrant',
  'PasswordResetToken', 'Post', 'RefreshToken', 'School', 'SchoolDailyMetric', 'SchoolDomain',
  'SchoolProvisioningJob', 'SiteSetting', 'User',
].sort();

const REMOVED_RUNTIME_DIRECTORIES = [
  'classes', 'students', 'attendance', 'fees', 'timetables', 'scores', 'staff', 'transport',
  'exams', 'assignments', 'messages', 'announcements', 'courses', 'notifications', 'modules', 'addons',
];

describe('core architecture baseline', () => {
  it('contains exactly the reviewed Prisma model inventory', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const models = [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]).sort();
    expect(models).toEqual(EXPECTED_MODELS);
  });

  it('does not restore removed feature runtime directories', () => {
    for (const directory of REMOVED_RUNTIME_DIRECTORIES) {
      expect(existsSync(resolve(process.cwd(), 'src', directory))).toBe(false);
      expect(existsSync(resolve(process.cwd(), '..', 'frontend', 'app', 'admin', directory))).toBe(false);
    }
  });
});
