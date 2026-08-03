import JSZip from 'jszip';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ExtensionPackageValidatorService } from './extension-package-validator.service';

async function packageFile(files: Record<string, string | Buffer>): Promise<Express.Multer.File> {
  const zip = new JSZip();
  for (const [path, contents] of Object.entries(files)) zip.file(path, contents);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { originalname: 'package.zip', buffer, size: buffer.length } as Express.Multer.File;
}

describe('ExtensionPackageValidatorService', () => {
  const validator = new ExtensionPackageValidatorService();

  it('accepts a valid theme manifest and stylesheet', async () => {
    const file = await packageFile({
      'aurora/theme.json': JSON.stringify({
        schemaVersion: 1,
        key: 'AURORA',
        name: 'Aurora',
        version: '1.0.0',
        runtimeType: 'THEME',
        mode: 'dark',
        tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'inter', radius: 'soft' },
      }),
      'aurora/style.css': ':root { --brand: #14B8A6; }',
    });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.files).toHaveLength(2);
  });

  it('accepts the versioned Aurora Khmer manual test package', async () => {
    const path = resolve(__dirname, '../../../examples/theme-packages/aurora-khmer-versioned/aurora-khmer-versioned.zip');
    const buffer = readFileSync(path);

    const result = await validator.validate(
      { originalname: 'aurora-khmer-versioned.zip', buffer, size: buffer.length } as Express.Multer.File,
      { key: 'AURORA_KHMER', runtimeType: 'THEME' },
      '1.0.0',
    );

    expect(result.valid).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(expect.arrayContaining(['theme.json', 'style.css', 'readme.md']));
  });

  it('accepts the Student Rewards pilot package', async () => {
    const path = resolve(__dirname, '../../../examples/extension-packages/student-rewards.zip');
    const buffer = readFileSync(path);

    const result = await validator.validate(
      { originalname: 'student-rewards.zip', buffer, size: buffer.length } as Express.Multer.File,
      { key: 'STUDENT_REWARDS', runtimeType: 'DECLARATIVE_MODULE' },
      '1.0.0',
    );

    expect(result.valid).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(expect.arrayContaining(['extension.json', 'readme.md']));
  });

  it('rejects a manifest for a different extension and version', async () => {
    const file = await packageFile({
      'theme.json': JSON.stringify({
        schemaVersion: 1,
        key: 'OTHER',
        name: 'Other',
        version: '2.0.0',
        runtimeType: 'THEME',
        mode: 'light',
        tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'inter', radius: 'soft' },
      }),
    });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['MANIFEST_KEY', 'MANIFEST_VERSION']));
  });

  it('rejects executable files in declarative modules', async () => {
    const file = await packageFile({
      'extension.json': JSON.stringify({
        schemaVersion: 1,
        key: 'STUDENT_REWARDS',
        name: 'Student Rewards',
        version: '1.0.0',
        runtimeType: 'DECLARATIVE_MODULE',
        permissions: [],
      }),
      'server.js': 'process.exit(1)',
    });

    const result = await validator.validate(file, { key: 'STUDENT_REWARDS', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'EXECUTABLE_FILE', path: 'server.js' }));
  });

  it('rejects packages without the required manifest', async () => {
    const file = await packageFile({ 'README.md': '# Missing manifest' });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'MANIFEST_COUNT' }));
  });

  it('rejects image extensions whose content signature is invalid', async () => {
    const file = await packageFile({
      'theme.json': JSON.stringify({
        schemaVersion: 1,
        key: 'AURORA',
        name: 'Aurora',
        version: '1.0.0',
        runtimeType: 'THEME',
        mode: 'dark',
        tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'inter', radius: 'soft' },
      }),
      'screenshot.png': Buffer.from('not-a-png'),
    });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'MIME_SIGNATURE', path: 'screenshot.png' }));
  });
});
