import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

describe('production release process', () => {
  const repositoryRoot = resolve(process.cwd(), '..');

  it.each(['Dockerfile', 'backend/Dockerfile'])('%s API startup is read-only', (file) => {
    const dockerfile = readFileSync(join(repositoryRoot, file), 'utf8');
    const command = dockerfile.split('\n').find((line) => line.startsWith('CMD ')) || '';
    expect(command).toContain('check-schema-compatibility.js');
    expect(command).toContain('node dist/main');
    expect(command).not.toMatch(/db push|migrate deploy|seed-prod/);
  });

  it.each(['railway.json', 'backend/railway.json'])('%s separates pre-deploy migration from startup', (file) => {
    const config = JSON.parse(readFileSync(join(repositoryRoot, file), 'utf8'));
    expect(config.deploy.preDeployCommand).toBe('node prisma/release-migrate.js');
    if (config.deploy.startCommand) {
      expect(config.deploy.startCommand).toContain('check-schema-compatibility.js');
      expect(config.deploy.startCommand).not.toMatch(/migrate|seed-prod|db push/);
    }
  });

  it('holds a PostgreSQL advisory lock around migrate deploy', () => {
    const runner = readFileSync(join(process.cwd(), 'prisma', 'release-migrate.js'), 'utf8');
    expect(runner).toContain('pg_advisory_xact_lock');
    expect(runner).toContain('$executeRawUnsafe(`DO $$ BEGIN PERFORM pg_advisory_xact_lock(${RELEASE_LOCK_ID}); END $$`)');
    expect(runner).not.toContain('$queryRawUnsafe(`SELECT pg_advisory_xact_lock');
    expect(runner).toContain(`to_regclass('"_prisma_migrations"')::text AS relation`);
    expect(runner).toContain('if (!history[0]?.relation) return');
    expect(runner).toContain("'migrate', 'deploy'");
    expect(runner).toContain("'migrate', 'resolve', '--applied', LEGACY_BASELINE");
    expect(runner).toContain('synchronizeHistoricalBaselineChecksum');
    expect(runner).toContain("createHash('sha256')");
    expect(runner).toContain('$transaction');
  });

  it('contains complete migration SQL without captured output truncation', () => {
    const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
    for (const directory of readdirSync(migrationsRoot).filter((entry) => statSync(join(migrationsRoot, entry)).isDirectory())) {
      const sql = readFileSync(join(migrationsRoot, directory, 'migration.sql'), 'utf8');
      expect(sql).not.toMatch(/tokens truncated|…\d+ tokens truncated…/);
      expect(sql.trim().length).toBeGreaterThan(0);
    }
    const baseline = readFileSync(join(migrationsRoot, '20260728000000_legacy_schema_baseline', 'migration.sql'), 'utf8');
    expect(baseline.length).toBeGreaterThan(50_000);
  });
});
