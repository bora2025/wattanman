import { readFileSync } from 'fs';
import { join } from 'path';

describe('worker process separation', () => {
  it('does not register schedulers in the HTTP API module', () => {
    const appModule = readFileSync(join(process.cwd(), 'src', 'app.module.ts'), 'utf8');
    expect(appModule).not.toContain('ScheduleModule.forRoot()');
  });

  it('registers schedulers only in the worker module', () => {
    const workerModule = readFileSync(join(process.cwd(), 'src', 'worker.module.ts'), 'utf8');
    expect(workerModule).toContain('ScheduleModule.forRoot()');
    expect(workerModule).toContain('PlatformModule');
  });

  it('provides worker health and graceful shutdown', () => {
    const worker = readFileSync(join(process.cwd(), 'src', 'worker.ts'), 'utf8');
    expect(worker).toContain("request.url !== '/health'");
    expect(worker).toContain("process.once('SIGTERM'");
    expect(worker).toContain('await app.close()');
  });
});
