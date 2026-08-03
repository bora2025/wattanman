import { readFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { ExtensionPackageValidatorService } from '../platform/extension-package-validator.service';

async function main() {
  const [packagePath, key, runtimeType, version] = process.argv.slice(2);
  if (!packagePath || !key || !runtimeType || !version) {
    throw new Error('Usage: npm run extension:validate -- <package.zip> <KEY> <THEME|DECLARATIVE_MODULE> <version>');
  }
  if (!['THEME', 'DECLARATIVE_MODULE'].includes(runtimeType)) {
    throw new Error('Runtime type must be THEME or DECLARATIVE_MODULE');
  }

  const absolutePath = resolve(packagePath);
  const buffer = await readFile(absolutePath);
  const validator = new ExtensionPackageValidatorService();
  const result = await validator.validate(
    { originalname: basename(absolutePath), buffer, size: buffer.length } as Express.Multer.File,
    { key, runtimeType },
    version,
  );
  const report = {
    valid: result.valid,
    manifest: result.manifest,
    errors: result.errors,
    warnings: result.warnings,
    files: result.files.map(({ path, size, checksum, mimeType }) => ({ path, size, checksum, mimeType })),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
