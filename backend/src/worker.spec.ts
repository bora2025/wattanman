import { readFileSync } from 'fs';
import { join } from 'path';

describe('worker process separation', () => {
  it('does not register schedulers in the HTTP API module', () => {
    const appModule = readFileSync(join(process.cwd(), 'src', 'app.module.ts'), 'utf8');
    expect(appModule).not.toContain('ScheduleModule.forRoot()');
  });

  it('registers role-specific scheduler modules outside the API', () => {
    const workerModule = readFileSync(join(process.cwd(), 'src', 'worker.module.ts'), 'utf8');
    const extensionModule = readFileSync(join(process.cwd(), 'src', 'extension-worker.module.ts'), 'utf8');
    expect(workerModule).toContain('ScheduleModule.forRoot()');
    expect(workerModule).toContain('AuditModule');
    expect(workerModule).toContain('SchoolMetricsModule');
    expect(workerModule).not.toContain('PlatformModule');
    expect(extensionModule).toContain('ScheduleModule.forRoot()');
    expect(extensionModule).toContain('PlatformModule');
  });

  it('provides worker health and graceful shutdown', () => {
    const worker = readFileSync(join(process.cwd(), 'src', 'worker-bootstrap.ts'), 'utf8');
    expect(worker).toContain("['/health', '/live', '/ready']");
    expect(worker).toContain("request.url === '/ready'");
    expect(worker).toContain('process.env.PORT || process.env.WORKER_HEALTH_PORT');
    expect(worker).toContain('ready = false');
    expect(worker).toContain("process.once('SIGTERM'");
    expect(worker).toContain('await app.close()');
  });

  it('establishes an explicit audited control-plane context before scheduling work', () => {
    const worker = readFileSync(join(process.cwd(), 'src', 'worker-bootstrap.ts'), 'utf8');
    expect(worker).toContain("tenantContext.enterWith({ schoolId: 'PLATFORM', mode: 'unscoped' })");
    expect(worker.indexOf('tenantContext.enterWith')).toBeLessThan(worker.indexOf('NestFactory.createApplicationContext'));
  });

  it('ships dedicated extension, operations, and notification entrypoints', () => {
    const operations = readFileSync(join(process.cwd(), 'src', 'worker.ts'), 'utf8');
    const extensions = readFileSync(join(process.cwd(), 'src', 'extension-worker.ts'), 'utf8');
    const notifications = readFileSync(join(process.cwd(), 'src', 'notification-worker.ts'), 'utf8');
    expect(operations).toContain("role: 'operations'");
    expect(extensions).toContain("role: 'extension'");
    expect(notifications).toContain("role: 'notification'");
  });

  it('ships a Railway manifest for the dedicated extension worker', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'extension-worker.railway.json'), 'utf8'));
    expect(manifest.deploy.preDeployCommand).toBe('node prisma/check-schema-compatibility.js');
    expect(manifest.deploy.startCommand).toBe('node dist/extension-worker');
    expect(manifest.deploy.startCommand).not.toContain('dist/main');
  });

  it('copies versioned manifest schemas into production builds', () => {
    const nestConfig = JSON.parse(readFileSync(join(process.cwd(), 'nest-cli.json'), 'utf8'));
    expect(nestConfig.compilerOptions.assets).toContain('platform/schemas/*.json');
    for (const schema of ['theme-manifest-v1.schema.json', 'extension-manifest-v1.schema.json']) {
      const contract = JSON.parse(readFileSync(join(process.cwd(), 'src', 'platform', 'schemas', schema), 'utf8'));
      expect(contract.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(contract.$id).toContain('-v1.schema.json');
    }
  });

  it('establishes tenant context from every durable queue envelope', () => {
    const queue = readFileSync(join(process.cwd(), 'src', 'jobs', 'queue-infrastructure.service.ts'), 'utf8');
    expect(queue).toContain('assertJobEnvelope(job.data)');
    expect(queue).toContain('tenantContext.run(scope');
  });

  it('keeps durable server state out of API and frontend filesystems', () => {
    const appModule = readFileSync(join(process.cwd(), 'src', 'app.module.ts'), 'utf8');
    const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(`${appModule}\n${main}`).not.toMatch(/writeFile|createWriteStream|diskStorage|mkdirSync/);
  });
});
