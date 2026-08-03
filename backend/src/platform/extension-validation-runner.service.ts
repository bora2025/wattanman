import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Worker } from 'worker_threads';
import { PackageValidationResult } from './extension-package-validator.service';

@Injectable()
export class ExtensionValidationRunnerService {
  async validate(file: Express.Multer.File, extension: { key: string; runtimeType: string }, expectedVersion: string): Promise<PackageValidationResult> {
    const timeoutMs = this.numberSetting('EXTENSION_VALIDATION_TIMEOUT_MS', 30_000, 100, 120_000);
    const maxOldGenerationSizeMb = this.numberSetting('EXTENSION_VALIDATION_MEMORY_MB', 64, 16, 256);
    const maxYoungGenerationSizeMb = Math.min(16, Math.max(4, Math.floor(maxOldGenerationSizeMb / 4)));
    const stackSizeMb = this.numberSetting('EXTENSION_VALIDATION_STACK_MB', 4, 1, 16);
    const workerPath = process.env.EXTENSION_VALIDATION_WORKER_PATH
      ? resolve(process.env.EXTENSION_VALIDATION_WORKER_PATH)
      : join(__dirname, 'extension-validation.worker.js');
    if (!existsSync(workerPath)) return this.failure('VALIDATION_WORKER_MISSING', 'Package validation worker is unavailable');

    return new Promise((resolveResult) => {
      let settled = false;
      const worker = new Worker(workerPath, {
        workerData: {
          file: { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: Uint8Array.from(file.buffer) },
          extension,
          expectedVersion,
        },
        resourceLimits: { maxOldGenerationSizeMb, maxYoungGenerationSizeMb, stackSizeMb },
      });
      const finish = (result: PackageValidationResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveResult({
          ...result,
          files: (result.files || []).map((asset) => ({ ...asset, contents: Buffer.from(asset.contents) })),
        });
      };
      const timeout = setTimeout(() => {
        void worker.terminate();
        finish(this.failure('VALIDATION_TIMEOUT', `Package validation exceeded ${timeoutMs}ms`));
      }, timeoutMs);
      worker.once('message', (result: PackageValidationResult) => finish(result));
      worker.once('error', (error) => finish(this.failure('VALIDATION_WORKER_FAILED', error.message || 'Package validation worker failed')));
      worker.once('exit', (code) => {
        if (!settled && code !== 0) finish(this.failure('VALIDATION_RESOURCE_LIMIT', `Package validation worker exited with code ${code}`));
      });
    });
  }

  private failure(code: string, message: string): PackageValidationResult {
    return { valid: false, errors: [{ code, message }], warnings: [], files: [] };
  }

  private numberSetting(name: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(process.env[name] || fallback);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
  }
}
