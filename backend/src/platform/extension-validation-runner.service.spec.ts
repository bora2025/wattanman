import { resolve } from 'path';
import { ExtensionValidationRunnerService } from './extension-validation-runner.service';

describe('ExtensionValidationRunnerService', () => {
  const runner = new ExtensionValidationRunnerService();
  const file = { originalname: 'fixture.zip', mimetype: 'application/zip', size: 3, buffer: Buffer.from('zip') } as Express.Multer.File;
  const original = {
    workerPath: process.env.EXTENSION_VALIDATION_WORKER_PATH,
    timeout: process.env.EXTENSION_VALIDATION_TIMEOUT_MS,
    memory: process.env.EXTENSION_VALIDATION_MEMORY_MB,
  };

  jest.setTimeout(15_000);

  afterEach(() => {
    for (const [name, value] of Object.entries({
      EXTENSION_VALIDATION_WORKER_PATH: original.workerPath,
      EXTENSION_VALIDATION_TIMEOUT_MS: original.timeout,
      EXTENSION_VALIDATION_MEMORY_MB: original.memory,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('returns isolated worker output with Buffer assets restored', async () => {
    process.env.EXTENSION_VALIDATION_WORKER_PATH = resolve(__dirname, '../../test/fixtures/extension-validation-success.worker.js');

    const result = await runner.validate(file, { key: 'FIXTURE', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.valid).toBe(true);
    expect(Buffer.isBuffer(result.files[0].contents)).toBe(true);
    expect(result.files[0].contents.toString()).toBe('{}');
  });

  it('terminates CPU-bound validation at the configured wall-clock limit', async () => {
    process.env.EXTENSION_VALIDATION_WORKER_PATH = resolve(__dirname, '../../test/fixtures/extension-validation-hang.worker.js');
    process.env.EXTENSION_VALIDATION_TIMEOUT_MS = '100';

    const result = await runner.validate(file, { key: 'FIXTURE', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result).toEqual(expect.objectContaining({ valid: false, errors: [expect.objectContaining({ code: 'VALIDATION_TIMEOUT' })] }));
  });

  it('contains worker heap exhaustion without crashing the application', async () => {
    process.env.EXTENSION_VALIDATION_WORKER_PATH = resolve(__dirname, '../../test/fixtures/extension-validation-memory.worker.js');
    process.env.EXTENSION_VALIDATION_MEMORY_MB = '16';
    process.env.EXTENSION_VALIDATION_TIMEOUT_MS = '5000';

    const result = await runner.validate(file, { key: 'FIXTURE', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.valid).toBe(false);
    expect(['VALIDATION_WORKER_FAILED', 'VALIDATION_RESOURCE_LIMIT']).toContain(result.errors[0].code);
  });
});
