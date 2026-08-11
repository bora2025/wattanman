import { Injectable } from '@nestjs/common';
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ManifestSchemaError {
  instancePath: string;
  keyword: string;
  message: string;
}

@Injectable()
export class ExtensionManifestSchemaService {
  readonly validatorVersion = 'json-schema-draft-2020-12/manifest-v1';
  private readonly validators: Record<string, ValidateFunction>;

  constructor() {
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    this.validators = {
      THEME: ajv.compile(this.schema('theme-manifest-v1.schema.json')),
      DECLARATIVE_MODULE: ajv.compile(this.schema('extension-manifest-v1.schema.json')),
    };
  }

  validate(runtimeType: string, manifest: unknown): ManifestSchemaError[] {
    const validator = this.validators[runtimeType];
    if (!validator) return [{ instancePath: '', keyword: 'runtimeType', message: `No manifest schema is registered for ${runtimeType}` }];
    if (validator(manifest)) return [];
    return (validator.errors || []).map((error: ErrorObject) => ({
      instancePath: error.instancePath || '',
      keyword: error.keyword,
      message: error.message || 'JSON Schema validation failed',
    }));
  }

  private schema(fileName: string) {
    return JSON.parse(readFileSync(join(__dirname, 'schemas', fileName), 'utf8'));
  }
}
