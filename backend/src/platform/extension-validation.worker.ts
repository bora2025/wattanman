import { parentPort, workerData } from 'worker_threads';
import { ExtensionPackageValidatorService } from './extension-package-validator.service';

interface ValidationWorkerData {
  file: { originalname: string; mimetype: string; size: number; buffer: Uint8Array };
  extension: { key: string; runtimeType: string };
  expectedVersion: string;
}

async function run() {
  const data = workerData as ValidationWorkerData;
  const file = {
    originalname: data.file.originalname,
    mimetype: data.file.mimetype,
    size: data.file.size,
    buffer: Buffer.from(data.file.buffer),
  } as Express.Multer.File;
  const result = await new ExtensionPackageValidatorService().validate(file, data.extension, data.expectedVersion);
  parentPort?.postMessage(result);
}

run().catch((error) => {
  parentPort?.postMessage({
    valid: false,
    errors: [{ code: 'VALIDATION_WORKER_FAILED', message: error instanceof Error ? error.message : 'Validation worker failed' }],
    warnings: [],
    files: [],
  });
});
