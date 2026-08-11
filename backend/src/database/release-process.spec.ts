import { readFileSync } from 'fs';
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
    expect(runner).toContain("'migrate', 'deploy'");
    expect(runner).toContain("'migrate', 'resolve', '--applied', LEGACY_BASELINE");
    expect(runner).toContain('$transaction');
  });
});
