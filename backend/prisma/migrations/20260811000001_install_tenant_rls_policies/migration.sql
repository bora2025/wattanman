-- Install deny-by-default tenant policies without activating them. Activation
-- is an explicit release operation after separate runtime/control identities
-- have been verified by prisma/activate-tenant-rls.js.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'RefreshToken', 'PasswordResetToken', 'AuditLog',
    'AuditCleanupSchedule', 'SiteSetting', 'Post', 'ExtensionInstallation',
    'ExtensionVisibilityGrant', 'ExtensionAlert', 'ExtensionApiMetric',
    'ExtensionMigrationRun', 'ExtensionPilotFeedback', 'SchoolDomain',
    'ExtensionRecord', 'SchoolDailyMetric', 'SchoolProvisioningJob'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_school_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_school_isolation ON %I AS PERMISSIVE FOR ALL TO PUBLIC '
      'USING (%I = NULLIF(current_setting(''app.current_school_id'', true), '''')) '
      'WITH CHECK (%I = NULLIF(current_setting(''app.current_school_id'', true), ''''))',
      table_name, 'schoolId', 'schoolId'
    );
  END LOOP;
END $$;
