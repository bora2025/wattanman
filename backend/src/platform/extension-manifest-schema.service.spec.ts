import { ExtensionManifestSchemaService } from './extension-manifest-schema.service';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('ExtensionManifestSchemaService', () => {
  const schemas = new ExtensionManifestSchemaService();

  it('accepts a complete theme v1 manifest and approved extension metadata', () => {
    expect(schemas.validate('THEME', {
      schemaVersion: 1,
      key: 'AURORA',
      name: 'Aurora',
      version: '1.0.0',
      runtimeType: 'THEME',
      mode: 'dark',
      tokens: { primaryColor: '#112233', secondaryColor: '#445566', font: 'inter', radius: 'soft' },
      'x-publisher-note': 'supported',
    })).toEqual([]);
  });

  it('rejects wrong types, missing required fields, and unknown properties', () => {
    const errors = schemas.validate('THEME', {
      schemaVersion: '1',
      key: 'bad',
      name: '',
      version: 'latest',
      runtimeType: 'THEME',
      mode: 'animated',
      tokens: {},
      executable: true,
    });

    expect(errors.map((error) => error.keyword)).toEqual(expect.arrayContaining(['const', 'pattern', 'minLength', 'enum', 'required', 'additionalProperties']));
  });

  it('rejects unsupported runtime schema families', () => {
    expect(schemas.validate('CODE_EXTENSION', { schemaVersion: 1 })).toEqual([
      expect.objectContaining({ keyword: 'runtimeType', message: expect.stringContaining('No manifest schema') }),
    ]);
  });

  it.each([
    ['extension-manifest-v1.schema.json', 'f69df753743476c6bf079429336884cac6d203932d84c08b8ffe4ad109eadaeb'],
    ['theme-manifest-v1.schema.json', 'ec6b53c0b25ae136fca7451ee1adc604c6fe8ff21a641311933c790e11b9b666'],
  ])('keeps the frozen v1 schema bytes immutable: %s', (fileName, expectedChecksum) => {
    const contents = readFileSync(join(__dirname, 'schemas', fileName));
    expect(createHash('sha256').update(contents).digest('hex')).toBe(expectedChecksum);
  });
});
