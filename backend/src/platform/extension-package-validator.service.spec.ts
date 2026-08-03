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
    expect(result.files.find((asset) => asset.path === 'aurora/style.css')?.contents.toString()).toContain('.wattaman-theme');
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

  it('rejects unapproved global theme selectors', async () => {
    const file = await packageFile({
      'theme.json': JSON.stringify({
        schemaVersion: 1, key: 'AURORA', name: 'Aurora', version: '1.0.0', runtimeType: 'THEME', mode: 'dark',
        tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'inter', radius: 'soft' },
      }),
      'style.css': 'input, a { display: none; }',
    });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'UNAPPROVED_CSS', path: 'style.css' }));
  });

  it('validates optional spacing, shadow, and surface tokens', async () => {
    const file = await packageFile({
      'theme.json': JSON.stringify({
        schemaVersion: 1, key: 'AURORA', name: 'Aurora', version: '1.0.0', runtimeType: 'THEME', mode: 'dark',
        tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'inter', radius: 'soft', spacing: 'huge', shadow: 'unsafe', surface: 'animated' },
      }),
      'style.css': '.card { color: #123456; }',
    });

    const result = await validator.validate(file, { key: 'AURORA', runtimeType: 'THEME' }, '1.0.0');

    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['THEME_SPACING', 'THEME_SHADOW', 'THEME_SURFACE']));
  });

  it('validates declarative dependencies and conflicts', async () => {
    const file = await packageFile({
      'extension.json': JSON.stringify({
        schemaVersion: 1, key: 'REPORTS_PLUS', name: 'Reports Plus', version: '1.0.0', runtimeType: 'DECLARATIVE_MODULE',
        permissions: ['reports:read'], navigation: [], pages: [{ key: 'reports', title: 'Reports', resource: 'reports', roles: ['ADMIN'], fields: [] }],
        resources: { reports: { fields: [] } },
        dependencies: [{ key: 'STUDENT_REWARDS', versionRange: '>=1.0.0 <2.0.0', optional: false }], conflicts: ['OLD_REPORTS'],
        migrations: [{ fromVersion: '0.9.0', toVersion: '1.0.0', operations: [{ type: 'renameField', resource: 'reports', from: 'total', to: 'amount' }] }],
      }),
    });

    const result = await validator.validate(file, { key: 'REPORTS_PLUS', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.valid).toBe(true);
  });

  it('accepts approved UI components and translation fallback', async () => {
    const file = await packageFile({
      'extension.json': JSON.stringify({
        schemaVersion: 1, key: 'INSIGHTS', name: 'Insights', version: '1.0.0', runtimeType: 'DECLARATIVE_MODULE',
        permissions: ['insights:read', 'insights:write'], navigation: [{ label: 'Insights', pageKey: 'insights', roles: ['ADMIN'] }],
        pages: [{ key: 'insights', title: 'Insights', ariaLabel: 'Insights dashboard', resource: 'insights', roles: ['ADMIN'], fields: [{ key: 'category', label: 'Category', type: 'text' }, { key: 'amount', label: 'Amount', type: 'number' }], components: [
          { type: 'stats', metrics: [{ key: 'total', label: 'Total', aggregate: 'sum', field: 'amount' }] },
          { type: 'form', actions: ['create', 'update'] }, { type: 'chart', categoryField: 'category', valueField: 'amount', aggregate: 'sum' },
          { type: 'table', columns: ['category', 'amount'], actions: ['view', 'edit', 'delete'], searchable: true }, { type: 'details', fields: ['category', 'amount'] },
        ] }],
        resources: { insights: { fields: [{ key: 'category', type: 'text' }, { key: 'amount', type: 'number' }] } },
        defaultLocale: 'en', translations: { en: { 'page.title': 'Insights' }, km: { 'page.title': 'ទិន្នន័យ' } },
      }),
    });

    const result = await validator.validate(file, { key: 'INSIGHTS', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.valid).toBe(true);
  });

  it('rejects arbitrary components and invalid roles', async () => {
    const file = await packageFile({
      'extension.json': JSON.stringify({
        schemaVersion: 1, key: 'INSIGHTS', name: 'Insights', version: '1.0.0', runtimeType: 'DECLARATIVE_MODULE', permissions: [], navigation: [],
        pages: [{ key: 'insights', title: 'Insights', resource: 'insights', roles: ['ROOT'], fields: [], components: [{ type: 'html', source: '<script />' }] }], resources: { insights: { fields: [] } },
      }),
    });

    const result = await validator.validate(file, { key: 'INSIGHTS', runtimeType: 'DECLARATIVE_MODULE' }, '1.0.0');

    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['MODULE_PAGE', 'MODULE_COMPONENT']));
  });
});
